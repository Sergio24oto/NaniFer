from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20260930_bebidas_catalog'
down_revision = '20260923_product_flavor_options'
branch_labels = None
depends_on = None


BEBIDAS_ITEMS = [
    # --- GASEOSAS, AGUAS Y SABORIZADAS ---
    ("beb-gaseosa-15l", "Gaseosa 1.5L", "Línea primera marca · Botella familiar 1.5 litros.", 6000, False, "🥤"),
    ("beb-gaseosa-vidrio-125l", "Gaseosa vidrio 1.25L", "Botella de vidrio retornable 1.25 litros.", 5500, False, "🥤"),
    ("beb-gaseosa-500ml", "Gaseosa 500ml", "Botella individual 500 ml.", 3000, False, "🥤"),
    ("beb-gaseosa-lata-310ml", "Gaseosa lata 310ml", "Lata individual 310 ml bien helada.", 2500, False, "🥫"),
    ("beb-gaseosa-lata-220ml", "Gaseosa lata 220ml", "Lata mini 220 ml.", 2000, False, "🥫"),
    ("beb-gaseosa-botella-220ml", "Gaseosa botella 220ml", "Botellita de vidrio 220 ml.", 1500, False, "🍾"),
    ("beb-paso-toros-lata", "Paso de los Toros lata", "Pomelo / Tónica en lata.", 1200, False, "🥫"),
    ("beb-paso-toros-15l", "Paso de los Toros 1.5L", "Botella 1.5 litros.", 6000, False, "🥤"),
    ("beb-agua-15l", "Agua mineral 1.5L", "Con o sin gas · Botella 1.5 litros.", 4000, False, "💧"),
    ("agua", "Agua mineral 500ml", "500 ml · bien fresca.", 2200, False, "💧"),
    ("beb-aquarius-15l", "Aquarius 1.5L", "Agua saborizada · Botella 1.5 litros.", 5000, False, "🍐"),
    ("beb-aquarius-500ml", "Aquarius 500ml", "Agua saborizada · Botella 500 ml.", 2500, False, "🍐"),
    ("beb-levite-15l", "Levité 1.5L", "Agua saborizada · Botella 1.5 litros.", 4000, False, "🍊"),
    ("beb-levite-500ml", "Levité 500ml", "Agua saborizada · Botella 500 ml.", 1800, False, "🍊"),

    # --- JUGOS, LICUADOS Y BATIDOS ---
    ("beb-jugo-naranja-vaso", "Jugo Naranja vaso", "Exprimido natural recién hecho.", 3500, False, "🍊"),
    ("beb-licuado", "Licuado", "Preparado en el momento con fruta fresca.", 6000, False, "🍓"),
    ("beb-batido", "Batido", "Cremoso y bien frío.", 7000, False, "🥤"),
    ("beb-smoothie", "Smoothie", "Frutal y refrescante.", 5000, False, "🍹"),
    ("limonada", "Limonada", "Limón, menta y un toque de jengibre.", 0, True, "🍋"),
    ("beb-citric-1l", "Citric 1L", "Jugo 100% exprimido · 1 litro.", 7000, False, "🍊"),
    ("beb-citric-500ml", "Citric 500ml", "Jugo 100% exprimido · 500 ml.", 4000, False, "🍊"),
    ("beb-citric-200ml", "Citric 200ml", "Jugo 100% exprimido · 200 ml.", 0, True, "🍊"),
    ("beb-cepita-15l", "Cepita 1.5L", "Botella 1.5 litros.", 5500, False, "🧃"),
    ("beb-cepita-1l", "Cepita 1L", "Envase 1 litro.", 4000, False, "🧃"),
    ("beb-cepita-300ml", "Cepita 300ml botella", "Botellita individual 300 ml.", 2000, False, "🧃"),
    ("beb-cepita-200ml", "Cepita 200ml", "Cajita individual 200 ml.", 0, True, "🧃"),
    ("beb-cepita-fresh", "Cepita Fresh", "Bebida frutal refrescante.", 0, True, "🧃"),
    ("beb-baggio-1l", "Baggio grande 1L", "Jugo Baggio · Envase 1 litro.", 4000, False, "🧃"),
    ("beb-baggio-200ml", "Baggio mediano 200ml", "Jugo Baggio · Cajita 200 ml.", 2000, False, "🧃"),
    ("beb-baggio-125ml", "Baggio chico 125ml", "Jugo Baggio · Cajita 125 ml.", 0, True, "🧃"),
    ("beb-chocolatada-ilolay", "Chocolatada Ilolay 200ml", "Leche chocolatada individual 200 ml.", 2200, False, "🍫"),

    # --- CERVEZAS Y BEBIDAS CON ALCOHOL ---
    ("beb-brahma-473", "Brahma 473ml", "Lata 473 ml bien helada.", 3500, False, "🍺"),
    ("beb-corona-cero", "Corona Cero botellita", "Cerveza sin alcohol · Porrón.", 0, True, "🍺"),
    ("beb-corona-473", "Corona 473ml", "Lata 473 ml.", 4800, False, "🍺"),
    ("beb-corona-botellita", "Corona botellita", "Porrón clásico bien helado.", 5000, False, "🍺"),
    ("beb-stella-473", "Stella 473ml", "Stella Artois · Lata 473 ml.", 4500, False, "🍺"),
    ("beb-quilmes-473", "Quilmes 473ml", "Clásica · Lata 473 ml.", 0, True, "🍺"),
    ("beb-quilmes-sin-alcohol", "Quilmes sin alcohol", "Lata 473 ml · 0.0% alcohol.", 3500, False, "🍺"),
    ("beb-quilmes-stout", "Quilmes Stout", "Cerveza negra cremosa · Lata 473 ml.", 3500, False, "🍺"),
    ("beb-quilmes-1890", "Quilmes 1890 473ml", "Receta original · Lata 473 ml.", 4800, False, "🍺"),
    ("beb-miller-473", "Miller 473ml", "Genuine Draft · Lata 473 ml.", 6000, False, "🍺"),
    ("beb-miller-botellita", "Miller botellita", "Genuine Draft · Porrón individual.", 9000, False, "🍺"),
    ("beb-miller-laton-710", "Miller latón 710ml", "Genuine Draft · Latón 710 ml.", 9000, False, "🍺"),
    ("beb-heineken-laton-710", "Heineken latón 710ml", "Lager Premium · Latón 710 ml.", 6000, False, "🍺"),
    ("beb-imperial-xl-710", "Imperial Extra-Large 710ml", "Latón 710 ml.", 0, True, "🍺"),
    ("beb-imperial-golden", "Imperial Golden", "Especialidad · Lata 473 ml.", 3500, False, "🍺"),
    ("beb-imperial-negra", "Imperial Negra", "Especialidad oscura.", 0, True, "🍺"),
    ("beb-imperial-golden-lager", "Imperial Golden/Lager", "Especialidad rubia.", 0, True, "🍺"),
    ("beb-imperial-cream-stout", "Imperial Cream Stout", "Cerveza negra intensa y cremosa.", 0, True, "🍺"),
    ("beb-santa-fe-473", "Santa Fe 473ml", "Lata 473 ml.", 6500, False, "🍺"),
    ("beb-fernet-botellita", "Fernet botellita", "Formato individual.", 1000, False, "🥃"),
    ("beb-vaso-granadina", "Vaso Granadina", "Toque dulce tradicional.", 0, True, "🍷"),

    # --- CERVEZAS DE LITRO ---
    ("beb-litro-brahma", "Brahma Litro", "Botella 1 litro para compartir.", 9000, False, "🍻"),
    ("beb-litro-miller", "Miller Litro", "Genuine Draft · Botella 1 litro.", 10000, False, "🍻"),
    ("beb-litro-heineken", "Heineken Litro", "Lager Premium · Botella 1 litro.", 10000, False, "🍻"),
    ("beb-litro-warsteiner", "Warsteiner Litro", "Premium Alemana · Botella 1 litro.", 8000, False, "🍻"),
    ("beb-litro-quilmes", "Quilmes Litro", "Clásica · Botella 1 litro.", 8000, False, "🍻"),
]


def upgrade():
    conn = op.get_bind()
    res = conn.execute(text("SELECT id FROM categories WHERE LOWER(name) LIKE '%bebida%' LIMIT 1")).fetchone()
    if res:
        cat_id = res[0]
        conn.execute(
            text("UPDATE categories SET public_visible = 1, image = COALESCE(image, '/menu/bebidas.webp') WHERE id = :id"),
            {"id": cat_id},
        )
    else:
        cat_id = "demo-4"
        conn.execute(
            text("""
                INSERT INTO categories (id, name, image, sort_order, public_visible, note, stock_area)
                VALUES (:id, 'Bebidas', '/menu/bebidas.webp', 5, 1, '', 'other')
            """),
            {"id": cat_id},
        )

    for prod_id, name, desc, price, price_pending, emoji in BEBIDAS_ITEMS:
        existing_by_id = conn.execute(
            text("SELECT id FROM products WHERE id = :id LIMIT 1"),
            {"id": prod_id},
        ).fetchone()
        existing_by_name = conn.execute(
            text("SELECT id FROM products WHERE LOWER(name) = LOWER(:name) LIMIT 1"),
            {"name": name},
        ).fetchone()

        available = 0 if price_pending else 1

        if existing_by_id:
            conn.execute(
                text("""
                    UPDATE products
                    SET name = :name,
                        description = :desc,
                        category_id = :cat_id,
                        price = :price,
                        price_pending = :price_pending,
                        available = :available,
                        archived = 0,
                        emoji = :emoji
                    WHERE id = :id
                """),
                {
                    "id": prod_id,
                    "name": name,
                    "desc": desc,
                    "cat_id": cat_id,
                    "price": price,
                    "price_pending": 1 if price_pending else 0,
                    "available": available,
                    "emoji": emoji,
                },
            )
        elif existing_by_name:
            conn.execute(
                text("""
                    UPDATE products
                    SET description = :desc,
                        category_id = :cat_id,
                        price = :price,
                        price_pending = :price_pending,
                        available = :available,
                        archived = 0,
                        emoji = :emoji
                    WHERE id = :id
                """),
                {
                    "id": existing_by_name[0],
                    "desc": desc,
                    "cat_id": cat_id,
                    "price": price,
                    "price_pending": 1 if price_pending else 0,
                    "available": available,
                    "emoji": emoji,
                },
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO products (
                        id, name, description, category_id, price, price_pending,
                        image, emoji, available, archived, stock_mode,
                        public_categories, sizes, extras, cone_links, flavor_options
                    )
                    VALUES (
                        :id, :name, :desc, :cat_id, :price, :price_pending,
                        NULL, :emoji, :available, 0, 'manual',
                        '[]', '[]', '[]', '{}', '[]'
                    )
                """),
                {
                    "id": prod_id,
                    "name": name,
                    "desc": desc,
                    "cat_id": cat_id,
                    "price": price,
                    "price_pending": 1 if price_pending else 0,
                    "available": available,
                    "emoji": emoji,
                },
            )


def downgrade():
    conn = op.get_bind()
    ids_to_remove = [item[0] for item in BEBIDAS_ITEMS if item[0] not in ("agua", "limonada")]
    for prod_id in ids_to_remove:
        conn.execute(text("DELETE FROM products WHERE id = :id"), {"id": prod_id})
