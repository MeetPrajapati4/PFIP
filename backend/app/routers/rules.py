from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import CategoryRule, User
from app.schemas import RuleCreate, RuleOut
from app.services import rules_service

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[RuleOut])
def list_rules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (db.query(CategoryRule).filter(CategoryRule.user_id == user.id)
            .order_by(CategoryRule.priority, CategoryRule.id).all())


@router.post("", status_code=201)
def create_rule(payload: RuleCreate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    count = db.query(CategoryRule).filter(CategoryRule.user_id == user.id).count()
    if count >= rules_service.MAX_RULES_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=f"Rule limit reached ({rules_service.MAX_RULES_PER_USER}). Remove one first.")

    rule = CategoryRule(user_id=user.id, match_type=payload.match_type,
                        pattern=payload.pattern.strip(), category=payload.category,
                        priority=payload.priority)
    db.add(rule)
    db.commit()
    db.refresh(rule)

    # Applying the rule to history is the point — otherwise the user still has
    # to fix every transaction that made them write it.
    applied = rules_service.backfill(db, user.id, rule) if payload.backfill else 0
    return {"rule": RuleOut.model_validate(rule), "applied": applied}


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    rule = (db.query(CategoryRule)
            .filter(CategoryRule.id == rule_id, CategoryRule.user_id == user.id).first())
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
