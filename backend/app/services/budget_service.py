"""Budget engine.

A budget is a monthly cap on one category. The interesting part isn't the cap,
it's the pacing: knowing on the 12th that you're on track to overshoot Food by
₹4,000 is actionable, knowing on the 30th that you did is not.

`_pace` projects month-end spend by extrapolating the run rate over the days
elapsed, which is the right model for the many-small-purchases categories
budgets are usually set on.
"""

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from app.models import Budget, Transaction
from app.services.analytics import EXCLUDED_FROM_SPEND, month_bounds, shift_month

# Share of take-home a first-time user is offered per category. Loosely follows
# the 50/30/20 split, spread across the categories people actually see.
SUGGESTED_SHARE = {
    "Rent": 0.25, "Groceries": 0.10, "Food & Dining": 0.08, "Transportation": 0.06,
    "Utilities": 0.05, "Shopping": 0.06, "Entertainment": 0.03, "Healthcare": 0.03,
    "Travel": 0.04, "Education": 0.02,
}


def _days_elapsed(month: str, today: date) -> tuple[int, int]:
    start, end = month_bounds(month)
    total = (end - start).days
    if today < start:
        return 0, total
    if today >= end:
        return total, total
    return (today - start).days + 1, total


def _spend_by_category(db: Session, user_id: int, month: str) -> dict[str, dict]:
    start, end = month_bounds(month)
    rows = (db.query(Transaction)
            .filter(Transaction.user_id == user_id,
                    Transaction.is_excluded.is_(False),
                    Transaction.amount < 0,
                    Transaction.date >= start, Transaction.date < end)
            .all())
    out: dict[str, dict] = defaultdict(lambda: {"spent": 0.0, "count": 0})
    for t in rows:
        out[t.category]["spent"] += -t.amount
        out[t.category]["count"] += 1
    return out


def _status(percent: float, projected_percent: float, threshold: int) -> str:
    if percent >= 100:
        return "exceeded"
    if projected_percent >= 100:
        return "projected_over"
    if percent >= threshold:
        return "warning"
    return "on_track"


def evaluate(db: Session, user_id: int, month: str, *, today: date | None = None) -> dict:
    """Every active budget scored against actual spend for `month`."""
    today = today or date.today()
    budgets = (db.query(Budget)
               .filter(Budget.user_id == user_id, Budget.is_active.is_(True))
               .order_by(Budget.category).all())
    spend = _spend_by_category(db, user_id, month)
    elapsed, total_days = _days_elapsed(month, today)
    pace = elapsed / total_days if total_days else 1.0

    items = []
    for b in budgets:
        actual = spend.get(b.category, {}).get("spent", 0.0)
        count = spend.get(b.category, {}).get("count", 0)
        percent = round(actual / b.amount * 100, 1) if b.amount else 0.0
        projected = round(actual / pace, 2) if pace > 0 else actual
        projected_percent = round(projected / b.amount * 100, 1) if b.amount else 0.0
        remaining = round(b.amount - actual, 2)
        days_left = max(total_days - elapsed, 0)
        items.append({
            "id": b.id,
            "category": b.category,
            "amount": round(b.amount, 2),
            "spent": round(actual, 2),
            "remaining": remaining,
            "percent": percent,
            "projected": projected,
            "projected_percent": projected_percent,
            "transaction_count": count,
            "alert_threshold": b.alert_threshold,
            "status": _status(percent, projected_percent, b.alert_threshold),
            "daily_allowance": round(remaining / days_left, 2) if days_left > 0 and remaining > 0 else 0.0,
            "days_left": days_left,
        })

    budgeted = sum(i["amount"] for i in items)
    spent = sum(i["spent"] for i in items)
    # Spending outside any budget still counts against the month.
    unbudgeted = sum(v["spent"] for k, v in spend.items()
                     if k not in {i["category"] for i in items} and k not in EXCLUDED_FROM_SPEND)

    return {
        "month": month,
        "items": sorted(items, key=lambda i: -i["percent"]),
        "totals": {
            "budgeted": round(budgeted, 2),
            "spent": round(spent, 2),
            "remaining": round(budgeted - spent, 2),
            "percent": round(spent / budgeted * 100, 1) if budgeted else 0.0,
            "unbudgeted": round(unbudgeted, 2),
        },
        "days_elapsed": elapsed,
        "days_in_month": total_days,
        "over_count": sum(1 for i in items if i["status"] in ("exceeded", "projected_over")),
    }


def suggest(db: Session, user_id: int, monthly_income: float | None = None) -> list[dict]:
    """Starter budgets derived from the user's own 3-month median spend.

    Falls back to income shares for categories with no history, so a new user
    still gets a complete, sensible starting point rather than a blank page.
    """
    from app.services.analytics import _fetch, _month_key

    txns = [t for t in _fetch(db, user_id) if t.amount < 0
            and t.category not in EXCLUDED_FROM_SPEND]
    by_month_cat: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        by_month_cat[_month_key(t.date)][t.category] += -t.amount

    recent_months = sorted(by_month_cat.keys())[-3:]
    existing = {b.category for b in db.query(Budget).filter(Budget.user_id == user_id).all()}

    suggestions: list[dict] = []
    categories = {c for m in recent_months for c in by_month_cat[m]}
    for category in categories:
        if category in existing:
            continue
        values = [by_month_cat[m].get(category, 0.0) for m in recent_months]
        values = [v for v in values if v > 0]
        if not values:
            continue
        typical = sorted(values)[len(values) // 2]
        if typical < 500:
            continue
        # Nudge 5% below the median: a budget you have to reach for.
        suggestions.append({
            "category": category,
            "amount": round(typical * 0.95, -2) or round(typical, 2),
            "basis": f"median of last {len(values)} month(s)",
        })

    if monthly_income:
        for category, share in SUGGESTED_SHARE.items():
            if category in existing or any(s["category"] == category for s in suggestions):
                continue
            suggestions.append({
                "category": category,
                "amount": round(monthly_income * share, -2),
                "basis": f"{int(share * 100)}% of declared income",
            })

    return sorted(suggestions, key=lambda s: -s["amount"])[:10]


def history(db: Session, user_id: int, category: str, months: int = 6) -> list[dict]:
    """Budget-vs-actual for the trailing months, for the sparkline on a card."""
    from app.services.analytics import latest_month

    anchor = latest_month(db, user_id) or f"{date.today():%Y-%m}"
    budget = (db.query(Budget)
              .filter(Budget.user_id == user_id, Budget.category == category).first())
    cap = budget.amount if budget else 0.0
    out = []
    for i in range(months - 1, -1, -1):
        month = shift_month(anchor, -i)
        spent = _spend_by_category(db, user_id, month).get(category, {}).get("spent", 0.0)
        out.append({"month": month, "spent": round(spent, 2), "budget": round(cap, 2)})
    return out
