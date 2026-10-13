import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import auth, main
from app.database import Base, get_db


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(main, "SessionLocal", sessions)
    auth.attempts.clear()

    def database():
        with sessions() as db:
            yield db

    main.app.dependency_overrides[get_db] = database
    with TestClient(main.app) as test_client:
        assert test_client.post("/api/auth/login", json={"password": auth.PASSWORD}).status_code == 200
        yield test_client
    main.app.dependency_overrides.clear()
    engine.dispose()
