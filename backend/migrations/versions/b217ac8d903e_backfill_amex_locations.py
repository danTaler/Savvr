"""Backfill direct Amex locations without changing transaction identities."""

import hashlib
import json
import re

from alembic import op
import sqlalchemy as sa

revision = "b217ac8d903e"
down_revision = "79ece444a382"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    transactions = sa.table(
        "transactions", sa.column("id", sa.Integer),
        sa.column("account_id", sa.Integer), sa.column("raw", sa.JSON),
        sa.column("location", sa.String), sa.column("fingerprint", sa.String),
    )
    accounts = sa.table(
        "accounts", sa.column("id", sa.Integer),
        sa.column("provider", sa.String), sa.column("name", sa.String),
    )
    rows = connection.execute(sa.select(
        transactions.c.id, transactions.c.raw, transactions.c.location,
        accounts.c.provider, accounts.c.name,
    ).join(accounts, transactions.c.account_id == accounts.c.id)).mappings().all()
    for row in rows:
        raw = row["raw"]
        if not isinstance(raw, dict):
            continue
        values = {}
        # Older versions included a derived location in the source fingerprint.
        source = {k: v for k, v in raw.items() if k not in {
            "account_number", "account_name", "provider_name", "location",
        }}
        values["fingerprint"] = hashlib.sha256(
            json.dumps(source, sort_keys=True).encode(),
        ).hexdigest()
        if not row["location"] and row["provider"] == "American Express" and row["name"].startswith("American Express - "):
            description = str(raw.get("description", "")).strip()
            segments = re.split(r"\s{2,}", description)
            words = description.split()
            candidate = segments[-1] if len(segments) > 1 else (words[-1] if len(words) > 1 else "")
            if candidate and any(c.isalpha() for c in candidate):
                values["location"] = candidate
        connection.execute(transactions.update().where(transactions.c.id == row["id"]).values(**values))


def downgrade():
    # Derived values are retained; downgrading the preceding revision drops them.
    pass
