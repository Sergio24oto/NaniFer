"""Immutable allocation of each fully settled batch to its existing payment."""
from decimal import Decimal
from sqlalchemy import select
from .models import Sale, SaleAllocation, OrderItem, Order
from .services import fail


def line_snapshot(item):
    return {
        "id": item.id, "productId": item.product_id,
        "size": item.snapshot.get("size", ""),
        "stockBatches": item.snapshot.get("stockBatches", [{"quantity":item.quantity,"components":[]}]),
        "name": item.snapshot["name"], "quantity": item.quantity,
        "unitPrice": str(item.unit_price),
        "options": " · ".join(filter(None, [item.snapshot.get("size", ""), *item.snapshot.get("flavors", []), *item.snapshot.get("extras", [])])),
        "notes": item.snapshot.get("notes", ""),
        "subtotal": str(item.unit_price * item.quantity),
    }


def record_sale(db, payment, user):
    items = list(db.scalars(select(OrderItem).join(Order).where(
        Order.visit_id == payment.visit_id,
        ~OrderItem.id.in_(select(SaleAllocation.order_item_id)),
    ).order_by(Order.created_at, OrderItem.id)))
    if sum((i.quantity * i.unit_price for i in items), Decimal(0)) != payment.amount:
        fail("No se pudo vincular el cobro a sus consumos. No se guardó la operación.")
    lines = [line_snapshot(i) for i in items]
    db.add(Sale(id=payment.id, cashier_name=user.name, original_items=lines,
                current_items=lines, current_total=payment.amount, version=0))
    db.flush()
    db.add_all([SaleAllocation(order_item_id=i.id, sale_id=payment.id) for i in items])
    db.flush()
