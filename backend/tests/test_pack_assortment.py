from decimal import Decimal
import pytest
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Product, Category
from app.schemas import ItemIn
from app.services import priced_item, uid
from fastapi import HTTPException


def test_pack_assortment_validation():
    with SessionLocal() as db_session:
        cat = db_session.scalars(select(Category)).first()
        assert cat is not None, "Debe existir al menos una categoría en la base"

        prod_id = uid()
        prod = Product(
            id=prod_id,
            category_id=cat.id,
            name="Empanadas Test Assortment",
            price=Decimal("1800"),
            available=True,
            flavor_options=["Dulces", "Arabes", "JyQ", "Pollo"],
            sizes=[
                {"name": "Individual", "salePrice": "1800", "max": 0, "enabled": True},
                {"name": "Media docena", "salePrice": "6500", "max": 6, "enabled": True},
                {"name": "Docena", "salePrice": "12000", "max": 12, "enabled": True},
            ],
            extras=[],
        )
        db_session.add(prod)
        db_session.commit()

        try:
            # 1. Media docena válida con surtido (2x Dulces, 2x Arabes, 2x JyQ = 6)
            item_valid_pack = ItemIn(
                productId=prod_id,
                size="Media docena",
                flavors=["2x Dulces", "2x Arabes", "2x JyQ"],
                quantity=1,
            )
            snap, price = priced_item(db_session, item_valid_pack, require_flavors=True)
            assert price == Decimal("6500")
            assert snap["name"] == "Empanadas Test Assortment"

            # 2. Media docena incompleta (2x Dulces, 2x Arabes = 4 de 6) -> Debe fallar
            item_incomplete = ItemIn(
                productId=prod_id,
                size="Media docena",
                flavors=["2x Dulces", "2x Arabes"],
                quantity=1,
            )
            with pytest.raises(HTTPException) as exc:
                priced_item(db_session, item_incomplete, require_flavors=True)
            assert exc.value.status_code == 422
            assert "Elegí las 6 unidades" in exc.value.detail

            # 3. Media docena con sabor inexistente -> Debe fallar
            item_bad_flavor = ItemIn(
                productId=prod_id,
                size="Media docena",
                flavors=["3x Dulces", "3x Choclo"],
                quantity=1,
            )
            with pytest.raises(HTTPException) as exc:
                priced_item(db_session, item_bad_flavor, require_flavors=True)
            assert exc.value.status_code == 422
            assert "Sabor no disponible" in exc.value.detail

            # 4. Empanada individual con 1 sabor válido -> Debe funcionar
            item_single = ItemIn(
                productId=prod_id,
                size="Individual",
                flavors=["Arabes"],
                quantity=1,
            )
            snap_single, price_single = priced_item(db_session, item_single, require_flavors=True)
            assert price_single == Decimal("1800")

            # 5. Empanada individual con 2 sabores -> Debe fallar
            item_single_multi = ItemIn(
                productId=prod_id,
                size="Individual",
                flavors=["Arabes", "Pollo"],
                quantity=1,
            )
            with pytest.raises(HTTPException) as exc:
                priced_item(db_session, item_single_multi, require_flavors=True)
            assert exc.value.status_code == 422

        finally:
            p_to_del = db_session.get(Product, prod_id)
            if p_to_del:
                db_session.delete(p_to_del)
                db_session.commit()
