import os
from decimal import Decimal
from pathlib import Path

from sqlalchemy import BigInteger, Numeric, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA / 'budget.db'}")
if DATABASE_URL.startswith("sqlite"):
    DATA.mkdir(mode=0o700, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30}
    if DATABASE_URL.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


class Base(DeclarativeBase):
    pass


class Money(TypeDecorator):
    """Keep cents exact on SQLite, which otherwise stores Numeric as floats."""

    impl = Numeric(18, 2)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(BigInteger() if dialect.name == "sqlite" else Numeric(18, 2))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        value = Decimal(value)
        return int(value * 100) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return (Decimal(value) / 100).quantize(Decimal("0.01")) if dialect.name == "sqlite" else value


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session
