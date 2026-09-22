"""Cash-flow forecast and subscription registry.

Forecast model (deliberately explainable — the user can audit every rupee):

  scheduled   known recurring debits/credits, projected onto their next due
              dates from observed periodicity
  variable    median daily discretionary spend over the trailing 90 days,
              applied to every remaining day
  income      recurring salary/credits on their observed cadence

The result is a day-by-day balance path plus a "safe to spend" number: what
can be spent today without the projected balance dipping under the buffer
before the next inflow. That's the question people actually have.
"""

from collections import defaultdict
from datetime import date, timedelta
from statistics import median

from sqlalchemy.orm import Session

from app.models import Transaction
from app.services.analytics import EXCLUDED_FROM_SPEND, _fetch


def _cadence(dates: list[date]) -> tuple[str, int]:
    """Classify the gap between occurrences into a human label + day count."""
    if len(dates) < 2:
        return "unknown", 30
    gaps = [(b - a).days for a, b in zip(dates, dates[1:]) if (b - a).days > 0]
    if not gaps:
        return "unknown", 30
    typical = int(median(gaps))
    if typical <= 9:
        return "weekly", 7
    if typical <= 20:
        return "fortnightly", 14
    if typical <= 45:
        return "monthly", 30
    if typical <= 100:
        return "quarterly", 91
    if typical <= 200:
        return "half-yearly", 182
    return "yearly", 365


# Recurring outflows that are commitments, not discretionary services. Lumping
# rent and an EMI in with Netflix would make "cancel something" advice absurd.
_OBLIGATION_CATEGORIES = {"Rent", "Loan Payments", "Insurance", "Taxes", "Education", "Childcare"}
_SUBSCRIPTION_CATEGORIES = {"Subscriptions", "Entertainment", "Healthcare", "Shopping",
                            "Food & Dining", "Education", "Personal Care"}


def _classify(category: str) -> str:
    if category in _OBLIGATION_CATEGORIES:
        return "obligation"
    if category == "Utilities":
        return "bill"
    if category in _SUBSCRIPTION_CATEGORIES:
        return "subscription"
    return "bill"


def subscriptions(db: Session, user_id: int) -> dict:
    """Every recurring payee with cadence, next due date and annualised cost.

    Transfers to your own accounts and investment SIPs are excluded outright —
    they're recurring, but they're savings, and counting them as a cost to be
    cut would be actively bad advice.
    """
    txns = _fetch(db, user_id)
    if not txns:
        return {"items": [], "upcoming": [], "as_of": None,
                "totals": {"monthly": 0.0, "yearly": 0.0, "count": 0,
                           "subscriptions_monthly": 0.0, "obligations_monthly": 0.0,
                           "bills_monthly": 0.0}}

    as_of = max(t.date for t in txns)
    groups: dict[str, list[Transaction]] = defaultdict(list)
    for t in txns:
        if (t.is_recurring and t.amount < 0 and t.merchant
                and t.category not in EXCLUDED_FROM_SPEND):
            groups[t.merchant].append(t)

    items = []
    for merchant, rows in groups.items():
        rows.sort(key=lambda t: t.date)
        dates = [t.date for t in rows]
        label, period_days = _cadence(dates)
        amounts = [abs(t.amount) for t in rows]
        typical = round(median(amounts), 2)
        last = dates[-1]
        next_due = last + timedelta(days=period_days)
        # A payee whose next due date is well past means it probably lapsed.
        days_overdue = (as_of - next_due).days
        monthly_equivalent = typical * (30.44 / period_days)
        # A price hike only counts if the earlier charges were themselves
        # stable — otherwise every variable bill looks like a rise.
        early = amounts[:-1]
        early_mean = sum(early) / len(early) if early else typical
        early_spread = (max(early) - min(early)) / early_mean if early and early_mean else 1.0

        items.append({
            "merchant": merchant,
            "category": rows[-1].category,
            "kind": _classify(rows[-1].category),
            "amount": typical,
            "is_variable": early_spread > 0.15,
            "last_amount": round(abs(rows[-1].amount), 2),
            "cadence": label,
            "period_days": period_days,
            "occurrences": len(rows),
            "first_seen": dates[0].isoformat(),
            "last_charged": last.isoformat(),
            "next_due": next_due.isoformat(),
            "days_until_due": (next_due - as_of).days,
            "monthly_cost": round(monthly_equivalent, 2),
            "yearly_cost": round(monthly_equivalent * 12, 2),
            "status": "lapsed" if days_overdue > period_days else "active",
            # Amount drift is how price hikes hide in plain sight.
            "price_change": round(abs(rows[-1].amount) - abs(rows[0].amount), 2),
        })

    active = [i for i in items if i["status"] == "active"]
    items.sort(key=lambda i: -i["monthly_cost"])
    upcoming = sorted((i for i in active if i["days_until_due"] >= -3),
                      key=lambda i: i["days_until_due"])[:8]

    def total_for(kind: str) -> float:
        return round(sum(i["monthly_cost"] for i in active if i["kind"] == kind), 2)

    return {
        "items": items,
        "totals": {
            "monthly": round(sum(i["monthly_cost"] for i in active), 2),
            "yearly": round(sum(i["yearly_cost"] for i in active), 2),
            "count": len(active),
            "subscriptions_monthly": total_for("subscription"),
            "bills_monthly": total_for("bill"),
            "obligations_monthly": total_for("obligation"),
            "subscription_count": sum(1 for i in active if i["kind"] == "subscription"),
        },
        "upcoming": upcoming,
        "as_of": as_of.isoformat(),
    }


def _daily_variable_spend(txns: list[Transaction], as_of: date, window: int = 90) -> float:
    """Median daily non-recurring, non-transfer spend over the trailing window.

    Median over daily totals (rather than mean) keeps a single laptop purchase
    from inflating the whole forecast.
    """
    cutoff = as_of - timedelta(days=window)
    by_day: dict[date, float] = defaultdict(float)
    for t in txns:
        if (t.date >= cutoff and t.amount < 0 and not t.is_recurring
                and t.category not in EXCLUDED_FROM_SPEND):
            by_day[t.date] += -t.amount
    if not by_day:
        return 0.0
    days = (as_of - cutoff).days or 1
    # Include zero-spend days so the median reflects reality, not just active days.
    series = list(by_day.values()) + [0.0] * max(days - len(by_day), 0)
    return round(float(median(series)), 2)


def forecast(db: Session, user_id: int, horizon_days: int = 90,
             buffer_amount: float = 0.0) -> dict:
    txns = _fetch(db, user_id)
    if not txns:
        return {"empty": True, "points": [], "scheduled": [], "summary": None}

    as_of = max(t.date for t in txns)
    balances = [t.balance for t in sorted(txns, key=lambda t: (t.date, t.id)) if t.balance is not None]
    opening = balances[-1] if balances else 0.0

    subs = subscriptions(db, user_id)
    daily_variable = _daily_variable_spend(txns, as_of)

    # Recurring credits (salary, retainers) get the same periodicity treatment.
    credit_groups: dict[str, list[Transaction]] = defaultdict(list)
    for t in txns:
        if t.amount > 0 and t.merchant:
            credit_groups[t.merchant].append(t)

    scheduled: list[dict] = []
    for item in subs["items"]:
        if item["status"] != "active":
            continue
        due = date.fromisoformat(item["next_due"])
        while due <= as_of + timedelta(days=horizon_days):
            if due > as_of:
                scheduled.append({"date": due.isoformat(), "label": item["merchant"],
                                  "amount": -item["amount"], "kind": "subscription",
                                  "category": item["category"]})
            due += timedelta(days=item["period_days"])

    for merchant, rows in credit_groups.items():
        rows.sort(key=lambda t: t.date)
        if len(rows) < 3:
            continue
        dates = [t.date for t in rows]
        label, period_days = _cadence(dates)
        if label not in ("monthly", "fortnightly", "weekly"):
            continue
        # Ensure the credit source is still active, rather than a former employer/lapsed income
        if (as_of - dates[-1]).days > int(period_days * 1.8):
            continue
        amounts = [t.amount for t in rows[-4:]]
        if median(amounts) <= 0:
            continue
        # Stable amount = a real salary-like inflow, not a lumpy reimbursement.
        spread = (max(amounts) - min(amounts)) / max(median(amounts), 1)
        if spread > 0.35:
            continue
        due = dates[-1] + timedelta(days=period_days)
        while due <= as_of + timedelta(days=horizon_days):
            if due > as_of:
                scheduled.append({"date": due.isoformat(), "label": merchant,
                                  "amount": round(float(median(amounts)), 2),
                                  "kind": "income", "category": rows[-1].category})
            due += timedelta(days=period_days)

    scheduled.sort(key=lambda s: s["date"])
    by_date: dict[str, float] = defaultdict(float)
    for s in scheduled:
        by_date[s["date"]] += s["amount"]

    points = []
    balance = opening
    low_point = {"date": as_of.isoformat(), "balance": opening}
    for i in range(1, horizon_days + 1):
        day = as_of + timedelta(days=i)
        movement = by_date.get(day.isoformat(), 0.0) - daily_variable
        balance += movement
        points.append({
            "date": day.isoformat(),
            "balance": round(balance, 2),
            "scheduled": round(by_date.get(day.isoformat(), 0.0), 2),
            "variable": -daily_variable,
        })
        if balance < low_point["balance"]:
            low_point = {"date": day.isoformat(), "balance": round(balance, 2)}

    scheduled_out = sum(-s["amount"] for s in scheduled if s["amount"] < 0)
    scheduled_in = sum(s["amount"] for s in scheduled if s["amount"] > 0)

    # Safe-to-spend: the slack between the worst projected day and the buffer
    # the user wants to keep untouched. Never negative — a shortfall is a
    # different message, not a negative allowance.
    safe_to_spend = max(round(low_point["balance"] - buffer_amount, 2), 0.0)
    days_of_runway = None
    if daily_variable > 0:
        days_of_runway = int(max(opening - buffer_amount, 0) / daily_variable)

    return {
        "empty": False,
        "as_of": as_of.isoformat(),
        "opening_balance": round(opening, 2),
        "horizon_days": horizon_days,
        "points": points,
        "scheduled": scheduled[:40],
        "summary": {
            "projected_balance": round(balance, 2),
            "projected_change": round(balance - opening, 2),
            "scheduled_out": round(scheduled_out, 2),
            "scheduled_in": round(scheduled_in, 2),
            "daily_variable": daily_variable,
            "variable_total": round(daily_variable * horizon_days, 2),
            "low_point": low_point,
            "safe_to_spend": safe_to_spend,
            "days_of_runway": days_of_runway,
            "will_dip_negative": low_point["balance"] < 0,
        },
    }
