from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Budget, CategoryRule, ChatMessage, Goal, Insight, Statement, Transaction, User,
)
from app.schemas import (
    LoginRequest, PasswordChange, RegisterRequest, TokenResponse, UserOut, UserUpdate,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Pre-computed dummy hash so failed lookups take exactly 1 verification iteration, matching existing users
_DUMMY_HASH = hash_password("timing-equalizer")


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, name=payload.name.strip(), password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    # Verify against a dummy hash when the account is missing so a wrong email
    # and a wrong password take the same time to answer.
    if user is None:
        verify_password(payload.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    data = payload.model_dump(exclude_unset=True)
    if data.pop("mark_onboarded", False):
        user.onboarded_at = datetime.utcnow()
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/password", status_code=204)
def change_password(payload: PasswordChange, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()


@router.delete("/me/data", status_code=204)
def delete_all_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Wipe financial data but keep the account.

    Separate from account deletion on purpose: 'let me start over with a clean
    import' is a much more common intent than 'delete me'.
    """
    for model in (Transaction, Statement, Insight, ChatMessage, Budget, Goal, CategoryRule):
        db.query(model).filter(model.user_id == user.id).delete()
    db.commit()


@router.delete("/me", status_code=204)
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for model in (Transaction, Statement, Insight, ChatMessage, Budget, Goal, CategoryRule):
        db.query(model).filter(model.user_id == user.id).delete()
    db.delete(user)
    db.commit()
