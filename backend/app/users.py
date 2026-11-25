from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select, func, delete, case

from .auth import current_session, password_hash
from .db import get_db
from .models import User, Session
from .schemas import StrictModel
from .services import uid, fail

router = APIRouter(prefix="/api/users", tags=["Usuarios"])


def require_admin(auth):
    if auth[0].role != "admin":
        fail("Solo la dueña o administrador puede gestionar usuarios y contraseñas.", 403)


def user_json(u: User):
    return {
        "id": u.id,
        "username": u.username,
        "name": u.name,
        "role": u.role,
        "active": bool(u.active),
    }


class UserCreateIn(StrictModel):
    username: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=100)
    role: Literal["admin", "staff"] = "staff"
    password: str = Field(min_length=4, max_length=120)


class UserUpdateIn(StrictModel):
    username: str | None = Field(default=None, min_length=2, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    role: Literal["admin", "staff"] | None = None
    active: bool | None = None
    password: str | None = Field(default=None, max_length=120)


@router.get("")
def list_users(auth=Depends(current_session), db=Depends(get_db)):
    require_admin(auth)
    rows = db.scalars(
        select(User)
        .where(User.name != "Prueba automática")
        .order_by(case((User.role == "admin", 0), else_=1), User.name, User.username)
    ).all()
    return {"users": [user_json(u) for u in rows]}


@router.post("")
def create_user(data: UserCreateIn, auth=Depends(current_session), db=Depends(get_db)):
    require_admin(auth)
    clean_username = data.username.strip()
    clean_name = data.name.strip()
    clean_pass = data.password.strip()
    if len(clean_username) < 2:
        fail("El usuario debe tener al menos 2 caracteres.", 422)
    if len(clean_name) < 2:
        fail("El nombre visible debe tener al menos 2 caracteres.", 422)
    if len(clean_pass) < 4:
        fail("La contraseña debe tener al menos 4 caracteres.", 422)

    existing = db.scalar(
        select(User).where(func.lower(User.username) == clean_username.lower())
    )
    if existing:
        fail("Ya existe un usuario con ese nombre de ingreso.", 409)

    new_user = User(
        id=uid(),
        username=clean_username,
        name=clean_name,
        role=data.role,
        active=True,
        password_hash=password_hash(clean_pass),
    )
    db.add(new_user)
    db.commit()
    return user_json(new_user)


@router.put("/{user_id}")
def update_user(
    user_id: str,
    data: UserUpdateIn,
    auth=Depends(current_session),
    db=Depends(get_db),
):
    require_admin(auth)
    current_user, current_sess = auth
    u = db.get(User, user_id)
    if not u:
        fail("Usuario inexistente.", 404)

    if u.id == current_user.id:
        if data.active is False:
            fail("No podés desactivar tu propio usuario en uso.", 422)
        if data.role is not None and data.role != "admin":
            fail("No podés quitarte el rol de administrador a vos misma.", 422)

    if data.username is not None:
        clean_username = data.username.strip()
        if len(clean_username) < 2:
            fail("El usuario debe tener al menos 2 caracteres.", 422)
        conflict = db.scalar(
            select(User).where(
                func.lower(User.username) == clean_username.lower(),
                User.id != u.id,
            )
        )
        if conflict:
            fail("Ya existe otro usuario con ese nombre de ingreso.", 409)
        u.username = clean_username

    if data.name is not None:
        clean_name = data.name.strip()
        if len(clean_name) < 2:
            fail("El nombre visible debe tener al menos 2 caracteres.", 422)
        u.name = clean_name

    revoke_sessions = False

    if data.role is not None and data.role != u.role:
        u.role = data.role
        revoke_sessions = True

    if data.active is not None and data.active != u.active:
        u.active = data.active
        if not u.active:
            revoke_sessions = True

    if data.password is not None and data.password.strip() != "":
        clean_pass = data.password.strip()
        if len(clean_pass) < 4:
            fail("La contraseña debe tener al menos 4 caracteres.", 422)
        u.password_hash = password_hash(clean_pass)
        revoke_sessions = True

    if revoke_sessions:
        stmt = delete(Session).where(Session.user_id == u.id)
        if u.id == current_user.id and u.active and u.role == "admin":
            stmt = stmt.where(Session.token_hash != current_sess.token_hash)
        db.execute(stmt)

    db.commit()
    return user_json(u)
