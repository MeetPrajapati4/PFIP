"""Savings goals.

Progress is stored (the user tops it up as they move money), but the useful
part is the projection: at the rate you're actually saving, will this land on
time? That answer comes from the trailing savings run rate, not from wishes.
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Goal
from app.services.analytics import _fetch, _monthly_series


def _monthly_savings_rate(db: Session, user_id: int, months: int = 3) -> float:
    """Average monthly net savings over the trailing window (never negative)."""
    series = _monthly_series(_fetch(db, user_id))
    if not series:
        return 0.0
    window = series[-months:]
    return max(round(sum(m["savings"] for m in window) / len(window), 2), 0.0)


def _months_between(start: date, end: date) -> float:
    return max((end - start).days / 30.44, 0.0)


def evaluate(db: Session, user_id: int, *, today: date | None = None) -> dict:
    today = today or date.today()
    goals = (db.query(Goal)
             .filter(Goal.user_id == user_id, Goal.status != "archived")
             .order_by(Goal.created_at).all())
    run_rate = _monthly_savings_rate(db, user_id)
    active = [g for g in goals if g.status == "active"]
    # Split the run rate across active goals so two goals don't each claim it.
    per_goal_rate = run_rate / len(active) if active else 0.0

    items = []
    for g in goals:
        remaining = max(g.target_amount - g.current_amount, 0.0)
        percent = round(g.current_amount / g.target_amount * 100, 1) if g.target_amount else 0.0
        months_needed = remaining / per_goal_rate if per_goal_rate > 0 else None
        projected_date = None
        if months_needed is not None:
            projected_date = date.fromordinal(
                min(today.toordinal() + int(months_needed * 30.44), date.max.toordinal() - 1))

        required_monthly = None
        on_track = None
        if g.target_date:
            months_left = _months_between(today, g.target_date)
            required_monthly = round(remaining / months_left, 2) if months_left > 0.1 else remaining
            on_track = per_goal_rate >= required_monthly if remaining > 0 else True

        items.append({
            "id": g.id,
            "name": g.name,
            "target_amount": round(g.target_amount, 2),
            "current_amount": round(g.current_amount, 2),
            "remaining": round(remaining, 2),
            "percent": min(percent, 100.0),
            "target_date": g.target_date.isoformat() if g.target_date else None,
            "icon": g.icon,
            "color": g.color,
            "status": "achieved" if remaining <= 0 else g.status,
            "required_monthly": required_monthly,
            "projected_date": projected_date.isoformat() if projected_date else None,
            "months_to_goal": round(months_needed, 1) if months_needed is not None else None,
            "on_track": on_track,
        })

    return {
        "items": items,
        "monthly_savings_rate": run_rate,
        "allocated_per_goal": round(per_goal_rate, 2),
        "totals": {
            "target": round(sum(i["target_amount"] for i in items), 2),
            "saved": round(sum(i["current_amount"] for i in items), 2),
            "count": len(items),
            "achieved": sum(1 for i in items if i["status"] == "achieved"),
        },
    }
