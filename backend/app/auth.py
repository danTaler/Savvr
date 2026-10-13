import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

PRODUCTION = os.getenv("APP_ENV") == "production"
PASSWORD = os.getenv("APP_PASSWORD", "budget-local-dev")
SECRET = os.getenv("SESSION_SECRET", secrets.token_hex(32))
if PRODUCTION and (
    len(PASSWORD) < 16 or PASSWORD == "budget-local-dev"
    or len(os.getenv("SESSION_SECRET", "")) < 32
):
    raise RuntimeError("Production requires APP_PASSWORD (16+ chars) and SESSION_SECRET (32+ chars).")

serializer = URLSafeTimedSerializer(
    SECRET, salt=hashlib.sha256(PASSWORD.encode()).hexdigest(),
)
COOKIE = "budget_session"
attempts: dict[str, deque] = defaultdict(deque)


def authenticate(request: Request):
    try:
        identity = serializer.loads(request.cookies.get(COOKIE, ""), max_age=43200)
        if identity != "owner":
            raise HTTPException(401, "Sign in to continue.")
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Sign in to continue.") from None


def check_password(request: Request, password: str):
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    history = attempts[key]
    while history and history[0] < now - 60:
        history.popleft()
    if len(history) >= 5:
        raise HTTPException(429, "Too many attempts. Try again in a minute.")
    history.append(now)
    if not hmac.compare_digest(password.encode(), PASSWORD.encode()):
        raise HTTPException(401, "Incorrect password.")
    history.clear()
