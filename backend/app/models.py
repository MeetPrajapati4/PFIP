from datetime import datetime, date

from sqlalchemy import (
    String, Float, Date, DateTime, ForeignKey, Boolean, Text, Integer,
    Index, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(512))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    locale: Mapped[str] = mapped_column(String(16), default="en-IN")
    # Optional user-declared monthly take-home; used for budget suggestions when
    # income is irregular or not yet visible in the imported history.
    monthly_income_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    emergency_fund_months: Mapped[int] = mapped_column(Integer, default=6)
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    statements: Mapped[list["Statement"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Statement(Base):
    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    bank_name: Mapped[str] = mapped_column(String(255), default="Unknown Bank")
    account_hint: Mapped[str] = mapped_column(String(64), default="")
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    # queued | parsing | categorizing | enriching | processed | failed
    status: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage_label: Mapped[str] = mapped_column(String(120), default="Queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    categorization_source: Mapped[str] = mapped_column(String(32), default="local")  # gemini | local
    checksum: Mapped[str] = mapped_column(String(64), default="", index=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="statements")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="statement", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    statement_id: Mapped[int | None] = mapped_column(ForeignKey("statements.id"), nullable=True, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(Text)
    merchant: Mapped[str] = mapped_column(String(255), default="", index=True)
    # Signed amount: positive = credit / income, negative = debit / expense
    amount: Mapped[float] = mapped_column(Float)
    balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="Miscellaneous", index=True)
    # How the category was decided: gemini | local | rule | manual
    category_source: Mapped[str] = mapped_column(String(16), default="local")
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    is_anomaly: Mapped[bool] = mapped_column(Boolean, default=False)
    # Excluded rows still appear in the ledger but are kept out of every metric.
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(255), default="")  # comma-separated
    # Stable hash of (date, amount, normalized description) — used to skip rows
    # already imported when a statement overlaps a previous upload.
    fingerprint: Mapped[str] = mapped_column(String(64), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="transactions")
    statement: Mapped["Statement | None"] = relationship(back_populates="transactions")

    __table_args__ = (
        Index("ix_txn_user_date", "user_id", "date"),
        Index("ix_txn_user_fingerprint", "user_id", "fingerprint"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    # JSON blob describing what data the answer was grounded in (chips in the UI)
    grounding: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # spike | subscription | duplicate | anomaly | tip | summary | budget | goal | forecast
    type: Mapped[str] = mapped_column(String(48))
    severity: Mapped[str] = mapped_column(String(16), default="info")  # info | warning | positive
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    month: Mapped[str | None] = mapped_column(String(7), nullable=True)  # YYYY-MM
    # Estimated money at stake — drives ordering, so the most valuable insight leads.
    impact: Mapped[float] = mapped_column(Float, default=0.0)
    action_label: Mapped[str] = mapped_column(String(80), default="")
    action_href: Mapped[str] = mapped_column(String(160), default="")
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Float)
    # Rolls forward every month until the user changes it.
    period: Mapped[str] = mapped_column(String(16), default="monthly")
    alert_threshold: Mapped[int] = mapped_column(Integer, default=80)  # percent
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_budget_user_category"),)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    target_amount: Mapped[float] = mapped_column(Float)
    current_amount: Mapped[float] = mapped_column(Float, default=0.0)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    icon: Mapped[str] = mapped_column(String(32), default="target")
    color: Mapped[str] = mapped_column(String(16), default="mint")
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | achieved | archived
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CategoryRule(Base):
    """User-owned rule: when a narration matches, force this category.

    Rules are created explicitly from the Settings page, or implicitly when the
    user recategorizes a transaction and asks PFIP to remember the choice. They
    are applied during import (before the AI) and win over every other source.
    """

    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    match_type: Mapped[str] = mapped_column(String(16), default="contains")  # contains | equals | regex
    pattern: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(64))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
