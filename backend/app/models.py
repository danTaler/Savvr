from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base, Money


def now():
    return datetime.now(timezone.utc)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("provider", "identity"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(120))
    identity: Mapped[str] = mapped_column(String(300))
    number: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(160))
    currency: Mapped[str] = mapped_column(String(3))
    kind: Mapped[str] = mapped_column(String(30), default="bank")


class Property(Base):
    __tablename__ = "properties"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(300), default="")
    notes: Mapped[str] = mapped_column(String(1000), default="")


class AccountAlias(Base):
    __tablename__ = "account_aliases"
    __table_args__ = (UniqueConstraint("provider", "identity"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(120))
    identity: Mapped[str] = mapped_column(String(300))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))


class Loan(Base):
    __tablename__ = "loans"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), unique=True)
    offset_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    balance: Mapped[Decimal | None] = mapped_column(Money())
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    balance_as_of: Mapped[date | None] = mapped_column(Date)


class LoanProperty(Base):
    __tablename__ = "loan_properties"
    __table_args__ = (UniqueConstraint("loan_id", "property_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"))
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    share: Mapped[Decimal] = mapped_column(Numeric(7, 4))


class IncomeSource(Base):
    __tablename__ = "income_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(30))
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id"))
    expected_monthly: Mapped[Decimal | None] = mapped_column(Money())
    currency: Mapped[str] = mapped_column(String(3), default="AUD")


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    digest: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20), default="preview")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    rows: Mapped[list] = mapped_column(JSON)
    summary: Mapped[dict] = mapped_column(JSON)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("account_id", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(160))
    import_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"))
    description: Mapped[str] = mapped_column(String(2000))
    amount: Mapped[Decimal] = mapped_column(Money())
    currency: Mapped[str] = mapped_column(String(3))
    transaction_date: Mapped[date] = mapped_column(Date, index=True)
    posted_date: Mapped[date | None] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(160))
    budget_category: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30))
    suggestion: Mapped[str] = mapped_column(String(30), default="")
    included: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(String(2000), default="")
    location: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id"))
    income_source_id: Mapped[int | None] = mapped_column(ForeignKey("income_sources.id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    raw: Mapped[dict] = mapped_column(JSON)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("month", "category", "currency"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7))
    category: Mapped[str] = mapped_column(String(160))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Money())
