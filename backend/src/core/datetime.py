from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

# Vietnam timezone is UTC+7 (Indochina Time)
VIETNAM_TZ = timezone(timedelta(hours=7))

def get_now_vn() -> datetime:
    """Get the current time in Vietnam Time (ICT, UTC+7)."""
    return datetime.now(timezone.utc).astimezone(VIETNAM_TZ)

def get_today_vn():
    """Get today's date in Vietnam Time (ICT, UTC+7)."""
    return get_now_vn().date()

def parse_reset_time_to_utc(reset_time_str: str) -> Tuple[datetime, datetime]:
    """
    Given a daily reset time string in Vietnam Time (e.g., "00:00" or "07:30"),
    determines the active daily cycle start time and the next reset time, both in UTC.
    
    Returns:
        (threshold_utc, reset_at_utc)
    """
    try:
        hour, minute = map(int, reset_time_str.split(":"))
    except Exception:
        hour, minute = 0, 0

    now_vn = get_now_vn()
    
    # Calculate threshold for today in Vietnam time
    threshold_vn = now_vn.replace(hour=hour, minute=minute, second=0, microsecond=0)
    
    # If currently before today's scheduled reset time, the active daily threshold is actually yesterday's
    if now_vn < threshold_vn:
        threshold_vn = threshold_vn - timedelta(days=1)
        
    threshold_utc = threshold_vn.astimezone(timezone.utc)
    reset_at_utc = threshold_utc + timedelta(days=1)
    
    return threshold_utc, reset_at_utc

def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure a datetime is timezone-aware and in UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
