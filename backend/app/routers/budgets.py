from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Budget, User
from app.schemas import BudgetCreate, BudgetOut, BudgetUpdate
from app.services import analytics, budget_service

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _default_month(db: Session, user_id: int) -> str:
    """Anchor to the newest month with data, not to the calendar.

    A statement imported in arrears would otherwise open on an empty month and
    look like every budget was untouched.
    """
    from datetime import date

    return analytics.latest_month(db, user_id) or f"{date.today():%Y-%m}"


@router.get("")
def list_budgets(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.evaluate(db, user.id, month or _default_month(db, user.id))


@router.get("/suggestions")
def suggestions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.suggest(db, user.id, user.monthly_income_target)


@router.get("/{category}/history")
def category_history(category: str, months: int = Query(6, ge=3, le=24),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.history(db, user.id, category, months)


@router.post("", response_model=BudgetOut, status_code=201)
def create_budget(payload: BudgetCreate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    existing = (db.query(Budget)
                .filter(Budget.user_id == user.id, Budget.category == payload.category).first())
    if existing:
        # One budget per category — treat a repeat as an update, which is what
        # the user meant anyway.
        existing.amount = payload.amount
        existing.alert_threshold = payload.alert_threshold
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing

    budget = Budget(user_id=user.id, category=payload.category, amount=payload.amount,
                    alert_threshold=payload.alert_threshold)
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.post("/bulk", response_model=list[BudgetOut], status_code=201)
def create_many(payload: list[BudgetCreate], user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Accept a whole set of suggestions in one click."""
    out = []
    for item in payload[:30]:
        out.append(create_budget(item, user, db))
    return out


@router.patch("/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: int, payload: BudgetUpdate,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    budget = (db.query(Budget)
              .filter(Budget.id == budget_id, Budget.user_id == user.id).first())
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    if payload.amount is not None:
        budget.amount = payload.amount
    if payload.alert_threshold is not None:
        budget.alert_threshold = payload.alert_threshold
    if payload.is_active is not None:
        budget.is_active = payload.is_active
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    budget = (db.query(Budget)
              .filter(Budget.id == budget_id, Budget.user_id == user.id).first())
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
