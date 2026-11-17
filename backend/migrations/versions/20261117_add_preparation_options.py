"""add preparation_options to products and seed licuados

Revision ID: 20261117_add_preparation_options
Revises: 20261111_add_subcategories
Create Date: 2026-11-17 10:00:00

"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261117_add_preparation_options'
down_revision = '20261111_add_subcategories'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Add preparation_options JSON column to products
    try:
        op.add_column('products', sa.Column('preparation_options', sa.JSON(), nullable=True))
    except Exception:
        pass

    try:
        conn.execute(text("UPDATE products SET preparation_options = '[]' WHERE preparation_options IS NULL"))
    except Exception:
        pass

    # 2. Seed licuados with preparation options and flavors
    try:
        lic_rows = conn.execute(
            text("SELECT id, flavor_options, preparation_options FROM products WHERE id = 'beb-licuado' OR LOWER(name) LIKE '%licuado%'")
        ).fetchall()

        default_prep = json.dumps(["Con leche", "Con agua"])
        default_flavors = json.dumps(["Banana", "Frutilla", "Durazno", "Mixto"])

        for row in lic_rows:
            p_id, fl, pr = row[0], row[1], row[2]
            fl_list = json.loads(fl) if isinstance(fl, str) and fl else (fl or [])
            pr_list = json.loads(pr) if isinstance(pr, str) and pr else (pr or [])

            needs_update = False
            new_fl = fl
            new_pr = pr

            if not fl_list:
                new_fl = default_flavors
                needs_update = True
            if not pr_list:
                new_pr = default_prep
                needs_update = True

            if needs_update:
                conn.execute(
                    text("UPDATE products SET flavor_options = :fl, preparation_options = :pr WHERE id = :id"),
                    {"fl": new_fl, "pr": new_pr, "id": p_id}
                )
    except Exception:
        pass


def downgrade():
    try:
        op.drop_column('products', 'preparation_options')
    except Exception:
        pass
