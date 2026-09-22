"""Financial Health Score (0-100).

A weighted composite over the trailing 6 months. Each component is normalised
to 0-1 against a published target, so the score is explainable: every point
lost traces to one number the user can go and change.

  savings_rate         22%  savings / income                     (target 20%)
  income_stability     13%  1 - coefficient of variation of monthly income
  spending_consistency 12%  1 - CV of monthly expenses
  cash_flow            13%  share of months with positive net flow
  emergency_fund       15%  liquid buffer vs monthly expenses     (target 3x)
  recurring_load       10%  recurring obligations / income        (target <25%)
  investment_activity   7%  months with an investing transaction
  budget_adherence      8%  spend within self-set category budgets

Budget adherence only applies once the user has set budgets; without them its
weight is redistributed proportionally across the rest, so an untouched
Budgets page never costs anyone points.
"""

import numpy as np
from sqlalchemy.orm import Session

from app.models import Budget, Transaction
from app.services.analytics import _fetch, _monthly_series, month_bounds, shift_month

_WEIGHTS = {
    "savings_rate": 0.22,
    "income_stability": 0.13,
    "spending_consistency": 0.12,
    "cash_flow": 0.13,
    "emergency_fund": 0.15,
    "recurring_load": 0.10,
    "investment_activity": 0.07,
    "budget_adherence": 0.08,
}

_LABELS = {
    "savings_rate": "Savings Rate",
    "income_stability": "Income Stability",
    "spending_consistency": "Spending Consistency",
    "cash_flow": "Cash Flow",
    "emergency_fund": "Emergency Fund",
    "recurring_load": "Recurring Load",
    "investment_activity": "Investing Habit",
    "budget_adherence": "Budget Adherence",
}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _grade(score: int) -> str:
    return ("A+" if score >= 90 else "A" if score >= 80 else "B" if score >= 70
            else "C" if score >= 55 else "D" if score >= 40 else "E")


def _budget_adherence(db: Session, user_id: int, months: list[dict]) -> tuple[float | None, str]:
    budgets = {b.category: b.amount for b in
               db.query(Budget).filter(Budget.user_id == user_id, Budget.is_active.is_(True)).all()}
    if not budgets or not months:
        return None, "No budgets set yet"

    # Score the last three months: share of category-months kept within budget.
    respected = 0
    total = 0
    for m in months[-3:]:
        start, end = month_bounds(m["month"])
        rows = (db.query(Transaction)
                .filter(Transaction.user_id == user_id, Transaction.is_excluded.is_(False),
                        Transaction.amount < 0,
                        Transaction.date >= start, Transaction.date < end).all())
        spent: dict[str, float] = {}
        for t in rows:
            spent[t.category] = spent.get(t.category, 0.0) + -t.amount
        for category, cap in budgets.items():
            total += 1
            if spent.get(category, 0.0) <= cap:
                respected += 1
    if total == 0:
        return None, "No budgets set yet"
    return respected / total, f"{respected}/{total} category-months within budget"


def _components(db: Session, user_id: int, txns: list[Transaction]) -> list[tuple]:
    months = _monthly_series(txns)[-6:]
    incomes = np.array([m["income"] for m in months], dtype=float)
    expenses = np.array([m["expenses"] for m in months], dtype=float)

    total_income = float(incomes.sum())
    total_expenses = float(expenses.sum())

    # 1. Savings rate — 20%+ is full marks
    savings_rate = (total_income - total_expenses) / total_income if total_income > 0 else 0.0
    s_savings = _clamp(savings_rate / 0.20)

    # 2/3. Stability — inverse coefficient of variation
    s_income = (_clamp(1 - float(incomes.std()) / float(incomes.mean()))
                if len(incomes) >= 2 and incomes.mean() > 0 else 0.5)
    s_spend = (_clamp(1 - float(expenses.std()) / float(expenses.mean()))
               if len(expenses) >= 2 and expenses.mean() > 0 else 0.5)

    # 4. Cash flow — share of cash-positive months
    positive_months = sum(1 for m in months if m["savings"] > 0)
    s_cashflow = positive_months / len(months) if months else 0.0

    # 5. Emergency fund — latest balance vs average monthly spend (3x = full)
    balances = [t.balance for t in txns if t.balance is not None]
    avg_monthly_exp = float(expenses.mean()) if len(expenses) else 0.0
    if balances and avg_monthly_exp > 0:
        months_covered = balances[-1] / avg_monthly_exp
        s_emergency = _clamp(months_covered / 3)
        emergency_detail = f"~{months_covered:.1f} months of expenses in buffer"
    else:
        s_emergency = 0.5
        emergency_detail = "No balance data — using a neutral estimate"

    # 6. Recurring load — obligations under 25% of income is healthy
    recurring = sum(-t.amount for t in txns if t.is_recurring and t.amount < 0)
    recurring_ratio = recurring / total_income if total_income > 0 else 0.0
    s_recurring = _clamp(1 - recurring_ratio / 0.5)

    # 7. Investing habit — months with an investment outflow
    invest_months = {f"{t.date.year}-{t.date.month:02d}" for t in txns
                     if t.category == "Investments" and t.amount < 0}
    s_invest = _clamp(len(invest_months) / max(len(months), 1))

    # 8. Budget adherence (optional)
    s_budget, budget_detail = _budget_adherence(db, user_id, months)

    return [
        ("savings_rate", s_savings, f"{savings_rate * 100:.1f}% of income saved",
         "Aim for 20% or more of take-home."),
        ("income_stability", s_income, "Consistency of monthly income",
         "Steadier income makes every other plan easier to hold."),
        ("spending_consistency", s_spend, "Predictability of monthly spend",
         "Smooth months mean fewer nasty surprises."),
        ("cash_flow", s_cashflow, f"{positive_months}/{len(months)} months cash-positive",
         "Every month should end with more than it started."),
        ("emergency_fund", s_emergency, emergency_detail,
         "Three months of expenses is the standard floor."),
        ("recurring_load", s_recurring, f"{recurring_ratio * 100:.1f}% of income is recurring bills",
         "Under 25% keeps room to absorb a shock."),
        ("investment_activity", s_invest, f"Invested in {len(invest_months)} of last {len(months)} months",
         "Regular beats large — consistency compounds."),
        ("budget_adherence", s_budget, budget_detail,
         "Set budgets on your top categories to activate this."),
    ]


def _score_from(components: list[tuple]) -> int:
    """Weighted total, renormalised over whichever components actually applied."""
    live = [(s, _WEIGHTS[k]) for k, s, _, _ in components if s is not None]
    total_weight = sum(w for _, w in live) or 1.0
    return round(sum(s * w for s, w in live) / total_weight * 100)


def compute(db: Session, user_id: int) -> dict:
    txns = _fetch(db, user_id)
    if not txns:
        return {"score": None, "grade": None, "components": [], "history": [],
                "message": "Upload a statement to compute your health score."}

    components = _components(db, user_id, txns)
    score = _score_from(components)

    return {
        "score": score,
        "grade": _grade(score),
        "components": [
            {"key": k, "label": _LABELS[k], "score": round(s * 100) if s is not None else None,
             "weight": _WEIGHTS[k], "detail": detail, "advice": advice,
             "applies": s is not None}
            for k, s, detail, advice in components
        ],
        "history": history(db, user_id),
        "message": None,
    }


def history(db: Session, user_id: int, months: int = 6) -> list[dict]:
    """Score recomputed as of each of the last N month-ends.

    Each point uses only the data available up to that month, so the trend
    line shows how the score genuinely moved rather than redrawing the past.
    """
    all_txns = _fetch(db, user_id)
    if not all_txns:
        return []
    anchor = max(t.date for t in all_txns)
    anchor_key = f"{anchor.year:04d}-{anchor.month:02d}"

    out = []
    for i in range(months - 1, -1, -1):
        key = shift_month(anchor_key, -i)
        _, end = month_bounds(key)
        window = [t for t in all_txns if t.date < end]
        if len({(t.date.year, t.date.month) for t in window}) < 2:
            continue
        try:
            out.append({"month": key, "score": _score_from(_components(db, user_id, window))})
        except (ValueError, ZeroDivisionError):
            continue
    return out
