from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Transaction, User
from app.schemas import (
    BulkTransactionUpdate, TransactionOut, TransactionPage, TransactionUpdate,
)
from app.services import rules_service
from app.services.categorizer import CATEGORIES

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

SORT_COLUMNS = {
    "date": Transaction.date,
    "amount": Transaction.amount,
    "merchant": Transaction.merchant,
    "category": Transaction.category,
}


def _apply_filters(q, *, month: str | None, date_from: date | None, date_to: date | None,
                   category: str | None, search: str | None, kind: str | None,
                   flag: str | None, min_amount: float | None, max_amount: float | None,
                   statement_id: int | None):
    if month:
        y, m = int(month[:4]), int(month[5:7])
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        q = q.filter(Transaction.date >= start, Transaction.date < end)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)
    if category:
        q = q.filter(Transaction.category == category)
    if statement_id:
        q = q.filter(Transaction.statement_id == statement_id)
    if search:
        pattern = f"%{search}%"
        q = q.filter(or_(Transaction.description.ilike(pattern),
                         Transaction.merchant.ilike(pattern),
                         Transaction.notes.ilike(pattern)))
    if kind == "income":
        q = q.filter(Transaction.amount > 0)
    elif kind == "expense":
        q = q.filter(Transaction.amount < 0)
    if flag == "recurring":
        q = q.filter(Transaction.is_recurring.is_(True))
    elif flag == "anomaly":
        q = q.filter(Transaction.is_anomaly.is_(True))
    elif flag == "excluded":
        q = q.filter(Transaction.is_excluded.is_(True))
    # Magnitude filters read naturally: "over 5000" should match a -8000 debit.
    if min_amount is not None:
        q = q.filter(func.abs(Transaction.amount) >= min_amount)
    if max_amount is not None:
        q = q.filter(func.abs(Transaction.amount) <= max_amount)
    return q


@router.get("", response_model=TransactionPage)
def list_transactions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    search: str | None = Query(None, max_length=120),
    kind: str | None = Query(None, pattern="^(income|expense)$"),
    flag: str | None = Query(None, pattern="^(recurring|anomaly|excluded)$"),
    statement_id: int | None = None,
    min_amount: float | None = Query(None, ge=0),
    max_amount: float | None = Query(None, ge=0),
    sort: str = Query("date", pattern="^(date|amount|merchant|category)$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
):
    q = _apply_filters(
        db.query(Transaction).filter(Transaction.user_id == user.id),
        month=month, date_from=date_from, date_to=date_to, category=category,
        search=search, kind=kind, flag=flag, min_amount=min_amount,
        max_amount=max_amount, statement_id=statement_id,
    )

    total = q.count()
    # Footer totals must describe the whole filtered set, not the page.
    inflow = q.with_entities(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.amount > 0).scalar() or 0.0
    outflow = q.with_entities(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.amount < 0).scalar() or 0.0

    column = SORT_COLUMNS[sort]
    order = column.asc() if direction == "asc" else column.desc()
    items = (q.order_by(order, Transaction.id.desc())
             .offset((page - 1) * page_size).limit(page_size).all())

    return TransactionPage(
        items=items, total=total, page=page, page_size=page_size,
        totals={"inflow": round(inflow, 2), "outflow": round(-outflow, 2),
                "net": round(inflow + outflow, 2)},
    )


@router.get("/categories", response_model=list[str])
def list_categories():
    return CATEGORIES


@router.get("/merchants", response_model=list[str])
def list_merchants(user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   search: str | None = Query(None, max_length=80),
                   limit: int = Query(20, ge=1, le=100)):
    """Merchant autocomplete for search and rule creation."""
    q = (db.query(Transaction.merchant, func.count(Transaction.id).label("n"))
         .filter(Transaction.user_id == user.id, Transaction.merchant != ""))
    if search:
        q = q.filter(Transaction.merchant.ilike(f"%{search}%"))
    rows = q.group_by(Transaction.merchant).order_by(func.count(Transaction.id).desc()).limit(limit)
    return [r[0] for r in rows]


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: int, payload: TransactionUpdate,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txn = (db.query(Transaction)
           .filter(Transaction.id == transaction_id, Transaction.user_id == user.id).first())
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payload.category is not None and payload.category != txn.category:
        txn.category = payload.category
        txn.category_source = "manual"
        if payload.create_rule:
            rule = rules_service.learn_from_correction(db, user.id, txn, payload.category)
            if rule:
                rules_service.backfill(db, user.id, rule)
    if payload.merchant is not None:
        txn.merchant = payload.merchant.strip()[:255]
    if payload.notes is not None:
        txn.notes = payload.notes.strip()[:2000]
    if payload.tags is not None:
        clean = [t.strip()[:32] for t in payload.tags if t.strip()][:10]
        txn.tags = ",".join(clean)
    if payload.is_excluded is not None:
        txn.is_excluded = payload.is_excluded

    db.commit()
    db.refresh(txn)
    return txn


@router.post("/bulk", response_model=dict)
def bulk_update(payload: BulkTransactionUpdate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Recategorize, exclude or tag a selection in one round trip."""
    txns = (db.query(Transaction)
            .filter(Transaction.user_id == user.id, Transaction.id.in_(payload.ids)).all())
    if not txns:
        raise HTTPException(status_code=404, detail="No matching transactions")

    for txn in txns:
        if payload.category is not None:
            txn.category = payload.category
            txn.category_source = "manual"
        if payload.is_excluded is not None:
            txn.is_excluded = payload.is_excluded
        if payload.add_tags:
            existing = [t for t in (txn.tags or "").split(",") if t]
            merged = existing + [t.strip()[:32] for t in payload.add_tags if t.strip()]
            # dict.fromkeys preserves order while removing duplicates
            txn.tags = ",".join(list(dict.fromkeys(merged))[:10])

    db.commit()
    return {"updated": len(txns)}


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    txn = (db.query(Transaction)
           .filter(Transaction.id == transaction_id, Transaction.user_id == user.id).first())
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()
