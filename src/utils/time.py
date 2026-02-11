"""Time utilities for consistent UTC timestamps."""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return timezone-aware current UTC time."""
    return datetime.now(timezone.utc)
