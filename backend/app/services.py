from decimal import Decimal
from uuid import uuid4
import hashlib, json, re
from fastapi import HTTPException
from sqlalchemy import select, func
from .models import (
    Product,
    Category,
    Flavor,
    Visit,
    Table,
    Order,
    OrderItem,
    Payment,
    CashShift,
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


def ensure_recarga_virtual(db):
    p = db.get(Product, "prod-recarga-virtual")
    if not p:
        cat = db.scalar(
            select(Category)
            .where((Category.name.ilike("%servicio%")) | (Category.name.ilike("%kiosco%")) | (Category.name.ilike("%otro%")))
            .limit(1)
        )
        if not cat:
            cat = db.scalar(select(Category).limit(1))
        if cat:
            p = Product(
                id="prod-recarga-virtual",
                name="Recarga Virtual",
                description="Recargas de telefonía, transporte y servicios.",
                category_id=cat.id,
                price=Decimal("1.00"),
                available=True,
                in_menu=False,
                sort_order=999,
                emoji="📱",
                stock_mode="manual",
                sizes=[],
                extras=[],
                flavor_options=[],
                combo_config={}
            )
            db.add(p)
            db.commit()
    return p


def priced_item(db, item, *, require_flavors=True):
    p = db.get(Product, item.productId)
    if not p and item.productId == "prod-recarga-virtual":
        p = ensure_recarga_virtual(db)
    if not p or p.archived or not p.available or p.price_pending:
        fail("Producto no disponible.", 422)

    # Soporte para precio libre / Recarga Virtual
    if p and (p.id == "prod-recarga-virtual" or p.name.lower().startswith("recarga virtual") or getattr(p, "stock_mode", None) == "open_price"):
        price = Decimal(str(item.customPrice)) if item.customPrice is not None and item.customPrice > 0 else p.price
        snapshot = item.model_dump()
        snapshot.update(name=p.name, unitPrice=float(price))
        return snapshot, price
    is_combo = bool(p.combo_config and p.combo_config.get("is_combo"))
    size = next((s for s in p.sizes if s.get("name") == item.size), None) if p.sizes else None
    if not size and p.sizes:
        if is_combo:
            size = p.sizes[0] if p.sizes else None
        else:
            size = next((s for s in p.sizes if s.get("isDefault") and s.get("available", True) and s.get("enabled", True)), None)
            if not size:
                size = next((s for s in p.sizes if s.get("available", True) and s.get("enabled", True)), p.sizes[0] if p.sizes else None)
            if size:
                item.size = size.get("name", "")
    if p.sizes and not size and not is_combo:
        fail("Elegí un tamaño válido.", 422)
    if size and not size.get('enabled',True):fail('Presentación deshabilitada.',422)
    if not p.sizes and item.size:
        fail("Este producto no tiene tamaños.", 422)
    if not is_combo:
        product_flavors = p.flavor_options or []
        if product_flavors:
            s_name = (size.get("name") if size else "").lower()
            max_units = (size or {}).get("max") or 0
            if max_units and int(max_units) > 0:
                pack_units = int(max_units)
            elif (
                "media docena" in s_name
                or "1/2 docena" in s_name
                or "1/2docena" in s_name
                or "6 u" in s_name
                or "6u" in s_name
            ):
                pack_units = 6
            elif "docena" in s_name or "12 u" in s_name or "12u" in s_name:
                pack_units = 12
            else:
                m_units = re.search(r"(\d+)\s*(u|un|unid|unidades)\b", s_name)
                pack_units = int(m_units.group(1)) if m_units else 1

            if pack_units > 1:
                total_expected = pack_units * (getattr(item, "quantity", 1) or 1)
                total_units = 0
                for f in item.flavors:
                    m = re.match(r"^(\d+)x\s+(.+)$", f.strip())
                    if m:
                        count = int(m.group(1))
                        fl_name = m.group(2).strip()
                    else:
                        count = 1
                        fl_name = f.strip()
                    if fl_name not in product_flavors and not any(
                        p_fl.lower().strip() == fl_name.lower().strip()
                        for p_fl in product_flavors
                    ):
                        fail(f"Sabor no disponible para este producto: {fl_name}", 422)
                    total_units += count
                if require_flavors and total_units != total_expected:
                    fail(f"Elegí las {total_expected} unidades para este producto.", 422)
            else:
                if require_flavors and len(item.flavors) != 1:
                    fail("Elegí un sabor para este producto.", 422)
                if len(item.flavors) > 1:
                    fail("Elegí solo 1 sabor.", 422)
                if any(
                    f not in product_flavors
                    and not any(
                        p_fl.lower().strip() == f.lower().strip()
                        for p_fl in product_flavors
                    )
                    for f in item.flavors
                ):
                    fail("Sabor no disponible para este producto.", 422)
        else:
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
        Decimal(str(size['salePrice'])) if size and size.get('salePrice') is not None else p.price + Decimal(str((size or {}).get("price", 0)))
    ) + sum((Decimal(str(extras[e]["price"])) for e in item.extras), Decimal(0))
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


def edit_order(db, order, data, user):
    from .stock_accounting import revert_order_item_stock, consume_additional_order_stock, prepare_order, apply_order
    from .models import SaleAllocation, StockMovement
    from sqlalchemy import update

    visit = lock_visit(db, order.visit_id)
    require_open(visit)
    if visit.closed_at:
        fail("No se puede modificar un pedido de una visita cerrada.", 409)

    allocated = db.scalar(
        select(SaleAllocation.order_item_id)
        .join(OrderItem, OrderItem.id == SaleAllocation.order_item_id)
        .where(OrderItem.order_id == order.id)
        .limit(1)
    )
    if allocated:
        fail("No se puede editar este pedido porque ya tiene cobros o pagos asociados.", 409)

    existing_items = {i.id: i for i in db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))}
    incoming_items_with_id = {i.id: i for i in data.items if i.id and i.id in existing_items}
    incoming_new_items = [i for i in data.items if not i.id or i.id not in existing_items]

    # 1. Remove deleted items
    for item_id, item in list(existing_items.items()):
        if item_id not in incoming_items_with_id:
            revert_order_item_stock(db, item, item.quantity, user.id, reason=f"Cancelación consumo mesa (Pedido #{order.number})")
            db.execute(update(StockMovement).where(StockMovement.order_item_id == item.id).values(order_item_id=None))
            db.delete(item)

    # 2. Update existing items
    for item_id, inc in incoming_items_with_id.items():
        item = existing_items[item_id]
        delta = inc.quantity - item.quantity
        if delta < 0:
            revert_order_item_stock(db, item, abs(delta), user.id, reason=f"Reducción consumo mesa (Pedido #{order.number})")
        elif delta > 0:
            consume_additional_order_stock(db, item, delta, user.id, reason=f"Aumento consumo mesa (Pedido #{order.number})")
        item.quantity = inc.quantity
        snapshot = dict(item.snapshot or {})
        snapshot["quantity"] = inc.quantity
        if inc.notes is not None:
            snapshot["notes"] = inc.notes
        if "stockBatches" in snapshot and snapshot["stockBatches"]:
            snapshot["stockBatches"][0]["quantity"] = inc.quantity
        item.snapshot = snapshot

    # 3. Add new items
    if incoming_new_items:
        plans, stock_rows = prepare_order(db, incoming_new_items)
        priced = [priced_item(db, i, require_flavors=False) for i in incoming_new_items]
        for index, (snapshot, price) in enumerate(priced):
            new_item = OrderItem(
                id=uid(),
                order_id=order.id,
                product_id=snapshot["productId"],
                quantity=snapshot["quantity"],
                unit_price=price,
                snapshot=snapshot,
            )
            db.add(new_item)
            db.flush()
            apply_order(db, new_item, plans[index], stock_rows, user.id)

    db.flush()

    remaining = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    is_deleted = False
    if not remaining:
        db.delete(order)
        db.flush()
        is_deleted = True

    consumed, paid, balance = totals(db, visit.id)
    if consumed < paid:
        fail("El nuevo importe de la mesa no puede ser inferior a lo que ya fue pagado.", 409)

    return {
        "ok": True,
        "orderId": None if is_deleted else order.id,
        "deleted": is_deleted,
        "remainingItems": len(remaining),
        "total": float(consumed),
        "balance": float(balance)
    }


def cancel_order(db, order, user):
    from .stock_accounting import revert_order_item_stock
    from .models import SaleAllocation, StockMovement
    from sqlalchemy import update

    visit = lock_visit(db, order.visit_id)
    require_open(visit)
    if visit.closed_at:
        fail("No se puede anular un pedido de una visita cerrada.", 409)

    allocated = db.scalar(
        select(SaleAllocation.order_item_id)
        .join(OrderItem, OrderItem.id == SaleAllocation.order_item_id)
        .where(OrderItem.order_id == order.id)
        .limit(1)
    )
    if allocated:
        fail("No se puede anular este pedido porque ya tiene cobros o pagos asociados.", 409)

    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    for item in items:
        revert_order_item_stock(db, item, item.quantity, user.id, reason=f"Anulación completa consumo mesa (Pedido #{order.number})")
        db.execute(update(StockMovement).where(StockMovement.order_item_id == item.id).values(order_item_id=None))
        db.delete(item)

    db.flush()
    db.delete(order)
    db.flush()

    consumed, paid, balance = totals(db, visit.id)
    if consumed < paid:
        fail("El nuevo importe de la mesa no puede ser inferior a lo que ya fue pagado.", 409)

    return {
        "ok": True,
        "orderId": order.id,
        "deleted": True,
        "total": float(consumed),
        "balance": float(balance)
    }


def delete_order_item(db, order, item_id, user):
    from .stock_accounting import revert_order_item_stock
    from .models import SaleAllocation, StockMovement
    from sqlalchemy import update

    visit = lock_visit(db, order.visit_id)
    require_open(visit)
    if visit.closed_at:
        fail("No se puede modificar un pedido de una visita cerrada.", 409)

    item = db.get(OrderItem, item_id)
    if not item or item.order_id != order.id:
        fail("Ítem no encontrado en este pedido.", 404)

    allocated = db.scalar(
        select(SaleAllocation.order_item_id)
        .where(SaleAllocation.order_item_id == item.id)
        .limit(1)
    )
    if allocated:
        fail("No se puede eliminar este producto porque ya fue cobrado.", 409)

    revert_order_item_stock(db, item, item.quantity, user.id, reason=f"Eliminación producto de mesa (Pedido #{order.number})")
    db.execute(update(StockMovement).where(StockMovement.order_item_id == item.id).values(order_item_id=None))
    db.delete(item)
    db.flush()

    remaining = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    is_deleted = False
    if not remaining:
        db.delete(order)
        db.flush()
        is_deleted = True

    consumed, paid, balance = totals(db, visit.id)
    if consumed < paid:
        fail("El nuevo importe de la mesa no puede ser inferior a lo que ya fue pagado.", 409)

    return {
        "ok": True,
        "orderId": None if is_deleted else order.id,
        "deletedItemId": item_id,
        "deletedOrder": is_deleted,
        "remainingItems": len(remaining),
        "total": float(consumed),
        "balance": float(balance)
    }


def make_payment(db, visit, data, user):
    require_open(visit)
    consumed, paid, balance = totals(db, visit.id)
    if balance <= 0:
        fail("La cuenta no tiene saldo pendiente.")
    if balance != data.expectedBalance:
        fail("El saldo cambió. Revisá el importe antes de confirmar.")

    if data.splits:
        split_total = sum((s.amount for s in data.splits), Decimal("0.00"))
        if split_total != balance:
            fail(f"La suma de los pagos parciales (${split_total}) no coincide con el saldo pendiente (${balance}).", 422)

        splits_data = []
        total_cash_received = Decimal("0.00")
        total_cash_change = Decimal("0.00")
        has_cash = False

        for s in data.splits:
            s_rec = s.received if s.method == "efectivo" else None
            s_chg = None
            if s.method == "efectivo":
                has_cash = True
                if s_rec is not None:
                    if s_rec < s.amount:
                        fail("El dinero en efectivo recibido no alcanza.", 422)
                    s_chg = s_rec - s.amount
                    total_cash_received += s_rec
                    total_cash_change += s_chg
                else:
                    total_cash_received += s.amount
            splits_data.append({
                "method": s.method,
                "amount": float(s.amount),
                "received": float(s_rec) if s_rec is not None else None,
                "change": float(s_chg) if s_chg is not None else None,
            })

        final_method = "mixto" if len(data.splits) > 1 else data.splits[0].method
        final_received = total_cash_received if has_cash else None
        final_change = total_cash_change if has_cash else None
    else:
        final_method = data.method
        if final_method == "efectivo":
            final_received = data.received
            if final_received is not None and final_received < balance:
                fail("El dinero recibido no alcanza.", 422)
            final_change = None if final_received is None else final_received - balance
        else:
            final_received = None
            final_change = None
        splits_data = [{
            "method": final_method,
            "amount": float(balance),
            "received": float(final_received) if final_received is not None else None,
            "change": float(final_change) if final_change is not None else None,
        }]

    active_shift = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )

    payment = Payment(
        id=uid(),
        visit_id=visit.id,
        user_id=user.id,
        amount=balance,
        method=final_method,
        received=final_received,
        change=final_change,
        splits=splits_data,
        shift_id=active_shift.id if active_shift else None,
    )
    db.add(payment)
    db.flush()
    from .sale_capture import record_sale
    record_sale(db, payment, user)
    return {
        "id": payment.id,
        "total": float(balance),
        "method": payment.method,
        "splits": splits_data,
        "change": None if final_change is None else float(final_change),
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
                "joinedTables": v.joined_tables or [],
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
                "number": o.number,
                "accountId": o.visit_id,
                "table": next(v.table_number for v in visits if v.id == o.visit_id),
                "createdAt": iso(o.created_at),
                "status": o.status,
                **({"origin": o.origin, "createdBy": o.created_by, "createdByName": names.get(o.created_by, "")} if internal else {}),
                "items": [
                    {**{k:v for k,v in i.snapshot.items() if k != "stockBatches"}, "id": i.id, "unitPrice": float(i.unit_price)}
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
