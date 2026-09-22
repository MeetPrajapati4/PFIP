from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Insight, User
from app.schemas import InsightOut
from app.services import insights_service

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("", response_model=list[InsightOut])
def list_insights(include_dismissed: bool = False,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Insight).filter(Insight.user_id == user.id)
    if not include_dismissed:
        q = q.filter(Insight.is_dismissed.is_(False))
    # Ordered by id because generate() inserts them already ranked by urgency
    # and money at stake — re-sorting here would undo that work.
    return q.order_by(Insight.id).all()


@router.post("/generate", response_model=list[InsightOut])
def generate(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return insights_service.generate(db, user.id)


@router.post("/{insight_id}/dismiss", status_code=204)
def dismiss(insight_id: int, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    insight = (db.query(Insight)
               .filter(Insight.id == insight_id, Insight.user_id == user.id).first())
    if insight is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    insight.is_dismissed = True
    db.commit()
