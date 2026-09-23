from datetime import timedelta
import secrets, time
from collections import defaultdict
from fastapi import FastAPI, Depends, Request, Response, HTTPException, Header
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from .config import settings
from .db import get_db
from .models import (
    User,
    Session,
    PublicSession,
    Category,
    Product,
    Flavor,
    Table,
    Visit,
    Order,
    now,
)
from .auth import COOKIE, digest, verify, current_session, password_hash
from .schemas import LoginIn, OrderIn, PayIn, StatusIn, StaffIn, ManualOrderIn, OpenIn
from .services import *

import logging
from contextlib import asynccontextmanager

def ensure_schema():
    # 1. Run Alembic upgrade head
    try:
        from alembic.config import Config
        from alembic import command
        from pathlib import Path
        backend_dir = Path(__file__).resolve().parent.parent
        alembic_ini = backend_dir / "alembic.ini"
        if alembic_ini.exists():
            cfg = Config(str(alembic_ini))
            cfg.set_main_option("script_location", str(backend_dir / "migrations"))
            command.upgrade(cfg, "head")
            logging.info("Alembic schema migrated to head.")
    except Exception as e:
        logging.warning("Alembic auto-upgrade bypassed or failed: %s", e)

    # 2. Resilient direct column verification for products.flavor_options
    try:
        from sqlalchemy import inspect, text
        from .db import engine
        with engine.begin() as conn:
            inspector = inspect(conn)
            cols = [c['name'] for c in inspector.get_columns('products')]
            if 'flavor_options' not in cols:
                conn.execute(text("ALTER TABLE products ADD COLUMN flavor_options JSON NULL"))
                conn.execute(text("UPDATE products SET flavor_options = '[]' WHERE flavor_options IS NULL"))
                logging.info("Added missing column flavor_options to products table.")
    except Exception as e:
        logging.error("Fallback schema check failed: %s", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    yield

app = FastAPI(title="NaniFer POS", version="0.2.0", lifespan=lifespan)
ensure_schema()
login_attempts = defaultdict(list)
DUMMY_HASH = password_hash(secrets.token_urlsafe(24))


@app.middleware("http")
async def browser_guard(request, call_next):
    # Custom header + no cross-origin CORS prevents cross-site form submissions.
    if (
        request.method not in ("GET", "HEAD", "OPTIONS")
        and request.headers.get("X-Requested-With") != "NaniFer"
    ):
        return JSONResponse(
            status_code=403, content={"detail": "Solicitud no autorizada."}
        )
    if request.method == "POST" and request.url.path.startswith("/api/public/") and not request.url.path.startswith('/api/public/qr/'):
        return JSONResponse(status_code=403, content={"detail": "El menú es solo de consulta. Para pedir, llamá a la moza."})
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(SQLAlchemyError)
async def db_error(request, exc):
    logging.exception("Database error occurred on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "No se pudo guardar o consultar la información. Revisá la conexión e intentá nuevamente con la misma operación."
        },
    )


@app.get("/api/health")
def health(db=Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "mysql"}


@app.get("/api/catalog")
def catalog(db=Depends(get_db), auth=Depends(current_session)):
    categories = list(db.scalars(select(Category).order_by(Category.id)))
    names = {c.id: c.name for c in categories}
    from .models import StockItem
    from .stock_accounting import catalog_availability, availability_reason
    stock = {r.id:r for r in db.scalars(select(StockItem))}
    return {
        "categories": [c.name for c in categories],
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "category": names[p.category_id],
                "price": float(p.price),
                "pricePending": p.price_pending,
                "publicCategories": p.public_categories,
                "available": catalog_availability(p, stock)[0] and not p.price_pending,
                "availabilityReason": availability_reason(p, stock),
                "emoji": p.emoji,
                "image": p.image,
                "sizes": catalog_availability(p, stock)[1],
                "extras": p.extras,
                "flavorOptions": p.flavor_options or [],
            }
            for p in db.scalars(select(Product).where(Product.archived == False).order_by(Product.id))
        ],
        "flavors": [
            {"name": f.name, "available": f.available}
            for f in db.scalars(select(Flavor).order_by(Flavor.id))
        ],
    }


@app.post("/api/auth/login")
def login(data: LoginIn, request: Request, response: Response, db=Depends(get_db)):
    ip = request.client.host
    cutoff = time.monotonic() - 60
    for old in list(login_attempts):
        login_attempts[old] = [t for t in login_attempts[old] if t > cutoff]
        if not login_attempts[old]:
            del login_attempts[old]
    if len(login_attempts[ip]) >= 10:
        fail("Demasiados intentos. Esperá un minuto.", 429)
    login_attempts[ip].append(time.monotonic())
    user = db.scalar(select(User).where(User.username == data.username))
    valid = verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or not user.active or user.role not in ("staff", "admin"):
        fail("Usuario o contraseña incorrectos.", 401)
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    db.add(
        Session(
            token_hash=digest(token),
            user_id=user.id,
            csrf=csrf,
            expires_at=now() + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/api",
        max_age=settings.session_hours * 3600,
    )
    return {"user": {"id": user.id, "name": user.name, "role": user.role, "permissions": permissions(user)}, "csrf": csrf}


@app.get("/api/auth/me")
def me(auth=Depends(current_session)):
    user, session = auth
    return {
        "user": {"id": user.id, "name": user.name, "role": user.role, "permissions": permissions(user)},
        "csrf": session.csrf,
    }


@app.post("/api/auth/logout")
def logout(response: Response, auth=Depends(current_session), db=Depends(get_db)):
    db.delete(auth[1])
    db.commit()
    response.delete_cookie(COOKIE, path="/api")
    return {"ok": True}


@app.get("/api/state")
def state(auth=Depends(current_session), db=Depends(get_db)):
    # Include closed visits with undelivered orders defensively; normal close forbids these.
    visits = list(
        db.scalars(
            select(Visit).where(
                (Visit.closed_at == None)
                | (
                    Visit.id.in_(
                        select(Order.visit_id).where(Order.status != "entregado")
                    )
                )
            )
        )
    )
    result = state_for(db, visits, True)
    result["reservations"] = pending_reservations(db)
    from .public_orders import pending_calls
    result['calls'] = pending_calls(db)
    result["calendarToday"] = calendar_today().isoformat()
    from .models import Payment

    payments_query = select(Payment)
    if auth[0].role != "admin":
        from .business_day import period
        _, _, lower, upper = period(None, None, "staff")
        payments_query = payments_query.where(Payment.created_at >= lower, Payment.created_at < upper)
    result["payments"] = [
        {
            "id": p.id,
            "accountId": p.visit_id,
            "table": db.get(Visit, p.visit_id).table_number,
            "total": float(p.amount),
            "method": p.method,
            "createdAt": iso(p.created_at),
        }
        for p in db.scalars(
            payments_query.order_by(Payment.created_at.desc()).limit(20)
        )
    ][::-1]
    return result


def open_table(db, number, user=None):
    lock_table(db, number)
    visit = db.scalar(select(Visit).where(Visit.active_table == number))
    if not visit:
        visit = Visit(
            id=uid(),
            table_number=number,
            active_table=number,
            waitress_id=user.id if user else None,
            public_token_hash=digest(secrets.token_urlsafe(32)),
        )
        db.add(visit)
        db.flush()
    return visit


@app.post("/api/tables/{number}/open")
def open_internal(number: int, data: OpenIn = OpenIn(), auth=Depends(current_session), db=Depends(get_db)):
    lock_table(db, number)
    if not db.scalar(select(Visit.id).where(Visit.active_table == number)):
        check_reservation(db, number, data.reservationAcknowledgment)
    visit = open_table(db, number, auth[0])
    db.commit()
    return {"id": visit.id}


@app.post("/api/visits/{id}/orders")
def internal_order(
    id: str,
    data: ManualOrderIn,
    key: str = Header(alias="Idempotency-Key"),
    auth=Depends(current_session),
    db=Depends(get_db),
):
    visit = lock_visit(db, id)
    if visit.table_number is None:
        fail("Cada compra de Mostrador es independiente. Iniciá otra compra.")
    result = once(
        db, key, "order:" + id, data.model_dump(),
        lambda: make_order(db, visit, data, origin="manual", user=auth[0], delivered=not data.needsPreparation)
    )
    db.commit()
    return result


@app.post("/api/visits/{id}/payments")
def pay(
    id: str,
    data: PayIn,
    key: str = Header(alias="Idempotency-Key"),
    auth=Depends(current_session),
    db=Depends(get_db),
):
    visit = lock_visit(db, id)
    result = once(
        db,
        key,
        "pay:" + id,
        data.model_dump(mode="json"),
        lambda: make_payment(db, visit, data, auth[0]),
    )
    db.commit()
    return result


@app.post("/api/visits/{id}/close")
def close(id: str, auth=Depends(current_session), db=Depends(get_db)):
    visit = lock_visit(db, id)
    result = close_visit(db, visit)
    db.commit()
    return result


@app.put("/api/visits/{id}/staff")
def assign(id: str, data: StaffIn, auth=Depends(current_session), db=Depends(get_db)):
    visit = lock_visit(db, id)
    require_open(visit)
    user = db.get(User, data.userId)
    if not user or not user.active or user.role not in ("staff", "admin"):
        fail("Responsable inválido.", 422)
    visit.waitress_id = user.id
    db.commit()
    return {"ok": True}


@app.post("/api/orders/{id}/advance")
def advance(id: str, data: StatusIn, auth=Depends(current_session), db=Depends(get_db)):
    order = db.get(Order, id)
    if not order:
        fail("Pedido inexistente.", 404)
    lock_visit(db, order.visit_id)
    db.refresh(order)
    if order.status == data.expectedStatus and order.status != STATUSES[-1]:
        order.status = 'entregado' if order.origin=='qr' and order.status=='en preparación' else STATUSES[STATUSES.index(order.status) + 1]
    db.flush()
    visit = db.get(Visit, order.visit_id)
    if visit.table_number is None and order.status == "entregado":
        close_visit(db, visit)
    db.commit()
    return {"id": order.id, "status": order.status}


@app.post("/api/orders/{id}/deliver")
def deliver_order(id: str, auth=Depends(current_session), db=Depends(get_db)):
    order = db.get(Order, id)
    if not order:
        fail("Pedido inexistente.", 404)
    lock_visit(db, order.visit_id)
    order.status = "entregado"
    db.flush()
    visit = db.get(Visit, order.visit_id)
    if visit.table_number is None and not db.scalar(
        select(Order.id).where(Order.visit_id == visit.id, Order.status != "entregado").limit(1)
    ):
        close_visit(db, visit)
    db.commit()
    return {"id": order.id, "status": order.status}


@app.post("/api/visits/{id}/deliver-all")
def deliver_all(id: str, auth=Depends(current_session), db=Depends(get_db)):
    visit = lock_visit(db, id)
    for order in db.scalars(select(Order).where(Order.visit_id == id, Order.status != "entregado")):
        order.status = "entregado"
    db.commit()
    return {"ok": True}


def public_visit(db, request, number):
    token = request.cookies.get("nf_table_" + str(number), "")
    session = db.get(PublicSession, digest(token)) if token else None
    visit = (
        db.get(Visit, session.visit_id)
        if session and session.expires_at > now()
        else None
    )
    return (
        visit
        if visit and visit.table_number == number and not visit.closed_at
        else None
    )


@app.get("/api/public/mesa/{number}")
def public_state(number: int, request: Request, db=Depends(get_db)):
    if not db.get(Table, number):
        fail("Mesa inexistente.", 404)
    return {"table": number}


@app.post("/api/public/mesa/{number}/join")
def join(number: int, request: Request, response: Response, db=Depends(get_db)):
    fail("El menú es solo de consulta. Para pedir, llamá a la moza.", 403)
    visit = open_table(db, number)
    token = secrets.token_urlsafe(32)
    db.add(
        PublicSession(
            token_hash=digest(token),
            visit_id=visit.id,
            expires_at=now() + timedelta(hours=12),
        )
    )
    db.commit()
    response.set_cookie(
        "nf_table_" + str(number),
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/api/public/mesa/" + str(number),
        max_age=43200,
    )
    return {"id": visit.id}


@app.post("/api/public/mesa/{number}/orders")
def public_order(
    number: int,
    data: OrderIn,
    request: Request,
    key: str = Header(alias="Idempotency-Key"),
    db=Depends(get_db),
):
    fail("El menú es solo de consulta. Para pedir, llamá a la moza.", 403)
    visit = public_visit(db, request, number)
    if not visit:
        fail("La visita terminó o venció. Iniciá una nueva visita.", 409)
    visit = lock_visit(db, visit.id)
    result = once(
        db,
        key,
        "order:" + visit.id,
        data.model_dump(),
        lambda: make_order(db, visit, data),
    )
    db.commit()
    return result

from .sales import router as sales_router
app.include_router(sales_router)

from .attention import router as attention_router, permissions, pending_reservations, calendar_today, check_reservation
app.include_router(attention_router)

from .stock import router as stock_router
app.include_router(stock_router)
from .public_orders import router as public_orders_router
app.include_router(public_orders_router)

from .menu_catalog import router as menu_router
app.include_router(menu_router)
