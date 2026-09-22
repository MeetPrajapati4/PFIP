"""Smart insights & recommendations.

Deterministic detectors find the facts; Gemini optionally writes one narrative
on top. Detection never depends on the LLM, so an insight is reproducible and
can be trusted enough to act on.

Every insight carries an `impact` — the money at stake — and results are sorted
by it. A ₹12,000/yr forgotten subscription outranks a 45% blip in Entertainment
even though the percentage is more dramatic, because the rupees are what
matter.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import Budget, Insight, Transaction
from app.services import gemini_client
from app.services.analytics import _category_breakdown, _fetch, _monthly_series, month_bounds

logger = logging.getLogger("pfip.insights")


def _latest_month(txns: list[Transaction]) -> str | None:
    if not txns:
        return None
    latest = max(t.date for t in txns)
    return f"{latest.year:04d}-{latest.month:02d}"


def _detect_category_spikes(txns: list[Transaction], month: str) -> list[dict]:
    """Categories whose latest-month spend is >40% above their 3-month average."""
    by_month_cat: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        if t.amount < 0:
            by_month_cat[f"{t.date.year:04d}-{t.date.month:02d}"][t.category] += -t.amount

    months = sorted(by_month_cat.keys())
    if month not in months or len(months) < 2:
        return []
    history = [m for m in months if m < month][-3:]
    if not history:
        return []

    findings = []
    for category, amount in by_month_cat[month].items():
        avg = sum(by_month_cat[m].get(category, 0.0) for m in history) / len(history)
        if avg > 500 and amount > avg * 1.4:
            findings.append({
                "type": "spike", "severity": "warning",
                "title": f"{category} spending up {round((amount / avg - 1) * 100)}%",
                "body": (f"You spent {amount:,.0f} on {category} in {month}, versus a "
                         f"{avg:,.0f} average over the previous {len(history)} month(s). "
                         f"Worth a look before it becomes the new normal."),
                "month": month,
                "impact": round(amount - avg, 2),
                "action_label": f"View {category}",
                "action_href": f"/transactions?category={category}&month={month}",
            })
    return sorted(findings, key=lambda f: -f["impact"])[:4]


def _detect_subscriptions(txns: list[Transaction]) -> list[dict]:
    recurring = [t for t in txns if t.is_recurring and t.amount < 0]
    if not recurring:
        return []
    by_merchant: dict[str, list[Transaction]] = defaultdict(list)
    for t in recurring:
        by_merchant[t.merchant].append(t)
    monthly_total = sum(abs(items[-1].amount) for items in by_merchant.values())
    names = sorted(by_merchant.keys(), key=lambda m: -abs(by_merchant[m][-1].amount))
    listed = ", ".join(names[:6]) + ("…" if len(names) > 6 else "")
    return [{
        "type": "subscription", "severity": "info",
        "title": f"{len(by_merchant)} recurring payments ≈ {monthly_total:,.0f}/month",
        "body": (f"Detected recurring charges: {listed}. That's {monthly_total * 12:,.0f} a "
                 f"year on autopilot — cancelling even one unused service is the fastest "
                 f"savings win available to you."),
        "month": None,
        "impact": round(monthly_total * 12, 2),
        "action_label": "Review subscriptions",
        "action_href": "/subscriptions",
    }]


def _detect_lapsed_subscriptions(txns: list[Transaction]) -> list[dict]:
    """Recurring charges that stopped — often a card expiry, sometimes a win."""
    recurring = [t for t in txns if t.is_recurring and t.amount < 0]
    if not recurring:
        return []
    as_of = max(t.date for t in txns)
    by_merchant: dict[str, list[Transaction]] = defaultdict(list)
    for t in recurring:
        by_merchant[t.merchant].append(t)

    findings = []
    for merchant, rows in by_merchant.items():
        rows.sort(key=lambda t: t.date)
        if len(rows) < 3:
            continue
        gap = (as_of - rows[-1].date).days
        if 60 <= gap <= 120:
            findings.append({
                "type": "subscription", "severity": "info",
                "title": f"{merchant} stopped charging you",
                "body": (f"The last {merchant} charge was {rows[-1].date.isoformat()} "
                         f"({gap} days ago) after {len(rows)} regular payments. If you meant "
                         f"to cancel, you're saving {abs(rows[-1].amount) * 12:,.0f} a year. "
                         f"If not, your card on file may have expired."),
                "month": None,
                "impact": round(abs(rows[-1].amount) * 12, 2),
                "action_label": "See subscriptions",
                "action_href": "/subscriptions",
            })
    return findings[:2]


def _detect_price_hikes(txns: list[Transaction]) -> list[dict]:
    """A recurring charge that quietly went up."""
    by_merchant: dict[str, list[Transaction]] = defaultdict(list)
    for t in txns:
        if t.is_recurring and t.amount < 0 and t.merchant:
            by_merchant[t.merchant].append(t)

    findings = []
    for merchant, rows in by_merchant.items():
        rows.sort(key=lambda t: t.date)
        if len(rows) < 4:
            continue
        earlier = [abs(t.amount) for t in rows[:-2]]
        old = sum(earlier) / len(earlier)
        new = abs(rows[-1].amount)
        # Only a charge that was previously *stable* can be said to have risen.
        # A variable bill bouncing around isn't a price hike, and calling it one
        # trains the user to ignore the alert.
        spread = (max(earlier) - min(earlier)) / old if old else 1.0
        if spread > 0.12:
            continue
        if old > 100 and new > old * 1.12:
            findings.append({
                "type": "spike", "severity": "warning",
                "title": f"{merchant} raised its price {round((new / old - 1) * 100)}%",
                "body": (f"{merchant} now charges {new:,.0f}, up from an average of "
                         f"{old:,.0f}. That's {(new - old) * 12:,.0f} more per year — a good "
                         f"moment to check whether you still use it."),
                "month": f"{rows[-1].date.year:04d}-{rows[-1].date.month:02d}",
                "impact": round((new - old) * 12, 2),
                "action_label": "See subscriptions",
                "action_href": "/subscriptions",
            })
    return sorted(findings, key=lambda f: -f["impact"])[:2]


# Round-number, repeat-by-design outflows. Two ₹2,000 ATM withdrawals in a week
# is a Tuesday, not a billing error.
_NEVER_DUPLICATE = {"Cash Withdrawal", "Transfers", "Investments", "Rent", "Loan Payments"}


def _detect_duplicates(txns: list[Transaction]) -> list[dict]:
    """Same merchant + same amount within 48 hours -> possible double charge."""
    expenses = sorted((t for t in txns if t.amount < 0 and t.merchant
                       and t.category not in _NEVER_DUPLICATE),
                      key=lambda t: (t.merchant, t.date))
    findings = []
    for a, b in zip(expenses, expenses[1:]):
        if (a.merchant == b.merchant and abs(a.amount - b.amount) < 0.01
                and abs((b.date - a.date).days) <= 2 and abs(a.amount) > 200):
            findings.append({
                "type": "duplicate", "severity": "warning",
                "title": f"Possible duplicate charge: {a.merchant}",
                "body": (f"Two identical charges of {abs(a.amount):,.0f} at {a.merchant} on "
                         f"{a.date.isoformat()} and {b.date.isoformat()}. If unintentional, "
                         f"raise a dispute with your bank — these are usually reversed."),
                "month": f"{b.date.year:04d}-{b.date.month:02d}",
                "impact": round(abs(a.amount), 2),
                "action_label": "Find these",
                "action_href": f"/transactions?search={a.merchant}",
            })
    return sorted(findings, key=lambda f: -f["impact"])[:3]


def _detect_savings_win(txns: list[Transaction]) -> list[dict]:
    months = _monthly_series(txns)
    if len(months) < 2:
        return []
    cur, prev = months[-1], months[-2]
    if cur["savings"] > prev["savings"] and cur["savings"] > 0:
        delta = cur["savings"] - prev["savings"]
        return [{
            "type": "tip", "severity": "positive",
            "title": f"Savings improved by {delta:,.0f}",
            "body": (f"You saved {cur['savings']:,.0f} in {cur['month']}, up from "
                     f"{prev['savings']:,.0f}. Move the surplus into an emergency fund or a "
                     f"SIP this week, before it quietly gets absorbed."),
            "month": cur["month"],
            "impact": round(delta, 2),
            "action_label": "Set a goal",
            "action_href": "/goals",
        }]
    return []


def _detect_anomalies(txns: list[Transaction]) -> list[dict]:
    flagged = sorted((t for t in txns if t.is_anomaly and t.amount < 0),
                     key=lambda t: t.amount)[:2]
    return [{
        "type": "anomaly", "severity": "warning",
        "title": f"Unusual transaction: {abs(t.amount):,.0f} at {t.merchant or 'unknown merchant'}",
        "body": (f"'{t.description[:90]}' on {t.date.isoformat()} is far larger than your "
                 f"typical {t.category} spend. Flagged by the local anomaly model — worth "
                 f"confirming you recognise it."),
        "month": f"{t.date.year:04d}-{t.date.month:02d}",
        "impact": round(abs(t.amount), 2),
        "action_label": "Review anomalies",
        "action_href": "/transactions?flag=anomaly",
    } for t in flagged]


def _detect_budget_breaches(db: Session, user_id: int, month: str | None) -> list[dict]:
    if not month:
        return []
    budgets = db.query(Budget).filter(Budget.user_id == user_id, Budget.is_active.is_(True)).all()
    if not budgets:
        return []
    start, end = month_bounds(month)
    rows = (db.query(Transaction)
            .filter(Transaction.user_id == user_id, Transaction.is_excluded.is_(False),
                    Transaction.amount < 0, Transaction.date >= start, Transaction.date < end)
            .all())
    spent: dict[str, float] = defaultdict(float)
    for t in rows:
        spent[t.category] += -t.amount

    findings = []
    for b in budgets:
        actual = spent.get(b.category, 0.0)
        if actual > b.amount:
            findings.append({
                "type": "budget", "severity": "warning",
                "title": f"{b.category} is {actual - b.amount:,.0f} over budget",
                "body": (f"You budgeted {b.amount:,.0f} for {b.category} in {month} and spent "
                         f"{actual:,.0f}. Either the budget is unrealistic or the month got "
                         f"away from you — both are worth five minutes."),
                "month": month,
                "impact": round(actual - b.amount, 2),
                "action_label": "Adjust budget",
                "action_href": "/budgets",
            })
    return sorted(findings, key=lambda f: -f["impact"])[:3]


def _detect_cash_crunch(db: Session, user_id: int) -> list[dict]:
    """A forecast dipping below zero is the most urgent thing we can say."""
    from app.services.forecast_service import forecast

    result = forecast(db, user_id, horizon_days=60)
    if result.get("empty") or not result.get("summary"):
        return []
    summary = result["summary"]
    if not summary["will_dip_negative"]:
        return []
    low = summary["low_point"]
    return [{
        "type": "forecast", "severity": "warning",
        "title": f"Projected shortfall around {low['date']}",
        "body": (f"At your current run rate ({summary['daily_variable']:,.0f}/day) plus known "
                 f"scheduled payments, your balance is projected to reach {low['balance']:,.0f} "
                 f"by {low['date']}. Moving one large discretionary purchase past that date "
                 f"avoids it."),
        "month": None,
        "impact": round(abs(low["balance"]), 2),
        "action_label": "Open forecast",
        "action_href": "/forecast",
    }]


def _detect_no_save_month(txns: list[Transaction]) -> list[dict]:
    months = _monthly_series(txns)
    if len(months) < 2:
        return []
    cur = months[-1]
    if cur["savings"] >= 0:
        return []
    return [{
        "type": "tip", "severity": "warning",
        "title": f"{cur['month']} ran a deficit of {abs(cur['savings']):,.0f}",
        "body": (f"Expenses of {cur['expenses']:,.0f} outran income of {cur['income']:,.0f}. "
                 f"One-off months happen; two in a row is a trend worth naming."),
        "month": cur["month"],
        "impact": round(abs(cur["savings"]), 2),
        "action_label": "See the month",
        "action_href": f"/analytics?month={cur['month']}",
    }]


def _ai_summary(txns: list[Transaction]) -> list[dict]:
    """One Gemini-authored narrative (main model), skipped offline."""
    if not gemini_client.is_available() or not txns:
        return []
    months = _monthly_series(txns)[-3:]
    cats = _category_breakdown(txns)[:6]
    prompt = (
        "You are a friendly, blunt financial coach. Based on this data, write ONE short "
        "insight (2-3 sentences, specific numbers, actionable, no preamble, no greeting):\n"
        f"Monthly income/expense/savings: {months}\n"
        f"Top spending categories: {cats}\n"
    )
    text = gemini_client.generate(prompt, temperature=0.6)
    if not text:
        return []
    return [{
        "type": "summary", "severity": "info",
        "title": "Your coach's take",
        "body": text.strip()[:900],
        "month": _latest_month(txns),
        "impact": 0.0,
        "action_label": "Ask a follow-up",
        "action_href": "/assistant",
    }]


def generate(db: Session, user_id: int) -> list[Insight]:
    txns = _fetch(db, user_id)
    month = _latest_month(txns)
    findings: list[dict] = []
    if month:
        findings += _detect_cash_crunch(db, user_id)
        findings += _detect_budget_breaches(db, user_id, month)
        findings += _detect_category_spikes(txns, month)
        findings += _detect_price_hikes(txns)
        findings += _detect_duplicates(txns)
        findings += _detect_lapsed_subscriptions(txns)
        findings += _detect_subscriptions(txns)
        findings += _detect_no_save_month(txns)
        findings += _detect_savings_win(txns)
        findings += _detect_anomalies(txns)
        findings += _ai_summary(txns)

    # Warnings first, then by money at stake — the AI narrative always tails.
    severity_rank = {"warning": 0, "positive": 1, "info": 2}
    findings.sort(key=lambda f: (f["type"] == "summary", severity_rank.get(f["severity"], 3),
                                 -f.get("impact", 0)))

    db.query(Insight).filter(Insight.user_id == user_id).delete()
    rows = [Insight(user_id=user_id, **f) for f in findings]
    db.add_all(rows)
    db.commit()
    for r in rows:
        db.refresh(r)
    return rows
