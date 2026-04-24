"""Datetime utilities for consistent timezone handling."""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current UTC datetime (timezone-naive for DB compatibility)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def isoformat(dt: datetime | None) -> str | None:
    """Convert a datetime to ISO 8601 format with Z suffix."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"
