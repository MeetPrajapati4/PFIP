from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services import analytics, forecast_service, health_score

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.overview(db, user.id)


@router.get("/monthly")
def monthly(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.monthly(db, user.id, month)


@router.get("/yearly")
def yearly(year: int = Query(..., ge=2000, le=2100),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.yearly(db, user.id, year)


@router.get("/calendar")
def calendar(year: int = Query(..., ge=2000, le=2100),
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.calendar_heatmap(db, user.id, year)


@router.get("/health-score")
def health(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return health_score.compute(db, user.id)


@router.get("/forecast")
def forecast(horizon: int = Query(90, ge=7, le=365),
             buffer: float = Query(0, ge=0),
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return forecast_service.forecast(db, user.id, horizon_days=horizon, buffer_amount=buffer)


@router.get("/subscriptions")
def subscriptions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return forecast_service.subscriptions(db, user.id)
