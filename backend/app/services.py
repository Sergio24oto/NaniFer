from decimal import Decimal
from uuid import uuid4
import hashlib, json
from fastapi import HTTPException
from sqlalchemy import select, func
from .models import (
    Product,
    Flavor,
    Visit,
    Table,
    Order,
    OrderItem,
    Payment,
    Operation,
    User,
    now,
)

STATUSES = ["pendiente", "en preparación", "listo para entregar", "entregado"]


def fail(message, status=409):
    raise HTTPException(status, message)


def uid():
    return str(uuid4())


def iso(d):
    return d.isoformat() + "Z" if d else None


def lock_table(db, number):
    table = db.scalar(select(Table).where(Table.number == number).with_for_update())
    if not table:
        fail("Mesa inexistente.", 404)
    return table


def lock_visit(db, id):
    visit = db.scalar(
        select(Visit)
        .where(Visit.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not visit:
        fail("Visita inexistente.", 404)
    return visit


def require_open(visit):
    if visit.closed_at:
        fail("La visita está cerrada. Iniciá una nueva visita.")


def totals(db, id):
    consumed = db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.visit_id == id)
    )
    paid = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.visit_id == id)
    )
    return Decimal(consumed), Decimal(paid), Decimal(consumed) - Decimal(paid)


def priced_item(db, item, *, require_flavors=True):
    p = db.get(Product, item.productId)
    if not p or p.archived or not p.available or p.price_pending:
        fail("Producto no disponible.", 422)
    size = next((s for s in p.sizes if s["name"] == item.size), None)
    if p.sizes and not size:
        fail("Elegí un tamaño válido.", 422)
    if not p.sizes and item.size:
        fail("Este producto no tiene tamaños.", 422)
    maximum = (size or {}).get("max", 0)
    if (maximum and not (1 if require_flavors else 0) <= len(item.flavors) <= maximum) or (
        not maximum and item.flavors
    ):
        fail("Cantidad de sabores inválida.", 422)
    if len(set(item.flavors)) != len(item.flavors):
        fail("No repitas sabores.", 422)
    available = set(db.scalars(select(Flavor.name).where(Flavor.available == True)))
    if any(f not in available for f in item.flavors):
        fail("Sabor agotado.", 422)
    extras = {e["name"]: e for e in p.extras}
    if len(set(item.extras)) != len(item.extras) or any(
        e not in extras for e in item.extras
    ):
        fail("Extra inválido.", 422)
    price = (
        p.price
        + Decimal(str((size or {}).get("price", 0)))
        + sum((Decimal(str(extras[e]["price"])) for e in item.extras), Decimal(0))
    )
    snapshot = item.model_dump()
    snapshot.update(name=p.name)
    return snapshot, price


def once(db, key, scope, payload, callback):
    if not key or not 16 <= len(key) <= 64:
        fail("Falta identificador válido de operación.", 422)
    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()
    existing = db.get(Operation, key)
    if existing:
        if existing.scope != scope or existing.fingerprint != fingerprint:
            fail("El identificador ya se usó para otra operación.")
        return existing.response
    response = callback()
    db.add(Operation(key=key, scope=scope, fingerprint=fingerprint, response=response))
    db.flush()
    return response


def make_order(db, visit, data, *, origin="qr", user=None, delivered=False):
    require_open(visit)
    if data.expectedAccount != visit.id:
        fail("La visita cambió. Revisá tu mesa antes de confirmar.")
    from .stock_accounting import prepare_order, apply_order
    plans, stock_rows = prepare_order(db, data.items)
    priced = [priced_item(db, i, require_flavors=origin not in {"manual", "counter"}) for i in data.items]
    order = Order(id=uid(), visit_id=visit.id, status=STATUSES[-1] if delivered else STATUSES[0],
                  origin=origin, created_by=user.id if user else None)
    db.add(order)
    db.flush()
    for index, (snapshot, price) in enumerate(priced):
        item = OrderItem(
                id=uid(),
                order_id=order.id,
                product_id=snapshot["productId"],
                quantity=snapshot["quantity"],
                unit_price=price,
                snapshot=snapshot,
            )
        db.add(item)
        db.flush()
        apply_order(db, item, plans[index], stock_rows, user.id if user else None)
    db.flush()
    return {"id": order.id, "accountId": visit.id}


def make_payment(db, visit, data, user):
    require_open(visit)
    consumed, paid, balance = totals(db, visit.id)
    if balance <= 0:
        fail("La cuenta no tiene saldo pendiente.")
    if balance != data.expectedBalance:
        fail("El saldo cambió. Revisá el importe antes de confirmar.")
    received = data.received if data.method == "efectivo" else None
    if received is not None and received < balance:
        fail("El dinero recibido no alcanza.", 422)
    payment = Payment(
        id=uid(),
        visit_id=visit.id,
        user_id=user.id,
        amount=balance,
        method=data.method,
        received=received,
        change=None if received is None else received - balance,
    )
    db.add(payment)
    db.flush()
    from .sale_capture import record_sale
    record_sale(db, payment, user)
    return {
        "id": payment.id,
        "total": float(balance),
        "change": None if received is None else float(received - balance),
    }


def close_visit(db, visit):
    if visit.closed_at:
        return {"id": visit.id, "closed": True}
    if totals(db, visit.id)[2] != 0:
        fail("Hay saldo pendiente de cobro.")
    if db.scalar(
        select(Order.id)
        .where(Order.visit_id == visit.id, Order.status != "entregado")
        .limit(1)
    ):
        fail("Todavía hay pedidos pendientes de entrega.")
    visit.closed_at = now()
    visit.active_table = None
    db.flush()
    return {"id": visit.id, "closed": True}


def state_for(db, visits, internal=False):
    ids = [v.id for v in visits]
    orders = (
        list(
            db.scalars(
                select(Order).where(Order.visit_id.in_(ids)).order_by(Order.created_at)
            )
        )
        if ids
        else []
    )
    items = (
        list(
            db.scalars(
                select(OrderItem).where(OrderItem.order_id.in_([o.id for o in orders]))
            )
        )
        if orders
        else []
    )
    payments = (
        list(
            db.scalars(
                select(Payment)
                .where(Payment.visit_id.in_(ids))
                .order_by(Payment.created_at)
            )
        )
        if ids
        else []
    )
    users = (
        list(db.scalars(select(User).where(User.active == True))) if internal else []
    )
    names = {u.id: u.name for u in users}
    accounts = []
    for v in visits:
        total, paid, balance = totals(db, v.id)
        accounts.append(
            {
                "id": v.id,
                "table": v.table_number,
                "waitressId": v.waitress_id if internal else None,
                "waitress": names.get(v.waitress_id, "Sin asignar") if internal else "",
                "openedAt": iso(v.opened_at),
                "closedAt": iso(v.closed_at),
                "total": float(total),
                "paid": float(paid),
                "balance": float(balance),
            }
        )
    return {
        "accounts": accounts,
        "orders": [
            {
                "id": o.id,
                "accountId": o.visit_id,
                "table": next(v.table_number for v in visits if v.id == o.visit_id),
                "createdAt": iso(o.created_at),
                "status": o.status,
                **({"origin": o.origin, "createdBy": o.created_by, "createdByName": names.get(o.created_by, "")} if internal else {}),
                "items": [
                    {**{k:v for k,v in i.snapshot.items() if k != "stockBatches"}, "unitPrice": float(i.unit_price)}
                    for i in items
                    if i.order_id == o.id
                ],
            }
            for o in orders
        ],
        "payments": [
            {
                "id": p.id,
                "accountId": p.visit_id,
                "table": next(v.table_number for v in visits if v.id == p.visit_id),
                "total": float(p.amount),
                "method": p.method,
                "received": None if p.received is None else float(p.received),
                "change": None if p.change is None else float(p.change),
                "createdAt": iso(p.created_at),
            }
            for p in payments
        ],
        "staff": [
            {"id": u.id, "name": u.name} for u in users if u.role in ("staff", "admin")
        ],
    }
