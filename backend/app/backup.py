"""Create a consistent SQLite backup without copying an active WAL file."""

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.engine import make_url

from .database import DATABASE_URL


def backup(destination: Path) -> Path:
    url = make_url(DATABASE_URL)
    if url.get_backend_name() != "sqlite" or not url.database:
        raise ValueError("Use pg_dump for PostgreSQL databases.")
    source = Path(url.database)
    if not source.is_file():
        raise ValueError("Database does not exist. Start the app first.")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = destination / f"hearth-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}.sqlite3"
    with sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True) as incoming, sqlite3.connect(target) as outgoing:
        incoming.backup(outgoing)
        if outgoing.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backup integrity check failed.")
    target.chmod(0o600)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(backup(args.destination))
