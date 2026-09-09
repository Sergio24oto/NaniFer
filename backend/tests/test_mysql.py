import os, secrets, uuid, subprocess, time, socket
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest, httpx
from fastapi.testclient import TestClient
from sqlalchemy import select, delete, text, create_engine
from app.main import app
from app.db import SessionLocal, engine
from app.models import (
    Sale, SaleAllocation, SaleCorrection, Reservation, StockItem, StockMovement, Supplier,
    User,
    Category,
    Product,
    Table,
    Visit,
    Order,
    OrderItem,
    Payment,
    Operation,
    Session,
    PublicSession,
    Flavor,
)
from app.auth import password_hash
from app.config import settings

pytestmark = pytest.mark.mysql
HEADERS = {"X-Requested-With": "NaniFer"}


def key():
    return uuid.uuid4().hex


@pytest.fixture
def fixture():
    assert settings.db_name.endswith(
        ("_dev", "_test")
    ), "Tests only run in a development/test database"
    tag = key()
    user_id = key()
    category_id = key()
    product_id = key()
    flavor_id = key()
    password = secrets.token_urlsafe(24)
    with SessionLocal() as db:
        used = set(db.scalars(select(Table.number)))
        number = 1000
        while number in used:
            number += 1
        db.add_all(
            [
                User(
                    id=user_id,
                    username="test_" + tag,
                    name="Prueba automática",
                    role="staff",
                    password_hash=password_hash(password),
                ),
                Category(id=category_id, name="Test " + tag),
                Table(number=number),
                Flavor(id=flavor_id, name="Sabor " + tag, available=False),
            ]
        )
        db.flush()
        db.add(
            Product(
                id=product_id,
                category_id=category_id,
                name="Producto de prueba",
                price=Decimal("1000.00"),
                available=True,
                sizes=[],
                extras=[],
            )
        )
        db.commit()
    numbers = [number]
    extra_stock_ids = []
    product_ids = [product_id]
    client = TestClient(app, headers=HEADERS, client=("fixture-" + tag, 50000))
    try:
        login = client.post(
            "/api/auth/login", json={"username": "test_" + tag, "password": password}
        )
        assert login.status_code == 200
        client.headers["X-CSRF-Token"] = login.json()["csrf"]
        f = {
            "client": client,
            "table": number,
            "tables": numbers,
            "flavor": flavor_id,
            "stock_ids": extra_stock_ids,
            "product_ids": product_ids,
            "product": product_id,
            "password": password,
            "username": "test_" + tag,
            "user_id": user_id,
        }
        yield f
    finally:
        client.close()
        # Only delete records owned by this fixture, never demo or user-created visits.
        with SessionLocal() as db:
            visits = list(
                db.scalars(select(Visit.id).where((Visit.table_number.in_(numbers)) | ((Visit.table_number == None) & (Visit.waitress_id == user_id))))
            )
            orders = list(
                db.scalars(select(Order.id).where(Order.visit_id.in_(visits)))
            )
            payment_ids = list(db.scalars(select(Payment.id).where(Payment.visit_id.in_(visits))))
            reservations = list(db.scalars(select(Reservation.id).where(Reservation.table_number.in_(numbers))))
            stock_ids = list(db.scalars(select(StockItem.id).where((StockItem.product_id.in_(product_ids)) | (StockItem.flavor_id == flavor_id) | StockItem.id.in_(extra_stock_ids))))
            for model, condition in [
                (
                    Operation,
                    Operation.scope.in_(
                        ["order:" + v for v in visits] + ["pay:" + v for v in visits] + ["correct:" + p for p in payment_ids]
                        + ["reservation:" + r for r in reservations] + [f"reservation-create:{n}" for n in numbers] + [f"consumptions:{n}" for n in numbers] + ["catalog-product:" + user_id, "catalog-category:" + user_id, "counter:" + user_id, "supplier:" + user_id, "stock-flavor:" + flavor_id] + ["stock-move:" + sid for sid in stock_ids] + ["stock-config:" + pid for pid in product_ids]
                    ),
                ),
                (StockMovement, StockMovement.stock_id.in_(stock_ids)),
                (StockItem, StockItem.id.in_(stock_ids)),
                (Supplier, Supplier.created_by == user_id),
                (SaleCorrection, SaleCorrection.sale_id.in_(payment_ids)),
                (SaleAllocation, SaleAllocation.sale_id.in_(payment_ids)),
                (Sale, Sale.id.in_(payment_ids)),
                (OrderItem, OrderItem.order_id.in_(orders)),
                (Order, Order.visit_id.in_(visits)),
                (Payment, Payment.visit_id.in_(visits)),
                (PublicSession, PublicSession.visit_id.in_(visits)),
                (Reservation, Reservation.table_number.in_(numbers)),
                (Visit, Visit.id.in_(visits)),
                (Session, Session.user_id == user_id),
                (User, User.id == user_id),
                (Product, Product.id.in_(product_ids)),
                (Flavor, Flavor.id == flavor_id),
                (Category, Category.id == category_id),
                (Table, Table.number.in_(numbers)),
            ]:
                db.execute(delete(model).where(condition))
            db.commit()


def open_visit(f):
    r = f["client"].post(f"/api/tables/{f['table']}/open")
    assert r.status_code == 200
    return r.json()["id"]


def order(f, visit, token=None):
    return f["client"].post(
        "/api/visits/" + visit + "/orders",
        json={
            "expectedAccount": visit,
            "needsPreparation": True,
            "items": [{"productId": f["product"], "quantity": 1}],
        },
        headers={"Idempotency-Key": token or key()},
    )


def account(f, visit):
    return next(
        a for a in f["client"].get("/api/state").json()["accounts"] if a["id"] == visit
    )


def pay(f, visit, amount, token=None):
    return f["client"].post(
        "/api/visits/" + visit + "/payments",
        json={"method": "efectivo", "received": 5000, "expectedBalance": amount},
        headers={"Idempotency-Key": token or key()},
    )


def deliver(f, id):
    for status in ["pendiente", "en preparación", "listo para entregar"]:
        assert (
            f["client"]
            .post("/api/orders/" + id + "/advance", json={"expectedStatus": status})
            .status_code
            == 200
        )


def test_complete_lifecycle_and_historical_prices(fixture):
    f = fixture
    v = open_visit(f)
    first = order(f, v)
    assert first.status_code == 200
    assert account(f, v)["balance"] == 1000
    # Pay BEFORE preparing. Delivery remains visible and closing is blocked.
    assert pay(f, v, 1000).json()["change"] == 4000
    assert account(f, v)["balance"] == 0
    assert f["client"].post("/api/visits/" + v + "/close").status_code == 409
    state = f["client"].get("/api/state").json()
    assert any(
        o["id"] == first.json()["id"] and o["status"] == "pendiente"
        for o in state["orders"]
    )
    deliver(f, first.json()["id"])
    with SessionLocal() as db:
        db.get(Product, f["product"]).price = Decimal("1500")
        db.commit()
    second = order(f, v)
    assert second.status_code == 200
    a = account(f, v)
    assert (a["total"], a["paid"], a["balance"]) == (2500, 1000, 1500)
    assert pay(f, v, 2500).status_code == 409
    assert pay(f, v, 1500).status_code == 200
    deliver(f, second.json()["id"])
    assert f["client"].post("/api/visits/" + v + "/close").status_code == 200
    new = open_visit(f)
    assert new != v
    assert account(f, new)["total"] == 0
    with SessionLocal() as db:
        assert db.get(Visit, v).closed_at is not None
        assert db.get(Order, first.json()["id"]) is not None


def test_duplicate_and_simultaneous_orders(fixture):
    f = fixture
    v = open_visit(f)
    token = key()

    def send(_):
        with TestClient(
            app, headers=dict(f["client"].headers), cookies=f["client"].cookies
        ) as c:
            return c.post(
                "/api/visits/" + v + "/orders",
                json={
                    "expectedAccount": v,
                    "needsPreparation": True,
                    "items": [{"productId": f["product"], "quantity": 1}],
                },
                headers={"Idempotency-Key": token},
            )

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert [r.status_code for r in results] == [200] * 4
    assert len({r.json()["id"] for r in results}) == 1
    assert account(f, v)["total"] == 1000
    assert order(f, v, token).json()["id"] == results[0].json()["id"]


def test_duplicate_and_simultaneous_payments(fixture):
    f = fixture
    v = open_visit(f)
    order(f, v)
    token = key()

    def send(token):
        with TestClient(
            app, headers=dict(f["client"].headers), cookies=f["client"].cookies
        ) as c:
            return c.post(
                "/api/visits/" + v + "/payments",
                json={"method": "tarjeta", "expectedBalance": 1000},
                headers={"Idempotency-Key": token},
            )

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(send, [token, token, key()]))
    same = results[:2]
    assert all(r.status_code == same[0].status_code for r in same)
    assert any(r.status_code == 200 for r in results)
    assert account(f, v)["paid"] == 1000
    with SessionLocal() as db:
        assert len(list(db.scalars(select(Payment).where(Payment.visit_id == v)))) == 1


def test_public_ordering_disabled(fixture):
    with TestClient(app, headers=HEADERS) as c:
        assert c.post(f"/api/public/mesa/{fixture['table']}/join").status_code == 403
        assert c.post(f"/api/public/mesa/{fixture['table']}/orders", json={"expectedAccount":None,"items":[{"productId":fixture['product'],"quantity":1}]},headers={"Idempotency-Key":key()}).status_code == 403
        assert c.get(f"/api/public/mesa/{fixture['table']}").json()=={"table":fixture['table']}


def test_permissions_csrf_and_no_confirmation_on_db_failure(fixture):
    f = fixture
    v = open_visit(f)
    with TestClient(app, cookies=f["client"].cookies, headers=HEADERS) as no_csrf:
        assert no_csrf.post("/api/visits/" + v + "/close").status_code == 403
    with SessionLocal() as db:
        db.get(User, f["user_id"]).role = "viewer"
        db.commit()
    assert f["client"].get("/api/state").status_code == 401
    # Fail the dependency without changing MySQL configuration.
    from app.db import get_db
    from sqlalchemy.exc import OperationalError

    def unavailable():
        raise OperationalError("redacted", {}, Exception("offline"))

    app.dependency_overrides[get_db] = unavailable
    try:
        c = TestClient(app, headers=HEADERS)
        r = c.post("/api/tables/1/open")
        assert r.status_code == 503
        assert "id" not in r.json()
        assert "offline" not in r.text
    finally:
        app.dependency_overrides.clear()


def test_restart_process_preserves_mysql_data(fixture):
    f = fixture
    v = open_visit(f)
    r = order(f, v)
    assert r.status_code == 200
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    def boot():
        import sys

        p = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=Path(__file__).resolve().parents[1],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(80):
            try:
                if (
                    httpx.get(
                        f"http://127.0.0.1:{port}/api/health", timeout=1
                    ).status_code
                    == 200
                ):
                    return p
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        p.terminate()
        p.wait()
        raise AssertionError("Server failed to start")

    for _ in range(2):
        p = boot()
        try:
            with httpx.Client(
                base_url=f"http://127.0.0.1:{port}", headers=HEADERS
            ) as c:
                login = c.post(
                    "/api/auth/login",
                    json={"username": f["username"], "password": f["password"]},
                )
                assert login.status_code == 200
                state = c.get("/api/state").json()
                assert any(o["id"] == r.json()["id"] for o in state["orders"])
                assert (
                    next(a for a in state["accounts"] if a["id"] == v)["total"] == 1000
                )
        finally:
            p.terminate()
            p.wait(timeout=10)


def test_distinct_concurrent_orders_accumulate(fixture):
    f = fixture
    v = open_visit(f)

    def send(_):
        with TestClient(
            app, headers=dict(f["client"].headers), cookies=f["client"].cookies
        ) as c:
            return c.post(
                "/api/visits/" + v + "/orders",
                json={
                    "expectedAccount": v,
                    "needsPreparation": True,
                    "items": [{"productId": f["product"], "quantity": 1}],
                },
                headers={"Idempotency-Key": key()},
            )

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["id"] for r in results}) == 4
    assert account(f, v)["total"] == 4000


def test_catalog_options_validated_and_unavailable(fixture):
    f = fixture
    v = open_visit(f)
    with SessionLocal() as db:
        p = db.get(Product, f["product"])
        p.sizes = [{"name": "Chico", "price": 100, "max": 1}]
        p.extras = [{"name": "Salsa", "price": 50}]
        db.commit()

    def send(item):
        return f["client"].post(
            "/api/visits/" + v + "/orders",
            json={
                "expectedAccount": v,
                "items": [{"productId": f["product"], "quantity": 1, **item}],
            },
            headers={"Idempotency-Key": key()},
        )

    assert (
        send({"size": "Chico", "flavors": ["Dulce de leche", "Frutilla"]}).status_code
        == 422
    )
    with SessionLocal() as db:
        unavailable_flavor = db.get(Flavor, f["flavor"]).name
    assert send({"size": "Chico", "flavors": [unavailable_flavor]}).status_code == 422
    assert (
        send(
            {"size": "Chico", "flavors": ["Dulce de leche"], "extras": ["Inventado"]}
        ).status_code
        == 422
    )
    # The demo flavor may have been edited by the user: create an isolated available flavor.
    name = "Disponible " + key()
    id = key()
    with SessionLocal() as db:
        db.add(Flavor(id=id, name=name, available=True))
        db.commit()
    try:
        assert (
            send({"size": "Chico", "flavors": [name], "extras": ["Salsa"]}).status_code
            == 200
        )
        assert account(f, v)["total"] == 1150
        with SessionLocal() as db:
            db.get(Product, f["product"]).available = False
            db.commit()
        assert send({"size": "Chico", "flavors": [name]}).status_code == 422
    finally:
        with SessionLocal() as db:
            db.execute(delete(Flavor).where(Flavor.id == id))
            db.commit()
