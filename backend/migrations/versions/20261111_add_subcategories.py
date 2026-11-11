"""add subcategories to categories and subcategory to products

Revision ID: 20261111_add_subcategories
Revises: 20261103_clean_combos_extras
Create Date: 2026-11-11 10:00:00

"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261111_add_subcategories'
down_revision = '20261103_clean_combos_extras'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Add subcategories JSON column to categories
    try:
        op.add_column('categories', sa.Column('subcategories', sa.JSON(), nullable=True))
    except Exception:
        pass

    # 2. Add subcategory VARCHAR column to products
    try:
        op.add_column('products', sa.Column('subcategory', sa.String(100), server_default='', nullable=False))
    except Exception:
        pass

    # 3. Initialize default subcategories for Comidas
    try:
        default_subs = json.dumps([
            "Pizzas",
            "Empanadas",
            "Cazuelas",
            "Picadas y Papas",
            "Sin TACC",
            "Tostados y Minutas",
        ], ensure_ascii=False)
        conn.execute(
            text("UPDATE categories SET subcategories = :subs WHERE name = 'Comidas' AND (subcategories IS NULL OR subcategories = '[]')"),
            {"subs": default_subs}
        )
    except Exception:
        pass


def downgrade():
    try:
        op.drop_column('products', 'subcategory')
    except Exception:
        pass
    try:
        op.drop_column('categories', 'subcategories')
    except Exception:
        pass
