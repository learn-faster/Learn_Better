import asyncio
import os
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from src.database.orm import SessionLocal
from src.models.orm import UserSettings, DailyPlanEntry, Goal, AgentEmailMessage
from src.services.email_service import email_service
from src.utils.logger import logger
from src.config import settings
import uuid


def _parse_bedtime(bedtime: str) -> time:
    try:
        parts = bedtime.split(":")
        return time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        return time(hour=22, minute=0)


async def run_negotiation_scheduler(stop_event: asyncio.Event):
    """
    Sends negotiation emails at user bedtime when daily plan is incomplete.
    """
    while not stop_event.is_set():
        try:
            db = SessionLocal()
            settings_rows = db.query(UserSettings).filter(
                UserSettings.email.isnot(None),
                UserSettings.email_negotiation_enabled == True
            ).all()

            utc_now = datetime.utcnow()
            sent = 0

            for user_settings in settings_rows:
                try:
                    if not email_service.enabled and not user_settings.resend_api_key:
                        continue

                    tz_name = user_settings.timezone or "UTC"
                    try:
                        tz = ZoneInfo(tz_name)
                    except Exception:
                        tz = ZoneInfo("UTC")

                    local_now = utc_now.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
                    bedtime = _parse_bedtime(user_settings.bedtime or "22:00")

                    if local_now.hour != bedtime.hour or local_now.minute != bedtime.minute:
                        continue

                    # Avoid duplicate send in same local day
                    last_sent = user_settings.email_negotiation_last_sent_at
                    if last_sent:
                        last_local = last_sent.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
                        if last_local.date() == local_now.date():
                            continue

                    today = local_now.date()
                    entries = db.query(DailyPlanEntry).filter(
                        DailyPlanEntry.user_id == user_settings.user_id,
                        DailyPlanEntry.date == today
                    ).all()

                    if not entries:
                        continue

                    incomplete = [e for e in entries if not e.completed]
                    if not incomplete:
                        continue

                    # Pull top goal to reference
                    goals = db.query(Goal).filter(Goal.user_id == user_settings.user_id, Goal.status == "active").order_by(Goal.priority.asc()).all()
                    top_goal = goals[0].title if goals else "your short-term goal"

                    items_preview = ", ".join([e.title for e in incomplete[:2]])
                    subject = "Quick check-in before sleep"
                    html = f"""
                    <p>Quick check‑in before sleep.</p>
                    <p>You still have <strong>{len(incomplete)}</strong> items left: {items_preview}.</p>
                    <p>If you complete this today, you’ll be closer to <strong>{top_goal}</strong>. If not, I may need to add a day or two to keep the plan realistic.</p>
                    <p>If you finish it tonight, I’ll lighten tomorrow’s load.</p>
                    <p>Reply to this email with what you can finish and I’ll adjust tomorrow’s load.</p>
                    """

                    reply_domain = user_settings.resend_reply_domain or settings.email_reply_domain or os.getenv("RESEND_REPLY_DOMAIN")
                    reply_to = f"agent+{user_settings.user_id}@{reply_domain}" if reply_domain else None
                    ok = await email_service.send_email(
                        to_email=user_settings.email,
                        subject=subject,
                        html_content=html,
                        api_key=user_settings.resend_api_key,
                        reply_to=reply_to
                    )

                    user_settings.email_negotiation_last_sent_at = utc_now
                    sent += 1

                    db.add(AgentEmailMessage(
                        id=str(uuid.uuid4()),
                        user_id=user_settings.user_id,
                        direction="outbound",
                        thread_id=None,
                        subject=subject,
                        from_email=None,
                        to_email=user_settings.email,
                        body_text=html,
                        metadata_={"sent": ok, "type": "negotiation"}
                    ))
                except Exception as e:
                    logger.error(f"[NegotiationScheduler] Failed for {user_settings.email}: {e}")

            if sent > 0:
                db.commit()
                logger.info(f"[NegotiationScheduler] Run completed. Sent: {sent}")
            else:
                logger.debug("[NegotiationScheduler] Run completed. Sent: 0")
        except Exception as e:
            logger.error(f"[NegotiationScheduler] Error during run: {e}")
        finally:
            try:
                db.close()
            except Exception:
                pass

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass
