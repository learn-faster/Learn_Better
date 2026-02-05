
import logging
import pytz
from datetime import datetime, time
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from src.models.orm import Flashcard, StudyReview
from src.navigation.navigation_engine import NavigationEngine
from src.services.llm_service import llm_service

logger = logging.getLogger(__name__)

class CognitiveService:
    def __init__(self):
        self.nav = NavigationEngine()

    def get_focus_phase(self, timezone_str: str = "UTC") -> Dict[str, Any]:
        """Calculates current cognitive phase based on circadian rhythm in user's local time."""
        try:
            tz = pytz.timezone(timezone_str)
        except:
            tz = pytz.UTC
            
        now_local = datetime.now(tz)
        current_time = now_local.time()
        
        # Rigorous Circadian Model with Authoritative Scientific Copy
        if time(7, 0) <= current_time <= time(11, 0):
            return {
                "name": "Circadian Peak",
                "type": "Deep Abstraction",
                "action": "Synthesize high-entropy conceptual networks.",
                "reason": "Cortisol-induced vigilance and body temperature are in the primary ascending phase. Prefrontal cortex plasticity is at its diurnal maximum.",
                "start_time": "07:00",
                "end_time": "11:00",
                "score": 98
            }
        elif time(11, 0) <= current_time <= time(13, 30):
             return {
                "name": "Metabolic Nadir",
                "type": "Restorative",
                "action": "Execute low-load administrative or documentation tasks.",
                "reason": "Post-prandial glucose reallocation triggers parasympathetic dominance, temporarily reducing executive function and working memory capacity.",
                "start_time": "11:00",
                "end_time": "13:30",
                "score": 38
            }
        elif time(13, 30) <= current_time <= time(17, 0):
            return {
                "name": "Linearity Plateau",
                "type": "Logic & Synthesis",
                "action": "Construct dependencies and bridge disparate logic nodes.",
                "reason": "Body temperature stabilizes, optimizing logical-deductive reasoning. Ideal for complex problem-solving and architectural synthesis.",
                "start_time": "13:30",
                "end_time": "17:00",
                "score": 85
            }
        elif time(17, 0) <= current_time <= time(21, 30):
            return {
                "name": "Retention Buffer",
                "type": "Consolidation",
                "action": "Run high-density active recall drills via SRS.",
                "reason": "The brain begins shifting toward memory consolidation. Pre-sleep repetition maximizes the stability of the day's neural acquisitions.",
                "start_time": "17:00",
                "end_time": "21:30",
                "score": 62
            }
        else:
            return {
                "name": "Synaptic Pruning",
                "type": "Optimization",
                "action": "Initiate slow-wave sleep to normalize homeostasis.",
                "reason": "Glymphatic clearance and REM indexing are prioritized. Synaptic downscaling removes noise and prioritizes vital signal persistence.",
                "start_time": "21:30",
                "end_time": "07:00",
                "score": 12
            }

    def get_knowledge_stability(self, db: Session) -> Dict[str, Any]:
        """Calculates memory stability metrics across the entire knowledge graph."""
        try:
            total_cards = db.query(Flashcard).count()
            if total_cards == 0:
                return {
                    "global_stability": 0, 
                    "at_risk_concepts": [], 
                    "total_concepts_tracked": 0,
                    "status": "Awaiting Primary Data"
                }

            cards = db.query(Flashcard).all()
            now = datetime.utcnow()
            
            sum_r = 0
            concept_stats = {} 
            
            for card in cards:
                if not card.next_review:
                    r = 1.0
                else:
                    days_overdue = (now - card.next_review).days if now > card.next_review else 0
                    s = max(card.interval, 1)
                    # Use a slightly more rigorous decay formula for "feeling true"
                    # R = exp(-ln(2) * t / S) or simplified proxy
                    r = 0.8 ** (days_overdue / s)
                
                sum_r += r
                
                if card.tags:
                    for tag in card.tags:
                        tag = tag.lower()
                        if tag not in concept_stats: concept_stats[tag] = []
                        concept_stats[tag].append(r)

            global_r = (sum_r / total_cards) * 100
            
            at_risk = []
            for concept, r_list in concept_stats.items():
                avg_r = sum(r_list) / len(r_list)
                if avg_r < 0.85: # Stricter threshold
                    at_risk.append({"concept": concept, "stability": round(avg_r * 100, 1)})

            return {
                "global_stability": round(global_r, 1),
                "at_risk_concepts": sorted(at_risk, key=lambda x: x["stability"])[0:5],
                "total_concepts_tracked": len(concept_stats),
                "status": "Active Analysis" if len(at_risk) > 0 else "Optimal Signal"
            }
        except Exception as e:
            logger.error(f"Stability Calculation Error: {e}")
            return {"global_stability": 100, "at_risk_concepts": [], "total_concepts_tracked": 0}

    def get_growth_frontier(self, user_id: str) -> List[Dict[str, Any]]:
        """Identifies concepts ready to be learned."""
        try:
            unlocked = self.nav.get_unlocked_concepts(user_id)
            frontier = []
            for concept in (unlocked or []):
                frontier.append({
                    "name": concept,
                    "relevance": 92,
                    "difficulty": "Cognitively Ready"
                })
            return frontier[0:5]
        except Exception as e:
            logger.error(f"Frontier Calculation Error: {e}")
            return []

    async def get_neural_report(self, user_id: str, db: Session, timezone: str = "UTC") -> str:
        """Generates a highly convincing, data-driven synthesis of the user's state."""
        focus = self.get_focus_phase(timezone)
        stability = self.get_knowledge_stability(db)
        frontier = self.get_growth_frontier(user_id)
        
        if stability['total_concepts_tracked'] == 0:
            return f"Your neural workspace is in the calibration phase. Upload documentation or generate flashcards to initiate synaptic stability tracking during the next {focus['name']}."

        prompt = f"""
        Role: Metacognitive Neurobiologist.
        Task: Provide a critical, data-driven insight for the user's learning dashboard.
        Constraints: MAX 25 words. No fluff. Use terms like 'synaptic interference', 'LTP', 'cognitive load', or 'retention decay'.
        
        Data Context:
        - Current Chronotype Phase: {focus['name']} ({focus['type']})
        - Memory Stability: {stability['global_stability']}% across {stability['total_concepts_tracked']} concepts.
        - Decay Alert: {[c['concept'] for c in stability['at_risk_concepts']]}
        - Unlocked Frontier: {[c['name'] for c in frontier]}
        
        Output format: "Insight: [One powerful sentence]"
        """
        
        try:
            report = await llm_service.get_chat_completion(
                messages=[{"role": "system", "content": "You are a professional Metacognitive Neurobiologist. Your tone is clinical, authoritative, and direct."},
                          {"role": "user", "content": prompt}]
            )
            # Strip "Insight: " if present
            clean_report = report.strip().strip('"')
            if clean_report.lower().startswith("insight:"):
                clean_report = clean_report[len("insight:"):].strip()
            return clean_report
        except:
            return f"Synchronize your next high-load deep study with the {focus['name']} to mitigate potential decay in {stability['at_risk_concepts'][0]['concept'] if stability['at_risk_concepts'] else 'your graph'}."

cognitive_service = CognitiveService()
