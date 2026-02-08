import asyncio
from datetime import datetime, timedelta, time
from typing import Optional
from zoneinfo import ZoneInfo

from src.database.orm import SessionLocal
from src.models.orm import UserSettings
from src.services.weekly_digest_service import send_weekly_digest_for_user
from src.services.email_service import email_service
from src.utils.logger import logger


def _next_run_utc(day_of_week: int, hour: int, minute: int) -> datetime:
    """
    Compute next run datetime in UTC.
    day_of_week: 0=Mon ... 6=Sun
    """
    now = datetime.utcnow()
    days_ahead = (day_of_week - now.weekday()) % 7
    target = datetime(
        year=now.year,
        month=now.month,
        day=now.day,
        hour=hour,
        minute=minute,
        second=0,
        microsecond=0
    )
    if days_ahead == 0 and target <= now:
        days_ahead = 7
    return target + timedelta(days=days_ahead)


async def run_weekly_digest_scheduler(day_of_week: int, hour: int, minute: int, stop_event: asyncio.Event):
    """
    Periodically send weekly digests to users with email_weekly_digest enabled.
    Uses per-user timezone and schedule if present; falls back to defaults.
    """
    while not stop_event.is_set():
        try:
            db = SessionLocal()
            settings_rows = db.query(UserSettings).filter(
                UserSettings.email.isnot(None),
                UserSettings.email_weekly_digest == True
            ).all()

            sent = 0
            utc_now = datetime.utcnow()

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

                    user_day = user_settings.weekly_digest_day if user_settings.weekly_digest_day is not None else day_of_week
                    user_hour = user_settings.weekly_digest_hour if user_settings.weekly_digest_hour is not None else hour
                    user_minute = user_settings.weekly_digest_minute if user_settings.weekly_digest_minute is not None else minute

                    if local_now.weekday() != user_day:
                        continue
                    if local_now.hour != user_hour or local_now.minute != user_minute:
                        continue

                    # Check last sent (avoid duplicates in same week)
                    last_sent = user_settings.weekly_digest_last_sent_at
                    if last_sent:
                        last_sent_local = last_sent.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
                        start_of_week = local_now - timedelta(days=local_now.weekday())
                        start_of_week = datetime.combine(start_of_week.date(), time.min, tzinfo=tz)
                        if last_sent_local >= start_of_week:
                            continue

                    ok = await send_weekly_digest_for_user(db, user_settings)
                    if ok:
                        user_settings.weekly_digest_last_sent_at = utc_now
                        sent += 1
                except Exception as e:
                    logger.error(f"[WeeklyDigestScheduler] Failed for {user_settings.email}: {e}")

            if sent > 0:
                db.commit()
                logger.info(f"[WeeklyDigestScheduler] Run completed. Sent: {sent}")
            else:
                logger.debug("[WeeklyDigestScheduler] Run completed. Sent: 0")
        except Exception as e:
            logger.error(f"[WeeklyDigestScheduler] Error during digest run: {e}")
        finally:
            try:
                db.close()
            except Exception:
                pass

        # Check every minute
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass
