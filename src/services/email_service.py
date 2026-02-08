"""
Email Service for Agent Notifications.
Uses Resend (free tier: 100 emails/day) for sending goal reminders,
streak alerts, quiz prompts, and weekly digests.
"""
import os
from typing import Optional, List
from datetime import datetime
import httpx
from src.utils.logger import logger
from src.config import settings

class EmailService:
    """
    Service for sending agent emails to users.
    Uses Resend API (https://resend.com) - free tier allows 100 emails/day.

    Setup:
        1. Sign up at https://resend.com
        2. Get your API key from the dashboard
        3. Set RESEND_API_KEY environment variable
        4. Set RESEND_FROM_EMAIL (requires verified domain or use onboarding@resend.dev)
        5. Optionally set FRONTEND_URL (defaults to http://localhost:5173)
    """

    def __init__(self):
        self.api_key = os.getenv("RESEND_API_KEY")
        self.from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
        self.enabled = bool(self.api_key)
        # Use frontend_url from settings, fallback to localhost
        self.frontend_url = settings.frontend_url or os.getenv("FRONTEND_URL", "http://localhost:5173")
        # Ensure no trailing slash
        self.frontend_url = self.frontend_url.rstrip("/")
        
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        api_key: Optional[str] = None,
        reply_to: Optional[str] = None
    ) -> bool:
        """
        Sends an email via Resend API.
        
        Returns:
            bool: True if email sent successfully, False otherwise.
        """
        # Use provided API key or fallback to default
        key_to_use = api_key or self.api_key
        
        if not key_to_use:
            logger.warning(f"[EmailService] No API key — would send: {subject} to {to_email}")
            return False
            
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {key_to_use}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": self.from_email,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_content,
                        "text": text_content,
                        "reply_to": reply_to
                    }
                )
                if response.status_code == 200:
                    logger.info(f"[EmailService] Sent: {subject}")
                    return True
                else:
                    logger.error(f"[EmailService] Failed: {response.text}")
                    return False
        except Exception as e:
            logger.error(f"[EmailService] Error: {e}")
            return False
    
    # ========== Agent Email Templates ==========
    
    async def send_streak_alert(self, to_email: str, streak_days: int, api_key: Optional[str] = None) -> bool:
        """Sends a streak protection alert."""
        subject = f"🔥 Your {streak_days}-day streak is at risk!"
        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Hey there! 👋</h2>
            <p>You've built an amazing <strong>{streak_days}-day streak</strong> — don't let it slip!</p>
            <p>Even a quick 5-minute review can keep the momentum going.</p>
            <div style="margin: 24px 0;">
                <a href="{self.frontend_url}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
                    Save Your Streak →
                </a>
            </div>
            <p style="color:#888;">— Your Learning Agent</p>
        </div>
        """
        return await self.send_email(to_email, subject, html, api_key=api_key)
    
    async def send_goal_reminder(
        self, 
        to_email: str, 
        goal_title: str, 
        hours_behind: float,
        days_left: int,
        api_key: Optional[str] = None
    ) -> bool:
        """Sends a goal progress reminder."""
        hours_per_day = hours_behind / max(1, days_left)
        subject = f"📊 Goal Update: {goal_title}"
        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Progress Check: {goal_title}</h2>
            <p>You're <strong>{hours_behind:.1f} hours behind</strong> your target pace.</p>
            <p>With <strong>{days_left} days</strong> left, you need about <strong>{hours_per_day:.1f} extra hours/day</strong> to catch up.</p>
            <p>Don't worry — even small sessions add up. Ready to log some time?</p>
            <div style="margin: 24px 0;">
                <a href="{self.frontend_url}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
                    Work on This Goal →
                </a>
            </div>
            <p style="color:#888;">— Your Learning Agent</p>
        </div>
        """
        return await self.send_email(to_email, subject, html, api_key=api_key)
    
    async def send_daily_quiz(
        self,
        to_email: str,
        cards_due: int,
        sample_question: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> bool:
        """Sends a daily flashcard review prompt."""
        subject = f"🧠 {cards_due} cards due for review today"
        preview = f"<p style='background:#f3f4f6;padding:12px;border-radius:8px;'><em>Preview: {sample_question}</em></p>" if sample_question else ""
        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Time for a quick review! 🎯</h2>
            <p>You have <strong>{cards_due} flashcards</strong> due today.</p>
            {preview}
            <p>Reviewing now helps cement these concepts in long-term memory.</p>
            <div style="margin: 24px 0;">
                <a href="{self.frontend_url}/study" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
                    Start Review →
                </a>
            </div>
            <p style="color:#888;">— Your Learning Agent</p>
        </div>
        """
        return await self.send_email(to_email, subject, html, api_key=api_key)
    
    async def send_weekly_digest(
        self,
        to_email: str,
        hours_logged: float,
        cards_reviewed: int,
        streak: int,
        goals_summary: List[dict],
        curriculum_summary: Optional[List[dict]] = None,
        api_key: Optional[str] = None
    ) -> bool:
        """Sends a weekly progress digest."""
        subject = f"📈 Your Week in Review: {hours_logged:.1f}h logged"
        
        goals_html = ""
        for g in goals_summary[:3]:
            progress = g.get("progress", 0)
            title = g.get("title", "Unknown")
            goals_html += f"<li><strong>{title}</strong>: {progress:.0f}% complete</li>"
        
        if not goals_html:
            goals_html = "<li>No active goals yet. Create one to start tracking!</li>"
        
        curriculum_html = ""
        if curriculum_summary:
            rows = ""
            for c in curriculum_summary[:3]:
                title = c.get("title", "Curriculum")
                progress = c.get("progress", 0)
                next_cp = c.get("next_checkpoint", "—")
                due = c.get("next_due", "—")
                rows += f"""
                <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
                        <div style="font-weight:600;color:#111827;">{title}</div>
                        <div style="font-size:12px;color:#6b7280;">Next: {next_cp} · {due}</div>
                    </td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#4f46e5;">
                        {progress:.0f}%
                    </td>
                </tr>
                """
            curriculum_html = f"""
            <h3 style="margin-top:24px;">Curriculum Progress</h3>
            <table style="width:100%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f9fafb;">
                        <th style="text-align:left;padding:10px 12px;font-size:12px;color:#6b7280;">Plan</th>
                        <th style="text-align:right;padding:10px 12px;font-size:12px;color:#6b7280;">Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
            """

        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Weekly Learning Digest 📚</h2>
            <table style="width:100%;text-align:center;margin:24px 0;">
                <tr>
                    <td style="padding:12px;">
                        <div style="font-size:24px;font-weight:bold;color:#6366f1;">{hours_logged:.1f}h</div>
                        <div style="color:#888;">Logged</div>
                    </td>
                    <td style="padding:12px;">
                        <div style="font-size:24px;font-weight:bold;color:#10b981;">{cards_reviewed}</div>
                        <div style="color:#888;">Cards Reviewed</div>
                    </td>
                    <td style="padding:12px;">
                        <div style="font-size:24px;font-weight:bold;color:#f59e0b;">{streak} days</div>
                        <div style="color:#888;">Streak</div>
                    </td>
                </tr>
            </table>
            <h3>Goals Progress</h3>
            <ul>{goals_html}</ul>
            {curriculum_html}
            <p>Keep up the great work! 💪</p>
            <div style="margin: 24px 0;">
                <a href="{self.frontend_url}/analytics" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
                    View Full Analytics →
                </a>
            </div>
            <p style="color:#888;">— Your Learning Agent</p>
        </div>
        """
        return await self.send_email(to_email, subject, html, api_key=api_key)


# Singleton
email_service = EmailService()
