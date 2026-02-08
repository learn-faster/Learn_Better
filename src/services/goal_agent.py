"""
Goal Manifestation Agent (GMA) Implementation using LangGraph.
Orchestrates goal management, planning, and execution monitoring.
"""
from src.utils.logger import logger
import json
import os
from datetime import datetime
from typing import TypedDict, Annotated, List, Literal, Optional, Dict, Any

import operator
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage
from langchain_core.tools import tool

from src.models.agent import AgentState, UserContext, Goal, PlanItem, AgentResponse, SessionState, AgentGuardrail, AgentToolEvent
from src.services.llm_service import llm_service
from src.services.memory_service import memory_service
from src.services.screenshot_service import screenshot_service
from src.services.email_service import email_service
from src.config import settings
from opik import configure, track



# --- Tools Definition ---

@tool
def update_scratchpad(content: str):
    """Updates the agent's persistent scratchpad with new notes/thoughts."""
    memory_service.update_scratchpad(content)
    return "Scratchpad updated."

@tool
def get_scratchpad():
    """Retrieves current scratchpad content."""
    return memory_service.get_scratchpad()

@tool
def save_memory(key: str, value: str, category: str = "fact"):
    """Saves a key-value pair to long-term memory."""
    memory_service.set_memory(key, value, category=category)
    return f"Saved to memory: {key}"

@tool
def search_memory(query: str):
    """Searches long-term semantic memory for relevant info."""
    # This is async in service, need to handle async tool in graph
    # For now, we'll wrap or assume sync execution context if possible, 
    # but LangGraph supports async nodes.
    # We will implement this as a node logic or async tool.
    return "Semantic search not yet fully linked in sync tool." 

@tool
async def take_screenshot(url: str):
    """Takes a screenshot of the given URL to verify progress or state."""
    path = await screenshot_service.capture_url(url)
    return f"Screenshot taken at {path}"

@tool
def send_email_notification(to: str, subject: str, body: str):
    """Sends an email notification to the user."""
    # We need to wrap async call
    # For simplicity in this initial version, we might skip actual sending via tool 
    # and just log, or implement a sync wrapper if needed.
    return f"Email scheduled to {to}: {subject}"



# --- Graph State ---

class GraphState(TypedDict, total=False):
    """State for the LangGraph workflow."""
    messages: Annotated[List[BaseMessage], operator.add]
    agent_state: AgentState
    next_node: str
    tool_call: Optional[Dict[str, Any]]
    tool_events: Annotated[List[AgentToolEvent], operator.add]


# --- Nodes ---

class GoalManifestationAgent:
    def __init__(self):
        if settings.use_opik:
            try:
                if settings.opik_api_key and not os.getenv("OPIK_API_KEY"):
                    os.environ["OPIK_API_KEY"] = settings.opik_api_key
                configure()
            except Exception as e:
                logger.warning(f"Opik configuration failed: {e}")
        self.workflow = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(GraphState)

        workflow.add_node("planner", self.planner_node)
        workflow.add_node("executor", self.executor_node)
        workflow.add_node("analyzer", self.analyzer_node)
        workflow.add_node("user_interface", self.user_interface_node)

        workflow.set_entry_point("planner")

        workflow.add_conditional_edges(
            "planner",
            self.decide_planner_path,
            {
                "execute": "executor",
                "analyze": "analyzer",
                "respond": "user_interface"
            }
        )
        
        workflow.add_edge("executor", "analyzer") # After execution, analyze result
        workflow.add_edge("analyzer", "user_interface") # Report back to user
        workflow.add_edge("user_interface", END)

        return workflow.compile()

    @track
    async def planner_node(self, state: GraphState):
        """
        Analyses the user's request and current state to decide the next step.
        """
        messages = state["messages"]
        agent_state = state["agent_state"]
        scratchpad = memory_service.get_scratchpad(agent_state.user_context.user_id)
        
        # DEBUG: Log incoming messages
        logger.info(f"[AGENT DEBUG] Planner received {len(messages)} messages")
        for i, m in enumerate(messages):
            content_preview = m.content[:100] if hasattr(m, 'content') else str(m)[:100]
            logger.info(f"[AGENT DEBUG] Message {i}: {type(m).__name__} - {content_preview}")
        
        # Prepare System Prompt
        user_email = agent_state.user_context.email
        if user_email:
            user_email_info = f"- User Email: {user_email} (CONFIGURED - you can send emails)"
            email_tool_hint = f"To send an email, use send_email_notification with 'to' set to '{user_email}'."
        else:
            user_email_info = "- User Email: NOT CONFIGURED"
            email_tool_hint = "Email tool unavailable. Ask user to set their email in Global Settings > Notifications."

        biometrics_info = "- Biometrics: DISABLED"
        if agent_state.user_context.use_biometrics:
            try:
                from src.database.orm import SessionLocal
                from src.models.fitbit import FitbitToken
                from src.services.fitbit_service import FitbitService
                db = SessionLocal()
                token = db.query(FitbitToken).filter(FitbitToken.user_id == agent_state.user_context.user_id).first()
                if token:
                    fb_service = FitbitService(token)
                    summary = fb_service.get_biometric_summary(datetime.now().strftime('%Y-%m-%d'))
                    biometrics_info = f"- Biometrics: {summary} (ENABLED)"
                else:
                    biometrics_info = "- Biometrics: ENABLED but no Fitbit token found."
                db.close()
            except Exception as e:
                logger.error(f"Error fetching biometrics: {e}")
                biometrics_info = "- Biometrics: ENABLED but error fetching data."

        goals_summary = "\n".join([f"  - {g.title} ({g.status}, {int(g.progress*100)}%)" for g in agent_state.goals]) if agent_state.goals else "  No active goals."
        
        system_prompt = f"""
        You are the Goal Manifestation Agent (GMA), an AI coach helping users achieve their goals.
        Your personality is encouraging, proactive, and practical.
        
        ===== CURRENT CONTEXT =====
        - Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}
        {user_email_info}
        {biometrics_info}
        - Scratchpad: {scratchpad if scratchpad else '(empty)'}
        - Active Goals:
{goals_summary}
        
        ===== DECISION FRAMEWORK =====
        Choose ONE of the following actions:
        1. 'execute': Use a tool (scratchpad, memory, screenshot, or EMAIL).
        2. 'analyze': Deeply review goal progress or user patterns.
        3. 'respond': Simply chat with the user (no tools needed).
        
        ===== AVAILABLE TOOLS =====
        - update_scratchpad(content: str): Save notes for future reference.
        - save_memory(key: str, value: str, category: str): Store a persistent fact.
        - take_screenshot(url: str): Capture a webpage.
        - send_email_notification(to: str, subject: str, body: str): Send an email.
          {email_tool_hint}
        
        ===== IMPORTANT: TOOL USAGE =====
        If the user asks to "send an email" or similar, you MUST use the 'execute' step with the 'send_email_notification' tool. 
        Do NOT just respond with text saying you'll do it. Actually trigger the tool call.
        
        ===== OUTPUT FORMAT =====
        Respond with a JSON object:
        {{
            "next_step": "execute" | "analyze" | "respond",
            "reasoning": "Brief explanation of your choice",
            "tool_call": {{ "name": "tool_name", "args": {{...}} }} // Only if next_step is 'execute'
        }}
        """
        
        # Convert LangChain messages to list[dict] for LLMService
        llm_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            if isinstance(m, BaseMessage):
                llm_messages.append({"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content})
            elif isinstance(m, dict):
                llm_messages.append(m)

        response = await llm_service.get_chat_completion(
            messages=llm_messages,
            response_format="json",
            config=agent_state.llm_config
        )
        
        # DEBUG: Log LLM response
        logger.info(f"[AGENT DEBUG] Planner LLM raw response: {response[:500] if response else 'None'}...")
        
        try:
            plan = json.loads(response)
            next_node = plan.get("next_step", "respond")
            tool_call = plan.get("tool_call")
            logger.info(f"[AGENT DEBUG] Planner decision: next_step={next_node}, tool_call={tool_call}")
            
            return {
                "next_node": next_node,
                "tool_call": tool_call if next_node == "execute" else None
            }
        except:
            logger.error(f"Failed to parse planner output: {response}")
            return {"next_node": "respond"}

    @track
    async def executor_node(self, state: GraphState):
        """
        Executes the tool call determined by the planner.
        """
        tool_call = state.get("tool_call")
        result_msg = "No action taken."
        
        tool_events: List[AgentToolEvent] = []

        if tool_call:
            name = tool_call.get("name")
            args = tool_call.get("args", {})
            user_id = state["agent_state"].user_context.user_id
            
            try:
                if name == "update_scratchpad":
                    memory_service.update_scratchpad(args.get("content", ""), user_id)
                    result_msg = "Scratchpad updated."
                    tool_events.append(AgentToolEvent(type="scratchpad", status="success", payload={"content": args.get("content", "")}))
                    
                elif name == "save_memory":
                    memory_service.set_memory(
                        args.get("key"), 
                        args.get("value"), 
                        user_id, 
                        category=args.get("category", "fact")
                    )
                    result_msg = f"Saved memory: {args.get('key')}"
                    tool_events.append(AgentToolEvent(type="memory", status="success", payload={"key": args.get("key")}))
                    
                elif name == "take_screenshot":
                    url = args.get("url")
                    path = await screenshot_service.capture_url(url)
                    
                    if path:
                        # Convert absolute/relative path to URL/Markdown
                        filename = os.path.basename(path)
                        result_msg = f"Screenshot captured: ![screenshot](/screenshots/{filename})"
                        memory_service.save_episodic_memory(
                            summary="Screenshot captured",
                            user_id=user_id,
                            context={"url": url, "filename": filename},
                            tags=["screenshot", "proof_of_work"]
                        )
                        tool_events.append(AgentToolEvent(type="screenshot", status="success", payload={"url": url, "image_url": f"/screenshots/{filename}"}))
                    else:
                        result_msg = f"Failed to capture screenshot of {url}"
                        tool_events.append(AgentToolEvent(type="screenshot", status="error", payload={"url": url}))
                    
                elif name == "send_email_notification":
                    # Use the email service with user's API key
                    await email_service.send_email(
                        to_email=args.get("to"),
                        subject=args.get("subject"),
                        html_content=args.get("body"),
                        api_key=state["agent_state"].user_context.resend_api_key
                    )
                    result_msg = f"Email sent to {args.get('to')}"
                    memory_service.save_episodic_memory(
                        summary="Agent sent an email",
                        user_id=user_id,
                        context={"to": args.get("to"), "subject": args.get("subject")},
                        tags=["email"]
                    )
                    tool_events.append(AgentToolEvent(type="email", status="success", payload={"to": args.get("to"), "subject": args.get("subject")}))
                else:
                    result_msg = f"Unknown tool: {name}"
                    tool_events.append(AgentToolEvent(type=name or "tool", status="error", payload={"error": "Unknown tool"}))
            except Exception as e:
                logger.error(f"Tool execution failed: {e}")
                result_msg = f"Error executing {name}: {e}"
                tool_events.append(AgentToolEvent(type=name or "tool", status="error", payload={"error": str(e)}))
                
        return {"messages": [AIMessage(content=f"[Action Result]: {result_msg}")], "tool_events": tool_events}

    @track
    async def analyzer_node(self, state: GraphState):
        """
        Analyzes the result of execution.
        """
        # We could add more logic here to update the Goal objects in the state
        # For now, just pass through
        return {"messages": []} # No new message, just state update if we had it

    @track
    async def user_interface_node(self, state: GraphState):
        """
        Generates the final response to the user.
        """
        messages = state["messages"]
        agent_state = state["agent_state"]
        
        # DEBUG: Log state entering user_interface
        logger.info(f"[AGENT DEBUG] user_interface_node received {len(messages)} messages")
        
        # Prepare context for the final response
        scratchpad = memory_service.get_scratchpad(agent_state.user_context.user_id)
        
        pass_through_messages = []
        for m in messages:
             if isinstance(m, BaseMessage):
                pass_through_messages.append({"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content})
             else:
                pass_through_messages.append(m)
        
        # DEBUG: Log pass_through_messages
        logger.info(f"[AGENT DEBUG] user_interface pass_through_messages: {len(pass_through_messages)}")
        for i, pm in enumerate(pass_through_messages):
            logger.info(f"[AGENT DEBUG] pass_through[{i}]: role={pm.get('role')}, content={pm.get('content', '')[:100]}...")
        
        # Add system instruction for personality
        system_instruction = {
            "role": "system", 
            "content": f"""You are the Goal Manifestation Agent. 
            Be helpful, encouraging, and focused on helping the user {agent_state.user_context.name} achieve their goals.
            Reference the scratchpad or tools used if relevant.
            Scratchpad: {scratchpad}
            """
        }
        
        final_messages = [system_instruction] + pass_through_messages
        
        logger.info(f"[AGENT DEBUG] Calling LLM for final response with {len(final_messages)} messages")
        
        final_response = await llm_service.get_chat_completion(
            messages=final_messages,
            config=agent_state.llm_config
        )
        
        logger.info(f"[AGENT DEBUG] user_interface LLM response: {final_response[:300] if final_response else 'None'}...")
        
        return {"messages": [AIMessage(content=final_response)]}

    def decide_planner_path(self, state: GraphState):
        # Return the next_node string directly
        return state.get("next_node", "respond")

    async def _classify_guardrail(self, message: str, llm_config=None, mode: str = "soft") -> AgentGuardrail:
        system_prompt = (
            "You are a guardrail classifier for a learning goal assistant. "
            "Classify the user message into one of: in_domain, adjacent, out_of_domain. "
            "The assistant only handles learning goals, study planning, routines, productivity, "
            "goal tracking, wellness tied to learning, and accountability. "
            "Return JSON with keys: status, rationale, suggested_actions (list)."
        )
        try:
            response = await llm_service.get_chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                response_format="json",
                config=llm_config
            )
            data = llm_service._extract_and_parse_json(response)
            return AgentGuardrail(
                status=data.get("status", "in_domain"),
                rationale=data.get("rationale"),
                suggested_actions=data.get("suggested_actions", [
                    "Plan today’s study block",
                    "Update my goals",
                    "Review my progress"
                ])
            )
        except Exception as e:
            logger.warning(f"Guardrail classifier failed: {e}")
            return AgentGuardrail(
                status="in_domain",
                rationale=None,
                suggested_actions=[
                    "Plan today’s study block",
                    "Update my goals",
                    "Review my progress"
                ]
            )

    @track
    async def process_message(self, user_id: str, message: str) -> Dict[str, Any]:
        """
        Main entry point.
        """
        from src.database.orm import SessionLocal
        from src.models.orm import UserSettings, Goal as GoalORM
        from src.models.agent import AgentLLMConfig

        # Load State from DB
        db = SessionLocal()
        try:
            # Load settings
            user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
            llm_config = None
            vision_llm_config = None
            guardrail_mode = "soft"
            if user_settings and user_settings.llm_config:
                agent_llm = user_settings.llm_config.get("agent_llm")
                if agent_llm:
                    llm_config = AgentLLMConfig(**agent_llm)
                agent_settings = user_settings.llm_config.get("agent_settings", {})
                if agent_settings:
                    if agent_settings.get("vision_llm_config"):
                        vision_llm_config = AgentLLMConfig(**agent_settings.get("vision_llm_config"))
                    guardrail_mode = agent_settings.get("guardrail_mode", "soft")
            
            # Load goals
            goals_orm = db.query(GoalORM).filter(GoalORM.user_id == user_id).all()
            goals = [Goal(
                id=g.id,
                title=g.title,
                description=g.description,
                status=g.status if g.status in ["pending", "active", "completed", "failed"] else "pending",
                deadline=g.deadline,
                priority=g.priority,
                progress=g.logged_hours / g.target_hours if g.target_hours > 0 else 0
            ) for g in goals_orm]

            initial_state = AgentState(
                user_context=UserContext(
                    user_id=user_id, 
                    name="User",
                    email=user_settings.email if user_settings else None,
                    resend_api_key=user_settings.resend_api_key if user_settings else None,
                    use_biometrics=user_settings.use_biometrics if user_settings else False
                ),
                llm_config=llm_config,
                goals=goals
            )
        finally:
            db.close()

        # Guardrail classification
        guardrail = await self._classify_guardrail(message, llm_config, mode=guardrail_mode)
        if guardrail.status == "out_of_domain":
            response_text = (
                "I’m focused on your learning goals and routines. "
                "If you want, I can help plan your study session, update goals, or review progress."
            )
            if guardrail_mode == "hard":
                response_text = "I can’t help with that request. I’m focused on your learning goals and routines."
            memory_service.save_chat_message("user", message, user_id)
            memory_service.save_chat_message("assistant", response_text, user_id)
            return {
                "message": response_text,
                "tool_events": [],
                "suggested_actions": guardrail.suggested_actions,
                "guardrail": guardrail
            }
        
        # Load previous chat history
        history = memory_service.get_chat_history(user_id, limit=10)
        history_messages = []
        for msg in history:
            if msg.get("role") == "user":
                history_messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                history_messages.append(AIMessage(content=msg.get("content", "")))
        
        # Add current user message
        history_messages.append(HumanMessage(content=message))
        
        # Initial Graph State
        inputs = {
            "messages": history_messages,
            "agent_state": initial_state,
            "next_node": "planner",
            "tool_call": None,
            "tool_events": []
        }
        
        # Run
        try:
            result = await self.workflow.ainvoke(inputs)
            
            # Extract last AI message
            messages = result["messages"]
            response_text = "I'm not sure what to say."
            for m in reversed(messages):
                if isinstance(m, AIMessage):
                    response_text = m.content
                    break
            
            # Save conversation to history
            memory_service.save_chat_message("user", message, user_id)
            memory_service.save_chat_message("assistant", response_text, user_id)
            
            return {
                "message": response_text,
                "tool_events": result.get("tool_events", []),
                "suggested_actions": guardrail.suggested_actions,
                "guardrail": guardrail
            }
            
        except Exception as e:
            logger.error(f"Agent execution failed: {e}")
            return {
                "message": f"I encountered an error: {e}",
                "tool_events": [],
                "suggested_actions": guardrail.suggested_actions,
                "guardrail": guardrail
            }

# Singleton
goal_agent = GoalManifestationAgent()
