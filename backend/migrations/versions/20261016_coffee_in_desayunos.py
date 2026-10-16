"""coffee in desayunos

Revision ID: 20261016_coffee_in_desayunos
Revises: 20261016_more_beverage_images
Create Date: 2026-10-16 15:30:00

"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261016_coffee_in_desayunos'
down_revision = '20261016_more_beverage_images'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    cat_row = conn.execute(
        text("SELECT id FROM categories WHERE name = 'Meriendas/Desayunos' OR id = 'menu-desayunos' LIMIT 1")
    ).fetchone()
    if not cat_row:
        return
    desayuno_id = cat_row[0]

    rows = conn.execute(
        text("""
            SELECT id, category_id, public_categories 
            FROM products 
            WHERE category_id = 'demo-1' 
               OR id IN ('latte', 'espresso')
               OR LOWER(name) LIKE '%caf%' 
               OR LOWER(name) LIKE '%espres%' 
               OR LOWER(name) LIKE '%lagrima%'
               OR LOWER(name) LIKE '%lágrima%'
        """)
    ).fetchall()

    for pid, cat_id, pub_cats_raw in rows:
        if cat_id == desayuno_id:
            continue
        pub_cats = []
        if isinstance(pub_cats_raw, list):
            pub_cats = list(pub_cats_raw)
        elif isinstance(pub_cats_raw, str) and pub_cats_raw.strip():
            try:
                parsed = json.loads(pub_cats_raw)
                if isinstance(parsed, list):
                    pub_cats = parsed
            except Exception:
                pub_cats = []
        
        if desayuno_id not in pub_cats:
            pub_cats.append(desayuno_id)
            conn.execute(
                text("UPDATE products SET public_categories = :cats WHERE id = :id"),
                {"cats": json.dumps(pub_cats), "id": pid}
            )

def downgrade():
    conn = op.get_bind()
    cat_row = conn.execute(
        text("SELECT id FROM categories WHERE name = 'Meriendas/Desayunos' OR id = 'menu-desayunos' LIMIT 1")
    ).fetchone()
    if not cat_row:
        return
    desayuno_id = cat_row[0]

    rows = conn.execute(
        text("SELECT id, public_categories FROM products WHERE public_categories IS NOT NULL")
    ).fetchall()

    for pid, pub_cats_raw in rows:
        pub_cats = []
        if isinstance(pub_cats_raw, list):
            pub_cats = list(pub_cats_raw)
        elif isinstance(pub_cats_raw, str) and pub_cats_raw.strip():
            try:
                parsed = json.loads(pub_cats_raw)
                if isinstance(parsed, list):
                    pub_cats = parsed
            except Exception:
                continue
        if desayuno_id in pub_cats:
            pub_cats = [c for c in pub_cats if c != desayuno_id]
            conn.execute(
                text("UPDATE products SET public_categories = :cats WHERE id = :id"),
                {"cats": json.dumps(pub_cats), "id": pid}
            )
