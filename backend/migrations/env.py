from alembic import context

from app.database import Base, Money, engine
from app import models  # noqa: F401


def render_item(type_, obj, _):
    if type_ == "type" and isinstance(obj, Money):
        return 'sa.BigInteger().with_variant(sa.Numeric(18, 2), "postgresql")'
    return False


with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True, render_item=render_item)
    with context.begin_transaction():
        context.run_migrations()
