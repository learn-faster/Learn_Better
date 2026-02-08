```markdown
# Technical Specification: Goal Manifestation Agent (GMA)

## 1. Vision & Core Purpose
The Goal Manifestation Agent is a persistent, empathetic AI companion designed to reduce the cognitive load of goal management. It acts as a "Personal Guidance Teacher," leveraging long-term memory, biometric data, and proactive intervention to ensure users stay aligned with their short, medium, and long-term objectives.

## 2. Core Objectives
*   **Autonomous Scheduling**: Dynamically optimize daily routines based on user goals, sleep patterns, and productivity rhythms.
*   **Proactive Accountability**: Use multi-channel nudges and a "Proof of Work" screenshot system to ensure execution.
*   **Adaptive Negotiation**: Reschedule tasks empathetically when the user is overwhelmed, while maintaining progress toward deadlines.
*   **Insight Generation**: Analyze Fitbit and activity data to identify friction points and peak performance windows.

## 3. Technical Stack
*   **Orchestration**: [LangGraph](https://langchain-ai.github.io/langgraph/) (for stateful, multi-turn agentic workflows).
*   **Observability**: [Opik](https://www.comet.com/docs/opik/) (for tracing, evaluation, and production monitoring).
*   **Data Validation**: [Pydantic](https://docs.pydantic.dev/) (for structured state management and tool schemas).
*   **Memory**: Vector Database (Semantic) + Relational DB (Episodic/Structured).
*   **Integrations**: Fitbit API, SendGrid/SMTP (Email), OS-level Screenshot Utility.

## 4. Agent Architecture & Memory
### A. Memory Layers (Pydantic Models)
*   **Episodic**: Log of daily activities, completed tasks, and missed sessions.
*   **Semantic**: Learned user preferences (e.g., "Productive at 9 PM," "Responds well to streaks").
*   **Procedural**: Strategies that successfully motivated the user in the past.

### B. State Management (LangGraph)
The agent operates on a shared state containing:
*   `user_profile`: Timezone, sleep schedule, and biometric baseline.
*   `goal_hierarchy`: Short (days), Medium (weeks), and Long-term (months/years) targets.
*   `current_context`: Active session status, current time, and recent screenshots.

## 5. Tooling & Capabilities
### Tool 1: Proof-of-Work (Screenshot System)
*   **Trigger**: Activated only during an active "Focus Session."
*   **Logic**: Randomly captures $N$ screenshots (default: 5, user-configurable).
*   **Analysis**: Vision LLM processes images to verify if the user is on-task.
*   **Penalty**: If failure rate > 50%, the agent applies a "penalty" (e.g., increased frequency next session, stricter scheduling).

### Tool 2: Biometric Integration (Fitbit)
*   **Data**: Sleep stages, heart rate variability (HRV), and activity levels.
*   **Usage**: Adjusts schedule intensity. (e.g., "Poor sleep detected: Shifting deep work to 11 AM, making tonight's session light.")

### Tool 3: Communication (Email & Web)
*   **Email**: Weekly progress reports and "Pattern Interrupt" alerts for 3+ day streaks at risk.
*   **Web**: Global availability via a persistent floating widget for real-time chat and nudges.

## 6. Interaction Logic
| Scenario | Agent Action |
| :--- | :--- |
| **Morning Brief** | Synthesize goals into a realistic daily plan based on sleep data. |
| **Negotiation** | If a user misses a goal, negotiate a "catch-up" plan for the next day. |
| **Friction Detection** | Identify if a specific goal (e.g., "ML Chapter 7") is causing avoidance and suggest smaller chunks. |
| **Celebration** | Trigger high-enthusiasm feedback for milestones and streak maintenance. |

## 7. Implementation Roadmap
### Phase 1: Foundation
*   Define Pydantic schemas for `Goal`, `UserContext`, and `Session`.
*   Implement LangGraph nodes for "Planner," "Executor," and "Analyzer."
*   Basic CRUD for goal management.

### Phase 2: Accountability Tools
*   Develop the random screenshot tool and Vision LLM evaluation pipeline.
*   Integrate Fitbit API for basic sleep/activity data consumption.

### Phase 3: Intelligence & Memory
*   Implement Opik for tracing agent decisions and refining prompts.
*   Build the "Negotiation" logic to handle missed goals without guilt-tripping.

### Phase 4: Multi-Channel Presence
*   Deploy the global web widget.
*   Configure automated email digests and escalation triggers.
```
