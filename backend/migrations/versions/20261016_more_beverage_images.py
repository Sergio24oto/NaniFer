"""more beverage images

Revision ID: 20261016_more_beverage_images
Revises: 20261015_product_in_menu
Create Date: 2026-10-16 12:25:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261016_more_beverage_images'
down_revision = '20261015_product_in_menu'
branch_labels = None
depends_on = None

BEBIDAS_IMAGES = [
    ('beb-jugo-naranja-vaso', 'Jugo Naranja vaso', '/menu/jugo-naranja-vaso.webp'),
    ('beb-licuado', 'Licuado', '/menu/licuado.webp'),
    ('beb-smoothie', 'Smoothie', '/menu/smoothie.webp'),
    ('beb-baggio-200ml', 'Baggio mediano 200ml', '/menu/baggio-200ml.webp'),
    ('beb-baggio-125ml', 'Baggio chico 125ml', '/menu/baggio-200ml.webp'),
    ('beb-batido', 'Batido', '/menu/batido.webp'),
]

def upgrade():
    conn = op.get_bind()
    for prod_id, name, img_path in BEBIDAS_IMAGES:
        conn.execute(
            text("""
                UPDATE products
                SET image = :img
                WHERE (id = :id OR LOWER(name) = LOWER(:name))
                  AND (image IS NULL OR image = '' OR image = '/menu/bebidas.webp')
            """),
            {"id": prod_id, "name": name, "img": img_path}
        )

def downgrade():
    conn = op.get_bind()
    for prod_id, name, img_path in BEBIDAS_IMAGES:
        conn.execute(
            text("""
                UPDATE products
                SET image = NULL
                WHERE (id = :id OR LOWER(name) = LOWER(:name))
                  AND image = :img
            """),
            {"id": prod_id, "name": name, "img": img_path}
        )
