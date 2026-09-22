"""Analytics engine: deterministic financial metrics computed from SQL.

Every number the product shows — dashboard tiles, charts, health score, the
grounding context handed to the AI assistant — is produced here, so a figure
can never disagree with itself across two screens.

Transactions flagged `is_excluded` (internal transfers between the user's own
accounts, reimbursed spend, corrections) are dropped before any aggregation.
"""

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import Transaction

# Money that moves without being consumed. Kept in the ledger, kept out of
# "what did I spend" so savings rate and category mix stay honest.
EXCLUDED_FROM_SPEND = {"Transfers", "Investments"}

INCOME_CATEGORIES = {"Salary", "Business Income", "Refunds"}


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def month_bounds(month: str) -> tuple[date, date]:
    """Half-open [start, end) range for a YYYY-MM string."""
    y, m = int(month[:4]), int(month[5:7])
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return start, end


def shift_month(month: str, delta: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + delta
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _fetch(db: Session, user_id: int, *, month: str | None = None, year: int | None = None,
           include_excluded: bool = False) -> list[Transaction]:
    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    if not include_excluded:
        q = q.filter(Transaction.is_excluded.is_(False))
    if month:
        start, end = month_bounds(month)
        q = q.filter(Transaction.date >= start, Transaction.date < end)
    if year:
        q = q.filter(Transaction.date >= date(year, 1, 1), Transaction.date < date(year + 1, 1, 1))
    return q.order_by(Transaction.date).all()


def _summarize(txns: list[Transaction]) -> dict:
    """Headline figures for a set of transactions.

    Two different notions of "money out" live here on purpose:

      expenses  every debit — what actually left the account, for cash flow
      spend     debits excluding transfers and investments — consumption

    Savings is income minus *spend*, so a SIP counts in the user's favour
    rather than against them. Treating investing as an expense is the single
    most common way finance dashboards discourage the behaviour they exist to
    encourage.
    """
    income = sum(t.amount for t in txns if t.amount > 0)
    expenses = sum(-t.amount for t in txns if t.amount < 0)
    spend = sum(-t.amount for t in txns
                if t.amount < 0 and t.category not in EXCLUDED_FROM_SPEND)
    invested = sum(-t.amount for t in txns if t.amount < 0 and t.category == "Investments")
    savings = income - spend
    spend_count = sum(1 for t in txns
                      if t.amount < 0 and t.category not in EXCLUDED_FROM_SPEND)
    return {
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "spend": round(spend, 2),
        "invested": round(invested, 2),
        "savings": round(savings, 2),
        "net_cash": round(income - expenses, 2),
        "savings_rate": round(savings / income * 100, 1) if income > 0 else 0.0,
        "transaction_count": len(txns),
        "avg_transaction": round(spend / spend_count, 2) if spend_count else 0.0,
    }


def _category_breakdown(txns: list[Transaction]) -> list[dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for t in txns:
        if t.amount < 0:
            buckets[t.category]["amount"] += -t.amount
            buckets[t.category]["count"] += 1
    total = sum(b["amount"] for b in buckets.values()) or 1.0
    return sorted(
        [
            {"category": c, "amount": round(b["amount"], 2), "count": b["count"],
             "percent": round(b["amount"] / total * 100, 1)}
            for c, b in buckets.items()
        ],
        key=lambda x: -x["amount"],
    )


def _merchant_breakdown(txns: list[Transaction], limit: int = 10) -> list[dict]:
    buckets: dict[str, dict] = defaultdict(
        lambda: {"amount": 0.0, "count": 0, "category": "", "last_date": None})
    for t in txns:
        if t.amount < 0 and t.merchant:
            b = buckets[t.merchant]
            b["amount"] += -t.amount
            b["count"] += 1
            b["category"] = t.category
            if b["last_date"] is None or t.date > b["last_date"]:
                b["last_date"] = t.date
    return sorted(
        [{"merchant": m, "amount": round(b["amount"], 2), "count": b["count"],
          "category": b["category"], "avg": round(b["amount"] / b["count"], 2),
          "last_date": b["last_date"].isoformat() if b["last_date"] else None}
         for m, b in buckets.items()],
        key=lambda x: -x["amount"],
    )[:limit]


def _monthly_series(txns: list[Transaction]) -> list[dict]:
    buckets: dict[str, dict] = defaultdict(
        lambda: {"income": 0.0, "expenses": 0.0, "spend": 0.0, "invested": 0.0, "count": 0})
    for t in txns:
        b = buckets[_month_key(t.date)]
        b["count"] += 1
        if t.amount > 0:
            b["income"] += t.amount
        else:
            b["expenses"] += -t.amount
            if t.category not in EXCLUDED_FROM_SPEND:
                b["spend"] += -t.amount
            if t.category == "Investments":
                b["invested"] += -t.amount
    return [
        {"month": k, "income": round(v["income"], 2), "expenses": round(v["expenses"], 2),
         "spend": round(v["spend"], 2), "invested": round(v["invested"], 2),
         "savings": round(v["income"] - v["spend"], 2), "count": v["count"]}
        for k, v in sorted(buckets.items())
    ]


def _balance_series(txns: list[Transaction]) -> list[dict]:
    """End-of-day closing balance, one point per day the account moved."""
    by_day: dict[date, float] = {}
    for t in sorted(txns, key=lambda t: (t.date, t.id)):
        if t.balance is not None:
            by_day[t.date] = t.balance
    return [{"date": d.isoformat(), "balance": round(b, 2)} for d, b in sorted(by_day.items())]


def _txn_out(t: Transaction) -> dict:
    return {
        "id": t.id, "date": t.date.isoformat(), "description": t.description,
        "merchant": t.merchant, "amount": t.amount, "category": t.category,
        "is_recurring": t.is_recurring, "is_anomaly": t.is_anomaly,
    }


def _empty_overview() -> dict:
    return {
        "empty": True, "summary": _summarize([]), "months": [], "categories": [],
        "merchants": [], "largest_expenses": [], "recent": [], "mom": None,
        "balance_series": [], "current_balance": None, "daily_burn": 0.0,
        "available_months": [], "available_years": [], "period": None,
    }


def overview(db: Session, user_id: int) -> dict:
    txns = _fetch(db, user_id)
    if not txns:
        return _empty_overview()

    months = _monthly_series(txns)
    summary = _summarize(txns)

    mom = None
    if len(months) >= 2:
        cur, prev = months[-1], months[-2]
        mom = {
            "month": cur["month"],
            "income_change": round(cur["income"] - prev["income"], 2),
            "expense_change": round(cur["expenses"] - prev["expenses"], 2),
            "savings_change": round(cur["savings"] - prev["savings"], 2),
            "income_change_pct": round((cur["income"] - prev["income"]) / prev["income"] * 100, 1) if prev["income"] else None,
            "expense_change_pct": round((cur["expenses"] - prev["expenses"]) / prev["expenses"] * 100, 1) if prev["expenses"] else None,
        }

    expenses = [t for t in txns if t.amount < 0]
    largest = sorted(expenses, key=lambda t: t.amount)[:5]
    recent = sorted(txns, key=lambda t: (t.date, t.id), reverse=True)[:10]
    balances = _balance_series(txns)

    span_days = max((txns[-1].date - txns[0].date).days, 1)
    daily_burn = round(summary["spend"] / span_days, 2)

    return {
        "empty": False,
        "summary": summary,
        "months": months[-13:],
        "categories": _category_breakdown(txns)[:12],
        "merchants": _merchant_breakdown(txns, 10),
        "largest_expenses": [_txn_out(t) for t in largest],
        "recent": [_txn_out(t) for t in recent],
        "mom": mom,
        "balance_series": balances[-180:],
        "current_balance": balances[-1]["balance"] if balances else None,
        "daily_burn": daily_burn,
        "available_months": sorted({_month_key(t.date) for t in txns}, reverse=True),
        "available_years": sorted({t.date.year for t in txns}, reverse=True),
        "period": {"start": txns[0].date.isoformat(), "end": txns[-1].date.isoformat()},
    }


def _weekday_pattern(txns: list[Transaction]) -> list[dict]:
    """Average spend per weekday — surfaces the weekend-splurge pattern."""
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    totals = [0.0] * 7
    days: list[set[date]] = [set() for _ in range(7)]
    for t in txns:
        if t.amount < 0 and t.category not in EXCLUDED_FROM_SPEND:
            idx = t.date.weekday()
            totals[idx] += -t.amount
            days[idx].add(t.date)
    return [
        {"weekday": names[i], "total": round(totals[i], 2),
         "average": round(totals[i] / len(days[i]), 2) if days[i] else 0.0}
        for i in range(7)
    ]


def monthly(db: Session, user_id: int, month: str) -> dict:
    txns = _fetch(db, user_id, month=month)
    summary = _summarize(txns)

    prev_key = shift_month(month, -1)
    prev_txns = _fetch(db, user_id, month=prev_key)
    prev_summary = _summarize(prev_txns)
    prev_categories = {c["category"]: c["amount"] for c in _category_breakdown(prev_txns)}

    # Daily cashflow within the month, plus a running cumulative net.
    daily: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expenses": 0.0})
    for t in txns:
        key = t.date.isoformat()
        if t.amount > 0:
            daily[key]["income"] += t.amount
        else:
            daily[key]["expenses"] += -t.amount
    running = 0.0
    daily_series = []
    for k, v in sorted(daily.items()):
        running += v["income"] - v["expenses"]
        daily_series.append({"date": k, "income": round(v["income"], 2),
                             "expenses": round(v["expenses"], 2), "net": round(running, 2)})

    categories = _category_breakdown(txns)
    for c in categories:
        previous = prev_categories.get(c["category"], 0.0)
        c["previous"] = round(previous, 2)
        c["change_pct"] = round((c["amount"] - previous) / previous * 100, 1) if previous else None

    expenses = [t for t in txns if t.amount < 0]
    recurring_total = sum(-t.amount for t in expenses if t.is_recurring)

    return {
        "month": month,
        "summary": summary,
        "previous": {"month": prev_key, **prev_summary},
        "categories": categories,
        "merchants": _merchant_breakdown(txns),
        "daily": daily_series,
        "weekday_pattern": _weekday_pattern(txns),
        "largest_expenses": [_txn_out(t) for t in sorted(expenses, key=lambda t: t.amount)[:6]],
        "largest_income": [_txn_out(t) for t in sorted((t for t in txns if t.amount > 0), key=lambda t: -t.amount)[:5]],
        "recurring_total": round(recurring_total, 2),
        "anomalies": [_txn_out(t) for t in txns if t.is_anomaly],
    }


def yearly(db: Session, user_id: int, year: int) -> dict:
    txns = _fetch(db, user_id, year=year)
    prev_txns = _fetch(db, user_id, year=year - 1)
    summary = _summarize(txns)
    prev_summary = _summarize(prev_txns)

    yoy = None
    if prev_txns:
        yoy = {
            "income_growth_pct": round((summary["income"] - prev_summary["income"]) / prev_summary["income"] * 100, 1) if prev_summary["income"] else None,
            "expense_growth_pct": round((summary["expenses"] - prev_summary["expenses"]) / prev_summary["expenses"] * 100, 1) if prev_summary["expenses"] else None,
        }

    months = _monthly_series(txns)
    best = max(months, key=lambda m: m["savings"], default=None)
    worst = min(months, key=lambda m: m["savings"], default=None)

    return {
        "year": year,
        "summary": summary,
        "previous": {"year": year - 1, **prev_summary},
        "yoy": yoy,
        "months": months,
        "categories": _category_breakdown(txns),
        "merchants": _merchant_breakdown(txns, 12),
        "best_month": best,
        "worst_month": worst,
        "balance_series": _balance_series(txns),
    }


def calendar_heatmap(db: Session, user_id: int, year: int) -> list[dict]:
    """Per-day spend for the GitHub-style activity calendar."""
    txns = _fetch(db, user_id, year=year)
    by_day: dict[date, dict] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for t in txns:
        if t.amount < 0 and t.category not in EXCLUDED_FROM_SPEND:
            by_day[t.date]["amount"] += -t.amount
            by_day[t.date]["count"] += 1
    return [{"date": d.isoformat(), "amount": round(v["amount"], 2), "count": v["count"]}
            for d, v in sorted(by_day.items())]


def spending_stats(db: Session, user_id: int) -> dict:
    """Compact stats bundle used by the AI assistant as grounding context."""
    txns = _fetch(db, user_id)
    return {
        "summary": _summarize(txns),
        "months": _monthly_series(txns),
        "categories": _category_breakdown(txns),
        "merchants": _merchant_breakdown(txns, 15),
        "recurring": [_txn_out(t) for t in txns if t.is_recurring and t.amount < 0][:30],
        "period": {"start": txns[0].date.isoformat(), "end": txns[-1].date.isoformat()} if txns else None,
    }


def latest_month(db: Session, user_id: int) -> str | None:
    txns = _fetch(db, user_id)
    return _month_key(max(t.date for t in txns)) if txns else None


def trailing_window(db: Session, user_id: int, days: int) -> list[Transaction]:
    """The last `days` of activity, anchored to the newest transaction on file.

    Anchoring to the data (not to today) keeps the window meaningful when a
    statement is a few weeks behind, which is normal for monthly exports.
    """
    txns = _fetch(db, user_id)
    if not txns:
        return []
    cutoff = max(t.date for t in txns) - timedelta(days=days)
    return [t for t in txns if t.date >= cutoff]
