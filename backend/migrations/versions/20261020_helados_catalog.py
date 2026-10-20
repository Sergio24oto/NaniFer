"""seed helados catalog

Revision ID: 20261020_helados_catalog
Revises: 20261019_add_joined_tables
Create Date: 2026-10-20 17:30:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261020_helados_catalog'
down_revision = '20261019_add_joined_tables'
branch_labels = None
depends_on = None

HELADOS_ITEMS = [
    # (id, name, desc, price, price_pending, emoji)
    ("hel-1kg", "1KG", "Pote de 1 Kilogramo de helado artesanal.", 24500, False, "🍨"),
    ("hel-medio-kg", "1/2KG", "Pote de 1/2 Kilogramo de helado artesanal.", 13500, False, "🍨"),
    ("hel-cuarto-kg", "1/4KG", "Pote de 1/4 Kilogramo de helado artesanal.", 9000, False, "🍨"),
    ("hel-1-bocha", "1 BOCHA", "Cucurucho o vasito 1 bocha.", 5500, False, "🍦"),
    ("hel-2-bochas", "2 BOCHAS", "Cucurucho o vasito 2 bochas.", 6500, False, "🍦"),
    ("hel-3-bochas", "3 BOCHAS", "Cucurucho o vasito 3 bochas.", 9000, False, "🍦"),
    ("hel-lanchita", "LANCHITA", "Lanchita de helado surtido.", 6500, False, "🍧"),
    ("hel-capelina-comun", "CAPELINA COMÚN", "Capelina crocante con helado.", 6500, False, "🍨"),
    ("hel-capelina-lady", "CAPELINA LADY", "Capelina especial Lady.", 7200, False, "🍨"),
    ("hel-ice-tropical", "ICE TROPICAL", "Especial Ice Tropical.", 6500, False, "🍹"),
    ("hel-sundae", "SUNDAE", "Sundae artesanal.", 9000, False, "🍨"),
    ("hel-trago-fresh", "TRAGO FRESH", "Trago Fresh helado.", 7500, False, "🍸"),
    ("hel-bandeja-reina", "BANDEJA REINA", "Bandeja Reina para compartir.", 12000, False, "🍨"),
    ("hel-bandeja-3l", "BANDEJA 3L", "Bandeja familiar 3 Litros.", 23000, False, "🍨"),
    ("hel-bandeja-1l", "BANDEJA 1L", "Bandeja 1 Litro.", 15000, False, "🍨"),
    ("hel-torta-helada", "TORTA HELADA", "Torta helada artesanal entera.", 24500, False, "🎂"),
    ("hel-almendrado-x8", "ALMENDRADO X8", "Postre almendrado x 8 porciones.", 20000, False, "🍨"),
    ("hel-suizo-x8", "SUIZO X8", "Bombón suizo x 8 unidades.", 24500, False, "🍨"),
    ("hel-escoces-x8", "ESCOCÉS X8", "Bombón escocés x 8 unidades.", 24500, False, "🍨"),
    ("hel-tricolor-x8", "TRICOLOR X8", "Postre tricolor x 8 porciones.", 17000, False, "🍨"),
    ("hel-palito-bombon-x12", "PALITO BOMBÓN X12", "Caja palito bombón x 12 unidades.", 20000, False, "🍫"),
    ("hel-palito-doble-yo-x14", "PALITO DOBLE YO X14", "Caja palito doble Yo x 14 unidades.", 20000, False, "🍧"),
    ("hel-palito-agua-yo-x14", "PALITO AGUA YO X14", "Caja palito agua Yo x 14 unidades.", 16500, False, "🧊"),
    ("hel-bano-chocolate", "BAÑO DE CHOCOLATE", "Adicional baño de chocolate.", 0, False, "🍫"),
]


def upgrade():
    conn = op.get_bind()

    # Find or create category Helados
    cat_row = conn.execute(
        text("SELECT id FROM categories WHERE id = 'demo-0' OR name = 'Helados' LIMIT 1")
    ).fetchone()
    if cat_row:
        cat_id = cat_row[0]
    else:
        cat_id = "demo-0"
        conn.execute(
            text("""
                INSERT INTO categories (id, name, sort_order, public_visible, note, stock_area)
                VALUES (:id, 'Helados', 0, 1, 'Helados artesanales', 'other')
            """),
            {"id": cat_id},
        )

    # Archive old demo products with customizable flavor flows so they don't prompt in counter
    conn.execute(
        text("""
            UPDATE products
            SET archived = 1, in_menu = 0, available = 0
            WHERE id IN ('copa', 'helado', '81ab1bc7-7425-4dca-963f-fa9dea0404d4', 'ada73263-6496-40cc-a0ae-291bde43bf41')
        """)
    )

    for prod_id, name, desc, price, price_pending, emoji in HELADOS_ITEMS:
        existing_by_id = conn.execute(
            text("SELECT id FROM products WHERE id = :id"), {"id": prod_id}
        ).fetchone()
        existing_by_name = conn.execute(
            text("SELECT id FROM products WHERE name = :name AND category_id = :cat_id"),
            {"name": name, "cat_id": cat_id},
        ).fetchone()

        target_id = existing_by_id[0] if existing_by_id else (existing_by_name[0] if existing_by_name else prod_id)

        if existing_by_id or existing_by_name:
            conn.execute(
                text("""
                    UPDATE products
                    SET name = :name,
                        description = :desc,
                        category_id = :cat_id,
                        price = :price,
                        price_pending = :price_pending,
                        available = 1,
                        archived = 0,
                        in_menu = 1,
                        emoji = :emoji,
                        stock_mode = 'manual',
                        sizes = '[]',
                        extras = '[]',
                        flavor_options = '[]',
                        cone_links = '{}',
                        combo_config = '{}'
                    WHERE id = :id
                """),
                {
                    "id": target_id,
                    "name": name,
                    "desc": desc,
                    "cat_id": cat_id,
                    "price": price,
                    "price_pending": 1 if price_pending else 0,
                    "emoji": emoji,
                },
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO products (
                        id, name, description, category_id, price, price_pending,
                        image, emoji, available, archived, in_menu, stock_mode,
                        public_categories, sizes, extras, cone_links, flavor_options, combo_config
                    )
                    VALUES (
                        :id, :name, :desc, :cat_id, :price, :price_pending,
                        NULL, :emoji, 1, 0, 1, 'manual',
                        '[]', '[]', '[]', '{}', '[]', '{}'
                    )
                """),
                {
                    "id": target_id,
                    "name": name,
                    "desc": desc,
                    "cat_id": cat_id,
                    "price": price,
                    "price_pending": 1 if price_pending else 0,
                    "emoji": emoji,
                },
            )


def downgrade():
    conn = op.get_bind()
    ids_to_remove = [item[0] for item in HELADOS_ITEMS]
    for prod_id in ids_to_remove:
        conn.execute(text("DELETE FROM products WHERE id = :id"), {"id": prod_id})
