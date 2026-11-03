"""clean extras and submarino

Revision ID: 20261103_clean_combos_extras
Revises: 20261028_add_product_sort_order
Create Date: 2026-11-03 10:00:00

"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261103_clean_combos_extras'
down_revision = '20261028_add_product_sort_order'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Vaciar todos los extras opcionales de todos los productos
    conn.execute(text("UPDATE products SET extras = '[]' WHERE extras IS NOT NULL"))

    # 2. Quitar 'Submarino' de los pasos de infusión en combos
    rows = conn.execute(text("SELECT id, combo_config FROM products WHERE combo_config IS NOT NULL")).fetchall()
    for row in rows:
        pid = row[0]
        cfg = row[1]
        if not cfg:
            continue
        if isinstance(cfg, str):
            try:
                cfg = json.loads(cfg)
            except Exception:
                continue

        if isinstance(cfg, dict) and "steps" in cfg:
            modified = False
            for step in cfg["steps"]:
                opts = step.get("options", [])
                if "Submarino" in opts:
                    step["options"] = [opt for opt in opts if opt != "Submarino"]
                    modified = True

            if modified:
                updated_json = json.dumps(cfg, ensure_ascii=False)
                conn.execute(
                    text("UPDATE products SET combo_config = :cfg WHERE id = :id"),
                    {"cfg": updated_json, "id": pid}
                )


def downgrade():
    pass
