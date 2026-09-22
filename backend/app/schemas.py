import json
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.services.categorizer import CATEGORIES


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    currency: str
    locale: str
    monthly_income_target: float | None
    emergency_fund_months: int
    onboarded_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    locale: str | None = Field(default=None, max_length=16)
    monthly_income_target: float | None = Field(default=None, ge=0, le=1_000_000_000)
    emergency_fund_months: int | None = Field(default=None, ge=1, le=24)
    mark_onboarded: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Statements ----------
class StatementOut(BaseModel):
    id: int
    filename: str
    bank_name: str
    period_start: date | None
    period_end: date | None
    status: str
    progress: int
    stage_label: str
    error_message: str | None
    transaction_count: int
    duplicate_count: int
    categorization_source: str
    file_size: int
    uploaded_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


# ---------- Transactions ----------
class TransactionOut(BaseModel):
    id: int
    date: date
    description: str
    merchant: str
    amount: float
    balance: float | None
    category: str
    category_source: str
    is_recurring: bool
    is_anomaly: bool
    is_excluded: bool
    notes: str
    tags: list[str]
    statement_id: int | None

    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, value):
        if isinstance(value, str):
            return [t for t in (part.strip() for part in value.split(",")) if t]
        return value or []


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    # Totals for the whole filtered set, not just the visible page — otherwise
    # the footer would lie whenever the result spans more than one page.
    totals: dict


class TransactionUpdate(BaseModel):
    category: str | None = None
    merchant: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    is_excluded: bool | None = None
    # When true, remember the category choice for this merchant going forward.
    create_rule: bool = False

    @field_validator("category")
    @classmethod
    def known_category(cls, value):
        if value is not None and value not in CATEGORIES:
            raise ValueError(f"Unknown category: {value}")
        return value


class BulkTransactionUpdate(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    category: str | None = None
    is_excluded: bool | None = None
    add_tags: list[str] | None = None

    @field_validator("category")
    @classmethod
    def known_category(cls, value):
        if value is not None and value not in CATEGORIES:
            raise ValueError(f"Unknown category: {value}")
        return value


# ---------- Chat ----------
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    grounding: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("grounding", mode="before")
    @classmethod
    def parse_grounding(cls, value):
        if isinstance(value, str):
            if not value:
                return []
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                return []
        return value or []


# ---------- Insights ----------
class InsightOut(BaseModel):
    id: int
    type: str
    severity: str
    title: str
    body: str
    month: str | None
    impact: float
    action_label: str
    action_href: str
    is_dismissed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Budgets ----------
class BudgetCreate(BaseModel):
    category: str
    amount: float = Field(gt=0, le=100_000_000)
    alert_threshold: int = Field(default=80, ge=10, le=100)

    @field_validator("category")
    @classmethod
    def known_category(cls, value):
        if value not in CATEGORIES:
            raise ValueError(f"Unknown category: {value}")
        return value


class BudgetUpdate(BaseModel):
    amount: float | None = Field(default=None, gt=0, le=100_000_000)
    alert_threshold: int | None = Field(default=None, ge=10, le=100)
    is_active: bool | None = None


class BudgetOut(BaseModel):
    id: int
    category: str
    amount: float
    alert_threshold: int
    is_active: bool

    model_config = {"from_attributes": True}


# ---------- Goals ----------
class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_amount: float = Field(gt=0, le=1_000_000_000)
    current_amount: float = Field(default=0, ge=0, le=1_000_000_000)
    target_date: date | None = None
    icon: str = Field(default="target", max_length=32)
    color: str = Field(default="mint", max_length=16)


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_amount: float | None = Field(default=None, gt=0, le=1_000_000_000)
    current_amount: float | None = Field(default=None, ge=0, le=1_000_000_000)
    target_date: date | None = None
    icon: str | None = Field(default=None, max_length=32)
    color: str | None = Field(default=None, max_length=16)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def known_status(cls, value):
        if value is not None and value not in ("active", "achieved", "archived"):
            raise ValueError("status must be active, achieved or archived")
        return value


class GoalContribution(BaseModel):
    amount: float = Field(gt=0, le=1_000_000_000)


# ---------- Category rules ----------
class RuleCreate(BaseModel):
    pattern: str = Field(min_length=2, max_length=255)
    category: str
    match_type: str = Field(default="contains")
    priority: int = Field(default=100, ge=1, le=1000)
    backfill: bool = True

    @field_validator("category")
    @classmethod
    def known_category(cls, value):
        if value not in CATEGORIES:
            raise ValueError(f"Unknown category: {value}")
        return value

    @field_validator("match_type")
    @classmethod
    def known_match_type(cls, value):
        if value not in ("contains", "equals", "regex"):
            raise ValueError("match_type must be contains, equals or regex")
        return value


class RuleOut(BaseModel):
    id: int
    match_type: str
    pattern: str
    category: str
    priority: int
    hits: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
