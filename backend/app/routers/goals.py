from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Goal, User
from app.schemas import GoalContribution, GoalCreate, GoalUpdate
from app.services import goal_service

router = APIRouter(prefix="/api/goals", tags=["goals"])

MAX_GOALS = 20


@router.get("")
def list_goals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return goal_service.evaluate(db, user.id)


@router.post("", status_code=201)
def create_goal(payload: GoalCreate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    if db.query(Goal).filter(Goal.user_id == user.id, Goal.status != "archived").count() >= MAX_GOALS:
        raise HTTPException(status_code=409,
                            detail=f"You can track up to {MAX_GOALS} goals at once.")
    goal = Goal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    db.commit()
    return goal_service.evaluate(db, user.id)


@router.patch("/{goal_id}")
def update_goal(goal_id: int, payload: GoalUpdate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    return goal_service.evaluate(db, user.id)


@router.post("/{goal_id}/contribute")
def contribute(goal_id: int, payload: GoalContribution,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.current_amount = min(goal.current_amount + payload.amount, goal.target_amount)
    if goal.current_amount >= goal.target_amount:
        goal.status = "achieved"
    db.commit()
    return goal_service.evaluate(db, user.id)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
