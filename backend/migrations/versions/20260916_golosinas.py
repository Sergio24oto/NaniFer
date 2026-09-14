from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
import json
from datetime import datetime, date

revision = '20260916_golosinas'
down_revision = '20260915_bebidas_image'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    conn.execute(text("UPDATE categories SET stock_area = 'candies' WHERE LOWER(name) LIKE '%golosina%' OR LOWER(name) LIKE '%caramelo%'"))
    
    # Check if category Golosinas exists
    res = conn.execute(text("SELECT id FROM categories WHERE name = 'Golosinas' LIMIT 1")).fetchone()
    if res:
        cat_id = res[0]
        conn.execute(text("UPDATE categories SET stock_area = 'candies', public_visible = 1, sort_order = 7 WHERE id = :id"), {'id': cat_id})
    else:
        cat_id = 'cat-golosinas'
        conn.execute(text("""
            INSERT INTO categories (id, name, image, sort_order, public_visible, note, stock_area)
            VALUES (:id, 'Golosinas', NULL, 7, 1, '', 'candies')
        """), {'id': cat_id})
    
    now_dt = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    today_str = str(date.today())

    products_data = [
        {
            'id': 'prod-gomitas-frutales',
            'name': 'Gomitas frutales',
            'desc': 'Gomitas surtidas por peso. Elegí la cantidad en gramos.',
            'price': 1200.0,
            'sizes': [
                {'name': '100 gramos', 'salePrice': 1200},
                {'name': '200 gramos', 'salePrice': 2400},
                {'name': '250 gramos', 'salePrice': 3000},
                {'name': '500 gramos', 'salePrice': 5800}
            ],
            'stock_id': 'stock-prod-gomitas-frutales',
            'qty': 50,
            'units_per_pkg': 10,
            'pkg_type': 'bolsa',
            'packages': 5,
            'total_cost': 25000.0
        },
        {
            'id': 'prod-beldent-menta',
            'name': 'Chicles Beldent Menta',
            'desc': 'Tablita de chicles sabor menta fresca.',
            'price': 800.0,
            'sizes': [],
            'stock_id': 'stock-prod-beldent-menta',
            'qty': 40,
            'units_per_pkg': 20,
            'pkg_type': 'caja',
            'packages': 2,
            'total_cost': 16000.0
        },
        {
            'id': 'prod-flynn-paff',
            'name': 'Caramelos Flynn Paff',
            'desc': 'Caramelos masticables surtidos (por unidad).',
            'price': 150.0,
            'sizes': [],
            'stock_id': 'stock-prod-flynn-paff',
            'qty': 200,
            'units_per_pkg': 100,
            'pkg_type': 'bolsa',
            'packages': 2,
            'total_cost': 12000.0
        }
    ]

    for p in products_data:
        existing = conn.execute(text("SELECT id FROM products WHERE name = :name LIMIT 1"), {'name': p['name']}).fetchone()
        if not existing:
            conn.execute(text("""
                INSERT INTO products (id, name, description, category_id, price, price_pending, image, emoji, available, archived, stock_mode, public_categories, sizes, extras, cone_links)
                VALUES (:id, :name, :desc, :cat_id, :price, 0, NULL, '🍬', 1, 0, 'unit', '[]', :sizes, '[]', '{}')
            """), {
                'id': p['id'],
                'name': p['name'],
                'desc': p['desc'],
                'cat_id': cat_id,
                'price': p['price'],
                'sizes': json.dumps(p['sizes'])
            })
            
            conn.execute(text("""
                INSERT INTO stock_items (id, product_id, flavor_id, kind, name, unit, quantity, opened, version, units_per_package)
                VALUES (:stock_id, :prod_id, NULL, 'unit', :name, 'unidades', :qty, 0, 1, :units_per_pkg)
            """), {
                'stock_id': p['stock_id'],
                'prod_id': p['id'],
                'name': p['name'],
                'qty': p['qty'],
                'units_per_pkg': p['units_per_pkg']
            })

            mov_id = 'mov-init-' + p['id']
            purchase_json = json.dumps({
                'type': p['pkg_type'],
                'packages': p['packages'],
                'unitsPerPackage': p['units_per_pkg'],
                'units': p['qty'],
                'date': today_str
            })
            conn.execute(text("""
                INSERT INTO stock_movements (id, stock_id, version, user_id, kind, `before`, `after`, opened_before, opened_after, supplier_id, unit_cost, total_cost, note, created_at, purchase)
                VALUES (:mov_id, :stock_id, 1, NULL, 'receive', 0, :qty, 0, 0, NULL, :unit_cost, :total_cost, 'Carga inicial de stock', :now_dt, :purchase)
            """), {
                'mov_id': mov_id,
                'stock_id': p['stock_id'],
                'qty': p['qty'],
                'unit_cost': p['total_cost'] / p['qty'],
                'total_cost': p['total_cost'],
                'now_dt': now_dt,
                'purchase': purchase_json
            })

def downgrade():
    pass
