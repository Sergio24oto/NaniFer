from decimal import Decimal
import pytest
from app.db import SessionLocal
from app.models import Product, Category
from app.schemas import ItemIn, PayIn, PaymentSplitIn
from app.services import priced_item, uid
from sqlalchemy import select


def test_priced_item_auto_fallbacks_size_when_empty():
    with SessionLocal() as db_session:
        cat = db_session.scalars(select(Category)).first()
        prod_id = uid()
        p = Product(
            id=prod_id,
            category_id=cat.id if cat else "menu-comidas",
            name="Cazuela Especial Test",
            description="Rica cazuela",
            price=Decimal("4500.00"),
            available=True,
            archived=False,
            price_pending=False,
            sizes=[
                {"name": "Individual", "price": 0, "available": True, "enabled": True},
                {"name": "Para compartir", "price": 2000, "available": True, "enabled": True},
            ],
            extras=[],
        )
        db_session.add(p)
        db_session.commit()

        try:
            # Submit item with empty size (like table order quick add)
            item = ItemIn(
                productId=prod_id,
                size="",
                quantity=1
            )

            # Should not raise 422! Backend auto-assigns the default/first available size!
            snap, price = priced_item(db_session, item)
            assert item.size == "Individual"
            assert price == Decimal("4500.00")
            assert snap["name"] == "Cazuela Especial Test"
        finally:
            p_to_del = db_session.get(Product, prod_id)
            if p_to_del:
                db_session.delete(p_to_del)
                db_session.commit()


def test_payment_voucher_schemas():
    # Single payment with voucher
    pay_single = PayIn(
        method="voucher",
        expectedBalance=Decimal("5000.00"),
    )
    assert pay_single.method == "voucher"

    # Split payment with voucher and cash
    pay_split = PayIn(
        method="mixto",
        expectedBalance=Decimal("7500.00"),
        splits=[
            PaymentSplitIn(method="voucher", amount=Decimal("5000.00")),
            PaymentSplitIn(method="efectivo", amount=Decimal("2500.00"), received=Decimal("3000.00")),
        ]
    )
    assert len(pay_split.splits) == 2
    assert pay_split.splits[0].method == "voucher"
    assert pay_split.splits[1].method == "efectivo"


def test_recarga_virtual_open_price():
    with SessionLocal() as db_session:
        # Create or ensure prod-recarga-virtual exists
        from app.services import ensure_recarga_virtual
        p = ensure_recarga_virtual(db_session)
        assert p is not None
        assert p.id == "prod-recarga-virtual"

        # Item with customPrice = $3500
        item = ItemIn(
            productId="prod-recarga-virtual",
            quantity=1,
            customPrice=Decimal("3500.00"),
            notes="Personal 381445566"
        )
        snap, price = priced_item(db_session, item)
        assert price == Decimal("3500.00")
        assert snap["unitPrice"] == 3500.00
        assert snap["notes"] == "Personal 381445566"


def test_staff_can_create_stock_product():
    with SessionLocal() as db_session:
        from app.stock import create_stock_product, StockProductCreateIn
        from app.models import User
        staff = db_session.scalar(select(User).where(User.role == "staff").limit(1))
        if not staff:
            staff = User(id=uid(), username="teststaff", name="Test Staff", role="staff", password_hash="dummy")
            db_session.add(staff)
            db_session.commit()

        data = StockProductCreateIn(
            name="Alfajor Test Moza",
            price=Decimal("1500.00"),
            area="manual",
            manageStock=False,
            initialStock=False
        )
        res = create_stock_product(data, key="key-" + uid(), auth=(staff, None), db=db_session)
        assert res["name"] == "Alfajor Test Moza"

        prod = db_session.get(Product, res["id"])
        if prod:
            db_session.delete(prod)
            db_session.commit()
