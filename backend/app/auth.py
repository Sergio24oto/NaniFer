import hashlib
import hmac
import secrets
from datetime import timedelta
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from .db import get_db
from .models import Session, User, now

COOKIE = "nf_session"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password):
    salt = secrets.token_bytes(16)
    hashed = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${hashed.hex()}"


def verify(password, stored):
    try:
        _, salt, expected = stored.split("$")
        actual = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def current_session(request: Request, db=Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    session = db.get(Session, digest(token)) if token else None
    user = (
        db.get(User, session.user_id)
        if session and session.expires_at > now()
        else None
    )
    if not user or not user.active or user.role not in ("staff", "admin"):
        raise HTTPException(401, "Iniciá sesión para entrar a atención.")
    if request.method not in ("GET", "HEAD") and not hmac.compare_digest(
        request.headers.get("X-CSRF-Token", ""), session.csrf
    ):
        raise HTTPException(403, "Sesión desactualizada. Volvé a iniciar sesión.")
    return user, session
