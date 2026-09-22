import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_user_from_token
from app.models import Budget, Goal, Statement, Transaction, User
from app.services import analytics, budget_service, forecast_service, goal_service, health_score
from app.services import pdf_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Every download is a plain browser navigation, so these routes authenticate
# via `get_user_from_token` (header or ?token=) rather than the header only.


def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    # utf-8-sig: Excel on Windows misreads ₹ without the BOM.
    writer = csv.writer(buffer)
    writer.writerows(rows)
    payload = "﻿" + buffer.getvalue()
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _filtered_transactions(db: Session, user_id: int, month: str | None,
                           year: int | None) -> list[Transaction]:
    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    if month:
        start, end = analytics.month_bounds(month)
        q = q.filter(Transaction.date >= start, Transaction.date < end)
    if year:
        q = q.filter(Transaction.date >= date(year, 1, 1), Transaction.date < date(year + 1, 1, 1))
    return q.order_by(Transaction.date, Transaction.id).all()


@router.get("/transactions.csv")
def transactions_csv(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
                     year: int | None = Query(None, ge=2000, le=2100),
                     user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    txns = _filtered_transactions(db, user.id, month, year)
    rows = [["Date", "Description", "Merchant", "Category", "Category source", "Amount",
             "Balance", "Recurring", "Anomaly", "Excluded", "Tags", "Notes"]]
    rows += [[t.date.isoformat(), t.description, t.merchant, t.category, t.category_source,
              f"{t.amount:.2f}", f"{t.balance:.2f}" if t.balance is not None else "",
              "yes" if t.is_recurring else "", "yes" if t.is_anomaly else "",
              "yes" if t.is_excluded else "", t.tags, t.notes]
             for t in txns]
    suffix = month or (str(year) if year else "all")
    return _csv_response(rows, f"pfip-transactions-{suffix}.csv")


@router.get("/categories.csv")
def categories_csv(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
                   year: int | None = Query(None, ge=2000, le=2100),
                   user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    """A pivot of spend by category — the shape people paste into a spreadsheet."""
    txns = [t for t in _filtered_transactions(db, user.id, month, year) if not t.is_excluded]
    breakdown = analytics._category_breakdown(txns)
    rows = [["Category", "Amount", "Transactions", "Share %"]]
    rows += [[c["category"], f"{c['amount']:.2f}", c["count"], f"{c['percent']:.1f}"]
             for c in breakdown]
    suffix = month or (str(year) if year else "all")
    return _csv_response(rows, f"pfip-categories-{suffix}.csv")


@router.get("/monthly.pdf")
def monthly_pdf(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
                user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    if not pdf_report.AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="PDF export needs reportlab. Install it with: pip install reportlab")
    data = analytics.monthly(db, user.id, month)
    pdf = pdf_report.monthly_report(data, user_name=user.name, month=month)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="pfip-report-{month}.pdf"'})


@router.get("/yearly.pdf")
def yearly_pdf(year: int = Query(..., ge=2000, le=2100),
               user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    if not pdf_report.AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="PDF export needs reportlab. Install it with: pip install reportlab")
    data = analytics.yearly(db, user.id, year)
    pdf = pdf_report.yearly_report(data, user_name=user.name, year=year)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="pfip-report-{year}.pdf"'})


@router.get("/monthly")
def monthly_report(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
                   user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    return {"type": "monthly_report", "generated_for": user.email,
            **analytics.monthly(db, user.id, month)}


@router.get("/yearly")
def yearly_report(year: int = Query(..., ge=2000, le=2100),
                  user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    return {"type": "yearly_report", "generated_for": user.email,
            **analytics.yearly(db, user.id, year)}


@router.get("/overview")
def overview_report(user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    return {
        "type": "financial_overview",
        "generated_for": user.email,
        "overview": analytics.overview(db, user.id),
        "health": health_score.compute(db, user.id),
        "subscriptions": forecast_service.subscriptions(db, user.id),
        "forecast": forecast_service.forecast(db, user.id, horizon_days=90),
    }


@router.get("/export.json")
def full_export(user: User = Depends(get_user_from_token), db: Session = Depends(get_db)):
    """Complete account export — everything PFIP holds about this user.

    Portability matters for a product built on financial data: the answer to
    "can I get my data out" should be one click, not a support ticket.
    """
    txns = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(
        Transaction.date).all()
    payload = {
        "exported_at": date.today().isoformat(),
        "user": {"name": user.name, "email": user.email, "currency": user.currency,
                 "created_at": user.created_at.isoformat()},
        "statements": [
            {"filename": s.filename, "bank_name": s.bank_name, "status": s.status,
             "transaction_count": s.transaction_count,
             "period_start": s.period_start.isoformat() if s.period_start else None,
             "period_end": s.period_end.isoformat() if s.period_end else None,
             "uploaded_at": s.uploaded_at.isoformat()}
            for s in db.query(Statement).filter(Statement.user_id == user.id).all()
        ],
        "transactions": [
            {"date": t.date.isoformat(), "description": t.description, "merchant": t.merchant,
             "amount": t.amount, "balance": t.balance, "category": t.category,
             "category_source": t.category_source, "is_recurring": t.is_recurring,
             "is_anomaly": t.is_anomaly, "is_excluded": t.is_excluded,
             "tags": [x for x in (t.tags or "").split(",") if x], "notes": t.notes}
            for t in txns
        ],
        "budgets": [
            {"category": b.category, "amount": b.amount, "alert_threshold": b.alert_threshold,
             "is_active": b.is_active}
            for b in db.query(Budget).filter(Budget.user_id == user.id).all()
        ],
        "goals": [
            {"name": g.name, "target_amount": g.target_amount,
             "current_amount": g.current_amount,
             "target_date": g.target_date.isoformat() if g.target_date else None,
             "status": g.status}
            for g in db.query(Goal).filter(Goal.user_id == user.id).all()
        ],
        "analytics": analytics.overview(db, user.id),
        "health": health_score.compute(db, user.id),
        "goal_progress": goal_service.evaluate(db, user.id),
    }
    month = analytics.latest_month(db, user.id)
    if month:
        payload["budget_progress"] = budget_service.evaluate(db, user.id, month)

    body = json.dumps(payload, indent=2, default=str)
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="pfip-full-export.json"'})
