from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
import uuid

revision = '20261015_product_in_menu'
down_revision = '20260930_bebidas_catalog'
branch_labels = None
depends_on = None

CATEGORIES = [
    ('Snacks', 'kiosk', 10),
    ('Alfajores', 'kiosk', 11),
    ('Galletitas', 'kiosk', 12),
    ('Chocolates', 'candies', 13),
    ('Chicles', 'candies', 14),
    ('Golosinas', 'candies', 15),
    ('Cigarrillos', 'kiosk', 16),
    ('Kiosco', 'kiosk', 17),
    ('Postres', 'kiosk', 18),
]

# (id, name, price, category)
KIOSCO_ITEMS = [
    ('kiosco-p011', '3D Original 40g', 2800, 'Snacks'),
    ('kiosco-p010', '3D Original 85g', 4500, 'Snacks'),
    ('kiosco-p068', '4:8 Alfajor de arroz Dulce de leche 24g', 1200, 'Alfajores'),
    ('kiosco-p069', '4:8 Alfajor de arroz Limón 24g', 1200, 'Alfajores'),
    ('kiosco-p055', '9 de Oro Bizcochos Agridulces 200g', 2500, 'Galletitas'),
    ('kiosco-p054', '9 de Oro Bizcochos Azucarados 210g', 2100, 'Galletitas'),
    ('kiosco-p088', 'Águila Minitorta Brownie 69g', 2000, 'Alfajores'),
    ('kiosco-p087', 'Águila Minitorta Clásica 69g', 2000, 'Alfajores'),
    ('kiosco-p036', 'Amor 110g', 1700, 'Galletitas'),
    ('kiosco-p085', 'B y N Alfajor Blanco 73.5g', 2000, 'Alfajores'),
    ('kiosco-p084', 'B y N Alfajor Negro 73.5g', 2000, 'Alfajores'),
    ('kiosco-p135', 'Bananina Split Bocadito Banana con dulce de leche bañado en chocolate', 1000, 'Chocolates'),
    ('kiosco-p144', 'Bazooka', 200, 'Chicles'),
    ('kiosco-p166', 'Beldent Frutilla Pop 10g 6u', 1500, 'Chicles'),
    ('kiosco-p165', 'Beldent Menta fuerte 10g 6u', 1500, 'Chicles'),
    ('kiosco-p164', 'Beldent Mentol Frozen 10g 6u', 1500, 'Chicles'),
    ('kiosco-p167', 'Beldent Tutti frutti 10g 6u', 1500, 'Chicles'),
    ('kiosco-p170', 'Beldent Confitados rellenos Frutilla-cítric 17.5g 9u', 1800, 'Chicles'),
    ('kiosco-p168', 'Beldent Confitados rellenos Frutos rojos 17.5g 9u', 1800, 'Chicles'),
    ('kiosco-p169', 'Beldent Confitados rellenos Sandía-cítric 17.5g 9u', 1800, 'Chicles'),
    ('kiosco-p064', 'Bocadito Marroc Felfort', 1000, 'Chocolates'),
    ('kiosco-p149', 'Bon o Bon Caja de 18u', 13000, 'Chocolates'),
    ('kiosco-p139', 'Bubbaloo Frutilla', 200, 'Chicles'),
    ('kiosco-p142', 'Bubbaloo Tutti frutti', 200, 'Chicles'),
    ('kiosco-p140', 'Bubbaloo Uva', 200, 'Chicles'),
    ('kiosco-p110', 'Cadbury Yogur de frutilla 82g', 7000, 'Chocolates'),
    ('kiosco-p146', 'Caramelos sueltos', 100, 'Golosinas'),
    ('kiosco-p013', 'Cheetos Queso 43g', 2800, 'Snacks'),
    ('kiosco-p012', 'Cheetos Queso 85g', 4500, 'Snacks'),
    ('kiosco-p189', 'Chesterfield Blue Motion 20u', 5500, 'Cigarrillos'),
    ('kiosco-p180', 'Chesterfield Original 10u', 4000, 'Cigarrillos'),
    ('kiosco-p190', 'Chesterfield Purple Motion 20u', 6000, 'Cigarrillos'),
    ('kiosco-p043', 'Chocolinas rellenas Chocolate 77g', 2000, 'Galletitas'),
    ('kiosco-p086', 'Chocotorta Alfajor Triple 71.5g', 2000, 'Alfajores'),
    ('kiosco-p127', 'Chupetín Paragüitas', 1500, 'Golosinas'),
    ('kiosco-p148', 'Chupetines sueltos', 300, 'Golosinas'),
    ('kiosco-p061', 'Club Social Jamón 23.5g', 800, 'Galletitas'),
    ('kiosco-p060', 'Club Social Original 24g', 800, 'Galletitas'),
    ('kiosco-p095', 'Cofler Almendras 55g', 4500, 'Chocolates'),
    ('kiosco-p096', 'Cofler Leche 55g', 4500, 'Chocolates'),
    ('kiosco-p089', 'Cofler Block Alfajor Triple 60g', 2000, 'Alfajores'),
    ('kiosco-p097', 'Cofler Block Gold 35g', 2500, 'Chocolates'),
    ('kiosco-p094', 'Cofler Rocklets 55g', 4500, 'Chocolates'),
    ('kiosco-p123', 'Crazy Pop Frutilla 12g', 1000, 'Golosinas'),
    ('kiosco-p052', 'Diversión 400g', 3500, 'Galletitas'),
    ('kiosco-p005', 'Doritos Queso 40g', 2800, 'Snacks'),
    ('kiosco-p006', 'Doritos Queso 77g', 4500, 'Snacks'),
    ('kiosco-p007', "Doritos Dinamita Extra Flamin' Hot 45g", 2800, 'Snacks'),
    ('kiosco-p124', 'Dos Corazones Chocolate con leche relleno', 2500, 'Chocolates'),
    ('kiosco-p040', 'Duquesa 115g', 2000, 'Galletitas'),
    ('kiosco-p175', 'Eight Naranja 26.5g', 2000, 'Golosinas'),
    ('kiosco-p057', 'Flow Cereal Frutos rojos con yogur 27g', 1200, 'Kiosco'),
    ('kiosco-p058', 'Flow Cereal Mix de frutas 23g', 1200, 'Kiosco'),
    ('kiosco-p059', 'Flow Cereal Equilibrio Frutos rojos con yogur 24g', 1200, 'Kiosco'),
    ('kiosco-p141', 'Flynn Paff', 200, 'Golosinas'),
    ('kiosco-p129', 'Flynn Paff Jelly Beans Challenge 40g', 200, 'Golosinas'),
    ('kiosco-p128', 'Flynn Paff XXL', 800, 'Golosinas'),
    ('kiosco-p039', 'Formis Dulce de leche 90g', 1500, 'Galletitas'),
    ('kiosco-p038', 'Formis Frutilla 90g', 1500, 'Galletitas'),
    ('kiosco-p048', 'Frutigran Avena y frutos rojos 250g', 4000, 'Galletitas'),
    ('kiosco-p047', 'Frutigran Chips de chocolate 255g', 4500, 'Galletitas'),
    ('kiosco-p145', 'Gelatinas', 500, 'Postres'),
    ('kiosco-p090', 'GOAT Alfajor Bon o Bon y dulce de leche 75g', 2500, 'Alfajores'),
    ('kiosco-p147', 'Gomitas sueltas', 100, 'Golosinas'),
    ('kiosco-p063', 'Graffiti Chocolate con leche y blanco', 2000, 'Chocolates'),
    ('kiosco-p062', 'Graffiti Chocolate negro 45g', 2000, 'Chocolates'),
    ('kiosco-p041', 'Habanitos 60g', 3800, 'Galletitas'),
    ('kiosco-p171', 'Halls Cherry 25.2g', 1800, 'Golosinas'),
    ('kiosco-p173', 'Halls Mentol 25.2g', 1800, 'Golosinas'),
    ('kiosco-p174', 'Halls Miel con menta 25.65g', 1800, 'Golosinas'),
    ('kiosco-p093', 'Kinder Bueno x2 43g (2 x 21.5g)', 5500, 'Chocolates'),
    ('kiosco-p092', 'Kinder Chocolate 12.5g', 1500, 'Chocolates'),
    ('kiosco-p130', 'Kinder Huevo', 5000, 'Chocolates'),
    ('kiosco-p091', 'Kinder Maxi Chocolate con leche relleno 21g', 2500, 'Chocolates'),
    ('kiosco-p067', 'KitKat Chocolate con leche 41.5g', 2500, 'Chocolates'),
    ('kiosco-p009', "Lay's Clásicas 40g", 2800, 'Snacks'),
    ('kiosco-p008', "Lay's Clásicas 85g", 4500, 'Snacks'),
    ('kiosco-p125', 'Lengüetazo Tutti frutti', 500, 'Golosinas'),
    ('kiosco-p046', 'Maná rellenas Frutilla 152g', 1800, 'Galletitas'),
    ('kiosco-p045', 'Maná rellenas Limón 152g', 1800, 'Galletitas'),
    ('kiosco-p044', 'Maná rellenas Vainilla 152g', 1800, 'Galletitas'),
    ('kiosco-p026', 'Maní King Tostado sin piel 100g', 1000, 'Snacks'),
    ('kiosco-p112', 'Mantecol Clásico 41g', 2000, 'Kiosco'),
    ('kiosco-p179', 'Marlboro 10u', 4800, 'Cigarrillos'),
    ('kiosco-p186', 'Marlboro 20u', 6700, 'Cigarrillos'),
    ('kiosco-p185', 'Marlboro Coral Crafted', 4800, 'Cigarrillos'),
    ('kiosco-p187', 'Marlboro Crafted 20u', 4500, 'Cigarrillos'),
    ('kiosco-p183', 'Marlboro Vista 20u', 7000, 'Cigarrillos'),
    ('kiosco-p182', 'Master Filter 20u', 2500, 'Cigarrillos'),
    ('kiosco-p037', 'Mellizas 110g', 1700, 'Galletitas'),
    ('kiosco-p114', 'Mentitas Bombón Menta', 1000, 'Chocolates'),
    ('kiosco-p107', 'Milka Almendras 50g', 5500, 'Chocolates'),
    ('kiosco-p103', 'Milka Combinado 50g', 5500, 'Chocolates'),
    ('kiosco-p102', 'Milka Leche 50g', 5500, 'Chocolates'),
    ('kiosco-p104', 'Milka Oreo 55g', 5500, 'Chocolates'),
    ('kiosco-p079', 'Milka Alfajor Dulce de leche 61g', 2500, 'Alfajores'),
    ('kiosco-p078', 'Milka Alfajor Oreo 70g', 2500, 'Alfajores'),
    ('kiosco-p143', 'Milka Bis Oreo', 500, 'Chocolates'),
    ('kiosco-p105', 'Milka Choco Pause Leche 45g', 3200, 'Chocolates'),
    ('kiosco-p106', 'Milka Choco Pause Oreo 45g', 3200, 'Chocolates'),
    ('kiosco-p028', 'Mini Oreo 50g', 1500, 'Galletitas'),
    ('kiosco-p027', 'Mini Pepitos Chips de chocolate 50g', 1500, 'Galletitas'),
    ('kiosco-p042', 'Mini Rhodesia 60g', 3800, 'Galletitas'),
    ('kiosco-p116', 'Mogul Arañitas Pinta lengua 30g', 1000, 'Golosinas'),
    ('kiosco-p137', 'Mogul Berries Frutilla, uva y blueberry', 1000, 'Golosinas'),
    ('kiosco-p115', 'Mogul Cerebritos Rellenos 30g', 1000, 'Golosinas'),
    ('kiosco-p122', 'Mogul Dientes 50g', 1300, 'Golosinas'),
    ('kiosco-p120', 'Mogul Extreme Ácido-dulce 50g', 1300, 'Golosinas'),
    ('kiosco-p136', 'Mogul Extreme Limón, uva, manzana y frutilla', 1000, 'Golosinas'),
    ('kiosco-p131', 'Mogul Extreme Tubitos Frutilla 15g', 1000, 'Golosinas'),
    ('kiosco-p126', 'Mogul Extreme Twist Max Blueberry 60g', 1000, 'Golosinas'),
    ('kiosco-p138', 'Mogul Frutales', 1000, 'Golosinas'),
    ('kiosco-p121', 'Mogul Moras 50g', 1300, 'Golosinas'),
    ('kiosco-p118', 'Mogul Mundial Jelly Beans 50g', 1300, 'Golosinas'),
    ('kiosco-p117', 'Mogul Tiburoncitos 30g', 1000, 'Golosinas'),
    ('kiosco-p049', 'Molino Natural Naranja y chips sabor chocolate 238g', 4500, 'Galletitas'),
    ('kiosco-p113', 'Monedas de chocolate', 1000, 'Chocolates'),
    ('kiosco-p035', 'Ópera 55g', 1000, 'Galletitas'),
    ('kiosco-p034', 'Ópera 92g', 1500, 'Galletitas'),
    ('kiosco-p032', 'Oreo Frutilla 118g', 3000, 'Galletitas'),
    ('kiosco-p077', 'Oreo Alfajor Triple 56g', 2500, 'Alfajores'),
    ('kiosco-p030', 'Oreo Original 118g', 3000, 'Galletitas'),
    ('kiosco-p033', 'Oreo Sin gluten 95g', 4300, 'Galletitas'),
    ('kiosco-p029', 'Pepitos Chips de chocolate 119g', 3000, 'Galletitas'),
    ('kiosco-p076', 'Pepitos Alfajor Triple Chips de chocolate 57g', 2500, 'Alfajores'),
    ('kiosco-p177', 'Philip Morris 10u', 4500, 'Cigarrillos'),
    ('kiosco-p178', 'Philip Morris Original 10u', 4500, 'Cigarrillos'),
    ('kiosco-p184', 'Philip Morris Original 20u', 6000, 'Cigarrillos'),
    ('kiosco-p015', 'Quento Mega Queso 95g', 3200, 'Snacks'),
    ('kiosco-p021', 'Quento Nachos Queso 40g', 1800, 'Snacks'),
    ('kiosco-p022', 'Quento Papas clásicas 50g', 1800, 'Snacks'),
    ('kiosco-p018', 'Quento Papas clásicas 92g', 3200, 'Snacks'),
    ('kiosco-p019', 'Quento Papas fritas Asado criollo 82g', 3200, 'Snacks'),
    ('kiosco-p024', 'Quento Papas fritas Jamón serrano 45g', 1800, 'Snacks'),
    ('kiosco-p016', 'Quento Papas fritas Limón 82g', 3200, 'Snacks'),
    ('kiosco-p014', 'Quento Papas fritas Mostaza 82g', 3200, 'Snacks'),
    ('kiosco-p025', 'Quento Papas fritas Queso cheddar 45g', 1800, 'Snacks'),
    ('kiosco-p017', 'Quento Papas fritas Queso cheddar 82g', 3200, 'Snacks'),
    ('kiosco-p020', 'Quento Papas fritas Queso crema y ciboulette 92g', 3200, 'Snacks'),
    ('kiosco-p023', 'Quento Papas fritas Salame 45g', 1800, 'Snacks'),
    ('kiosco-p071', 'Rasta Alfajor Blanco 70g', 2500, 'Alfajores'),
    ('kiosco-p072', 'Rasta Alfajor Negro 70g', 2500, 'Alfajores'),
    ('kiosco-p191', 'Red Point Filters 20u', 2800, 'Cigarrillos'),
    ('kiosco-p066', 'Rhodesia 22g', 1500, 'Chocolates'),
    ('kiosco-p133', 'Rocklets 20g', 1000, 'Chocolates'),
    ('kiosco-p134', 'Rocklets 40g', 2000, 'Chocolates'),
    ('kiosco-p080', 'Tatín Alfajor Blanco con dulce de leche 33g', 500, 'Alfajores'),
    ('kiosco-p081', 'Tatín Alfajor Negro con dulce de leche 33g', 500, 'Alfajores'),
    ('kiosco-p082', 'Tatín Alfajor Triple Blanco con dulce de leche 60g', 1200, 'Alfajores'),
    ('kiosco-p083', 'Tatín Alfajor Triple Negro con dulce de leche 60g', 1200, 'Alfajores'),
    ('kiosco-p075', 'Terrabusi Alfajor Intenso extra dulce de leche 55g', 2500, 'Alfajores'),
    ('kiosco-p065', 'Tita 19g', 1200, 'Chocolates'),
    ('kiosco-p098', 'Tiwis Chocolate con leche y cereal 25g', 1500, 'Chocolates'),
    ('kiosco-p150', 'Topline Menta 6.7g 4u', 700, 'Chicles'),
    ('kiosco-p151', 'Topline Strong 6.7g 4u', 700, 'Chicles'),
    ('kiosco-p157', 'Topline Seven Atomic Strong 14g 7u', 1300, 'Chicles'),
    ('kiosco-p153', 'Topline Seven Blowing Mandarine 14g 7u', 1300, 'Chicles'),
    ('kiosco-p154', 'Topline Seven Bubble Fun 14g 7u', 1300, 'Chicles'),
    ('kiosco-p152', 'Topline Seven Freezing Menthol 14g 7u', 1300, 'Chicles'),
    ('kiosco-p155', 'Topline Seven Sandía Mania 14g 7u', 1300, 'Chicles'),
    ('kiosco-p156', 'Topline Seven Vibrant Strawberry 14g 7u', 1300, 'Chicles'),
    ('kiosco-p159', 'Topline Seven Violet Cherry 14g 7u', 1300, 'Chicles'),
    ('kiosco-p158', 'Topline Seven X-Plosive Mint 14g 7u', 1300, 'Chicles'),
    ('kiosco-p160', 'Topline Ultra Citru Blueberry 24g 12u', 2500, 'Chicles'),
    ('kiosco-p163', 'Topline Ultra Clean Mint 24g 12u', 2500, 'Chicles'),
    ('kiosco-p162', 'Topline Ultra Green Mint 24g 12u', 2500, 'Chicles'),
    ('kiosco-p161', 'Topline Ultra Red Berry 24g 12u', 2500, 'Chicles'),
    ('kiosco-p050', 'Trío Chocolatinas Bañadas sabor chocolate 300g', 3500, 'Galletitas'),
    ('kiosco-p051', 'Trío Pepas Membrillo 300g', 3000, 'Galletitas'),
    ('kiosco-p004', 'Twistos Jamón ibérico 40g', 2800, 'Snacks'),
    ('kiosco-p002', 'Twistos Jamón ibérico 95g', 4500, 'Snacks'),
    ('kiosco-p003', 'Twistos Queso 40g', 2800, 'Snacks'),
    ('kiosco-p001', 'Twistos Queso 95g', 4500, 'Snacks'),
]

BEBIDAS_IMAGES = [
    ('217ef807-e599-4a77-a971-18ab3925fed3', 'Brahma 1 Lt', '/menu/brahma-1lt.webp'),
    ('beb-agua-15l', 'Agua mineral 1.5L', '/menu/agua-mineral-15l.webp'),
    ('agua', 'Agua mineral 500ml', '/menu/agua-mineral-15l.webp'),
    ('beb-aquarius-15l', 'Aquarius 1.5L', '/menu/aquarius-15l.webp'),
    ('beb-aquarius-500ml', 'Aquarius 500ml', '/menu/aquarius-500ml.webp'),
    ('beb-baggio-1l', 'Baggio grande 1L', '/menu/baggio-1l.webp'),
    ('beb-brahma-473', 'Brahma 473ml', '/menu/brahma-lata.webp'),
    ('beb-cepita-15l', 'Cepita 1.5L', '/menu/cepita-15l.webp'),
    ('beb-cepita-1l', 'Cepita 1L', '/menu/cepita-1l.webp'),
    ('beb-cepita-200ml', 'Cepita 200ml', '/menu/cepita-botellita.webp'),
    ('beb-cepita-300ml', 'Cepita 300ml botella', '/menu/cepita-botellita.webp'),
    ('beb-citric-1l', 'Citric 1L', '/menu/citric-1l.webp'),
    ('beb-citric-500ml', 'Citric 500ml', '/menu/citric-500ml.webp'),
    ('beb-corona-473', 'Corona 473ml', '/menu/corona-lata.webp'),
    ('beb-corona-botellita', 'Corona botellita', '/menu/corona-botellita.webp'),
    ('beb-corona-cero', 'Corona Cero botellita', '/menu/corona-botellita.webp'),
    ('beb-gaseosa-500ml', 'Gaseosa 500ml', '/menu/gaseosa-500ml.webp'),
    ('beb-gaseosa-lata-220ml', 'Gaseosa lata 220ml', '/menu/gaseosa-lata.webp'),
    ('beb-gaseosa-lata-310ml', 'Gaseosa lata 310ml', '/menu/gaseosa-lata.webp'),
    ('beb-gaseosa-vidrio-125l', 'Gaseosa vidrio 1.25L', '/menu/gaseosa-vidrio.webp'),
    ('beb-heineken-laton-710', 'Heineken latón 710ml', '/menu/heineken-laton.webp'),
    ('beb-imperial-golden', 'Imperial Golden', '/menu/imperial-golden.webp'),
    ('beb-imperial-golden-lager', 'Imperial Golden/Lager', '/menu/imperial-golden.webp'),
    ('beb-imperial-xl-710', 'Imperial Extra-Large 710ml', '/menu/imperial-golden.webp'),
    ('beb-levite-15l', 'Levité 1.5L', '/menu/levite-15l.webp'),
    ('beb-levite-500ml', 'Levité 500ml', '/menu/levite-500ml.webp'),
    ('beb-litro-brahma', 'Brahma Litro', '/menu/brahma-1lt.webp'),
    ('beb-litro-heineken', 'Heineken Litro', '/menu/heineken-1lt.webp'),
    ('beb-litro-miller', 'Miller Litro', '/menu/miller-1lt.webp'),
    ('beb-litro-quilmes', 'Quilmes Litro', '/menu/quilmes-1lt.webp'),
    ('beb-litro-warsteiner', 'Warsteiner Litro', '/menu/warsteiner-1lt.webp'),
    ('beb-paso-toros-15l', 'Paso de los Toros 1.5L', '/menu/paso-toros-15l.webp'),
]

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('products')]
    if 'in_menu' not in columns:
        op.add_column('products', sa.Column('in_menu', sa.Boolean(), server_default='1', nullable=False))
        conn.execute(text("UPDATE products SET in_menu = 1 WHERE in_menu IS NULL"))

    # Ensure categories exist
    cat_ids = {}
    for cat_name, stock_area, sort_order in CATEGORIES:
        row = conn.execute(
            text("SELECT id FROM categories WHERE name = :name LIMIT 1"),
            {"name": cat_name}
        ).fetchone()
        if row:
            cat_id = row[0]
            conn.execute(
                text("UPDATE categories SET stock_area = :area WHERE id = :id AND stock_area = 'other'"),
                {"area": stock_area, "id": cat_id}
            )
        else:
            cat_id = uuid.uuid4().hex
            conn.execute(
                text("""
                    INSERT INTO categories (id, name, stock_area, sort_order, public_visible, note)
                    VALUES (:id, :name, :area, :order, 1, '')
                """),
                {"id": cat_id, "name": cat_name, "area": stock_area, "order": sort_order}
            )
        cat_ids[cat_name] = cat_id

    # Insert or update the 173 items with in_menu = 0 and stock_mode = 'manual'
    for prod_id, name, price, cat_name in KIOSCO_ITEMS:
        cat_id = cat_ids.get(cat_name)
        if not cat_id:
            continue

        existing_by_id = conn.execute(
            text("SELECT id FROM products WHERE id = :id LIMIT 1"),
            {"id": prod_id}
        ).fetchone()

        existing_by_name = conn.execute(
            text("SELECT id FROM products WHERE LOWER(name) = LOWER(:name) AND archived = 0 LIMIT 1"),
            {"name": name}
        ).fetchone()

        target_id = prod_id
        if existing_by_id:
            conn.execute(
                text("""
                    UPDATE products
                    SET name = :name,
                        category_id = :cat_id,
                        price = :price,
                        price_pending = 0,
                        available = 1,
                        in_menu = 0,
                        stock_mode = 'manual',
                        archived = 0
                    WHERE id = :id
                """),
                {"id": prod_id, "name": name, "cat_id": cat_id, "price": price}
            )
            target_id = prod_id
        elif existing_by_name:
            target_id = existing_by_name[0]
            conn.execute(
                text("""
                    UPDATE products
                    SET category_id = :cat_id,
                        price = :price,
                        price_pending = 0,
                        available = 1,
                        in_menu = 0,
                        stock_mode = 'manual',
                        archived = 0
                    WHERE id = :id
                """),
                {"id": target_id, "cat_id": cat_id, "price": price}
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO products (
                        id, name, description, category_id, price, price_pending,
                        image, emoji, available, in_menu, archived, stock_mode,
                        public_categories, sizes, extras, cone_links, flavor_options
                    )
                    VALUES (
                        :id, :name, '', :cat_id, :price, 0,
                        NULL, '', 1, 0, 0, 'manual',
                        '[]', '[]', '[]', '{}', '[]'
                    )
                """),
                {"id": prod_id, "name": name, "cat_id": cat_id, "price": price}
            )

        # Ensure StockItem exists for this product
        stock_exists = conn.execute(
            text("SELECT id FROM stock_items WHERE product_id = :prod_id LIMIT 1"),
            {"prod_id": target_id}
        ).fetchone()
        if not stock_exists:
            stock_id = uuid.uuid4().hex
            conn.execute(
                text("""
                    INSERT INTO stock_items (id, product_id, flavor_id, kind, name, unit, quantity, opened, version, units_per_package)
                    VALUES (:id, :prod_id, NULL, 'unit', :name, 'unidades', NULL, 0, 0, 1)
                """),
                {"id": stock_id, "prod_id": target_id, "name": name}
            )
        else:
            conn.execute(
                text("UPDATE stock_items SET name = :name WHERE product_id = :prod_id"),
                {"name": name, "prod_id": target_id}
            )

    # Update beverage product images if available
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
    for prod_id, _, _, _ in KIOSCO_ITEMS:
        conn.execute(text("DELETE FROM stock_items WHERE product_id = :id"), {"id": prod_id})
        conn.execute(text("DELETE FROM products WHERE id = :id"), {"id": prod_id})
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('products')]
    if 'in_menu' in columns:
        op.drop_column('products', 'in_menu')
