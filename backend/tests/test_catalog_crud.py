from decimal import Decimal
from sqlalchemy import select, delete
from app.db import SessionLocal
from app.models import User, Category, Product, OrderItem
from test_mysql import fixture, key, open_visit, order

def test_admin_product_crud_retry_price_and_history(fixture):
    f = fixture
    c = f['client']
    with SessionLocal() as db:
        cat = db.get(Product, f['product']).category_id
    body = dict(name='Alta ' + key(), description='Descripción de prueba', categoryId=cat, price=None, image=None, available=True)
    assert c.post('/api/menu-management/products', json=body, headers={'Idempotency-Key': key()}).status_code == 403
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()
    token = key()
    r = c.post('/api/menu-management/products', json=body, headers={'Idempotency-Key': token})
    assert r.status_code == 200
    pid = r.json()['id']
    f['product_ids'].append(pid)
    assert c.post('/api/menu-management/products', json=body, headers={'Idempotency-Key': token}).json()['id'] == pid
    assert c.post('/api/menu-management/products', json=body, headers={'Idempotency-Key': key()}).status_code == 409
    f['product'] = pid
    v = open_visit(f)
    assert order(f, v).status_code == 422
    body['price'] = '2500.50'
    assert c.put('/api/menu-management/products/' + pid, json=body).status_code == 200
    r = order(f, v)
    assert r.status_code == 200
    body.update(name=body['name'] + ' editado', price='3200', description='Nueva descripción')
    assert c.put('/api/menu-management/products/' + pid, json=body).status_code == 200
    with SessionLocal() as db:
        item = db.scalar(select(OrderItem).where(OrderItem.order_id == r.json()['id']))
        assert item.unit_price == Decimal('2500.50')
    assert c.delete('/api/menu-management/products/' + pid).status_code == 200
    assert all(p['id'] != pid for p in c.get('/api/catalog').json()['products'])
    assert all(p['id'] != pid for p in c.get('/api/public/menu/1').json()['products'])
    assert order(f, v).status_code == 422
    assert c.post('/api/menu-management/products/' + pid + '/restore').status_code == 200
    assert any(p['id'] == pid for p in c.get('/api/catalog').json()['products'])

    # Permanent delete must fail because product has order items in history
    perm_fail = c.delete('/api/menu-management/products/' + pid + '?permanent=true')
    assert perm_fail.status_code == 409
    assert 'ventas o pedidos' in perm_fail.text

    body['price'] = '-1'
    assert c.put('/api/menu-management/products/' + pid, json=body).status_code == 422
    body['price'] = '3200'
    body['manageStock'] = True
    body['sizes'] = [{'name': 'Unidad', 'salePrice': '3200', 'price': '0', 'order': 0, 'equivalent': 1, 'stockUnits': 1, 'max': 0, 'enabled': True}]
    assert c.put('/api/menu-management/products/' + pid, json=body).status_code == 200
    with SessionLocal() as db:
        p_saved = db.get(Product, pid)
        assert p_saved.stock_mode == 'unit' and len(p_saved.sizes) == 1
    r_reorder = c.put('/api/menu-management/products-reorder', json={'productIds': [pid]})
    assert r_reorder.status_code == 200
    with SessionLocal() as db:
        assert db.get(Product, pid).sort_order == 0
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'staff'
        db.commit()
    assert c.delete('/api/menu-management/products/' + pid).status_code == 403
    assert c.put('/api/menu-management/products/' + pid, json={**body, 'price': '100'}).status_code == 403

def test_category_create_edit_note_and_duplicate(fixture):
    f = fixture
    c = f['client']
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()
    body = dict(name='Categoría ' + key(), image=None, order=3, visible=True, note='Una nota', stockArea='beverages')
    token = key()
    r = c.post('/api/menu-management/categories', json=body, headers={'Idempotency-Key': token})
    assert r.status_code == 200
    cid = r.json()['id']
    try:
        assert c.post('/api/menu-management/categories', json=body, headers={'Idempotency-Key': token}).json()['id'] == cid
        assert c.post('/api/menu-management/categories', json=body, headers={'Idempotency-Key': key()}).status_code == 409
        with SessionLocal() as db:
            assert db.get(Category, cid).stock_area == 'beverages'
        body.update(visible=False, note='Otra nota', stockArea='kiosk')
        assert c.put('/api/menu-management/categories/' + cid, json=body).status_code == 200
        with SessionLocal() as db:
            assert db.get(Category, cid).stock_area == 'kiosk'
        body.update(stockArea='candies')
        assert c.put('/api/menu-management/categories/' + cid, json=body).status_code == 200
        with SessionLocal() as db:
            assert db.get(Category, cid).stock_area == 'candies'
        assert all(x['id'] != cid for x in c.get('/api/public/menu/1').json()['categories'])

        # Try deleting category with a product attached
        pbody = dict(name='Prod Cat ' + key(), description='', categoryId=cid, price=None, image=None, available=True)
        pr = c.post('/api/menu-management/products', json=pbody, headers={'Idempotency-Key': key()})
        assert pr.status_code == 200
        cat_del_blocked = c.delete('/api/menu-management/categories/' + cid)
        assert cat_del_blocked.status_code == 409
        assert 'producto(s) asociado(s)' in cat_del_blocked.text

        # Delete the product permanently (since it has no orders or movements)
        prod_id = pr.json()['id']
        assert c.delete('/api/menu-management/products/' + prod_id + '?permanent=true').status_code == 200

        # Now deleting empty category succeeds
        assert c.delete('/api/menu-management/categories/' + cid).status_code == 200
        with SessionLocal() as db:
            assert db.get(Category, cid) is None
    finally:
        with SessionLocal() as db:
            db.execute(delete(Category).where(Category.id == cid))
            db.commit()


def test_upload_photo_and_assign_product(fixture):
    import base64
    import io
    from PIL import Image

    f = fixture
    c = f['client']
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()

    # Generate a dummy test image
    img = Image.new('RGB', (80, 80), (255, 128, 0))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

    # Upload photo
    r = c.post('/api/menu-management/upload-photo', json={'data': b64, 'name': 'test-photo'})
    assert r.status_code == 200
    res_data = r.json()
    assert 'image' in res_data
    assert res_data['image'].startswith('/api/uploads/menu/')
    img_url = res_data['image']

    # Fetch uploaded photo via GET endpoint
    img_fetch = c.get(img_url)
    assert img_fetch.status_code == 200
    assert img_fetch.headers.get('content-type') == 'image/webp'

    # Create product with this image
    with SessionLocal() as db:
        cat = db.get(Product, f['product']).category_id
    pbody = {
        'name': 'Test Producto Foto ' + key(),
        'description': 'Con foto subida',
        'categoryId': cat,
        'price': '2500',
        'image': img_url,
        'available': True,
        'inMenu': True
    }
    pr = c.post('/api/menu-management/products', json=pbody, headers={'Idempotency-Key': key()})
    assert pr.status_code == 200
    pid = pr.json()['id']
    f['product_ids'].append(pid)

    # Verify public menu returns the exact uploaded image URL
    menu_res = c.get('/api/public/menu/1')
    assert menu_res.status_code == 200
    prod = next(p for p in menu_res.json()['products'] if p['id'] == pid)
    assert prod['image'] == img_url


def test_category_and_product_subcategories(fixture):
    f = fixture
    c = f['client']
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()

    cat_name = 'Comidas Test ' + key()
    cat_body = {
        'name': cat_name,
        'image': None,
        'order': 10,
        'visible': True,
        'note': 'Sección de comidas',
        'stockArea': 'other',
        'subcategories': ['Pizzas', 'Empanadas', 'Cazuelas', 'Picadas y Papas', 'Sin TACC']
    }
    r_cat = c.post('/api/menu-management/categories', json=cat_body, headers={'Idempotency-Key': key()})
    assert r_cat.status_code == 200
    cat_id = r_cat.json()['id']

    # Verify category in management list has subcategories
    mgmt = c.get('/api/menu-management').json()
    cat_data = next(ct for ct in mgmt['categories'] if ct['id'] == cat_id)
    assert cat_data['subcategories'] == ['Pizzas', 'Empanadas', 'Cazuelas', 'Picadas y Papas', 'Sin TACC']

    # Create product with subcategory
    p_body = {
        'name': 'Pizza Napolitana ' + key(),
        'description': 'Muzzarella y tomate',
        'categoryId': cat_id,
        'subcategory': 'Pizzas',
        'price': '8500',
        'image': None,
        'available': True,
        'inMenu': True,
        'order': 1
    }
    r_prod = c.post('/api/menu-management/products', json=p_body, headers={'Idempotency-Key': key()})
    assert r_prod.status_code == 200
    prod_id = r_prod.json()['id']
    f['product_ids'].append(prod_id)

    # Verify product in management
    mgmt_after = c.get('/api/menu-management').json()
    prod_saved = next(p for p in mgmt_after['products'] if p['id'] == prod_id)
    assert prod_saved['subcategory'] == 'Pizzas'

    # Verify in public menu
    public_menu = c.get('/api/public/menu/1').json()
    pub_cat = next(ct for ct in public_menu['categories'] if ct['id'] == cat_id)
    assert pub_cat['subcategories'] == ['Pizzas', 'Empanadas', 'Cazuelas', 'Picadas y Papas', 'Sin TACC']
    pub_prod = next(p for p in public_menu['products'] if p['id'] == prod_id)
    assert pub_prod['subcategory'] == 'Pizzas'

    # Update product subcategory
    p_body['subcategory'] = 'Empanadas'
    r_up = c.put('/api/menu-management/products/' + prod_id, json=p_body)
    assert r_up.status_code == 200
    with SessionLocal() as db:
        assert db.get(Product, prod_id).subcategory == 'Empanadas'


def test_combo_product_extras_and_coffee_upgrade(fixture):
    f = fixture
    c = f['client']
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()
        cat_id = db.get(Product, f['product']).category_id

    combo_body = {
        'name': 'Combo Desayuno ' + key(),
        'description': 'Infusión + 2 medialunas',
        'categoryId': cat_id,
        'subcategory': 'Combos',
        'publicCategories': [],
        'price': '4500',
        'image': None,
        'available': True,
        'inMenu': True,
        'order': 0,
        'sizes': [],
        'flavorOptions': [],
        'comboConfig': {
            'is_combo': True,
            'steps': [
                {
                    'id': 'step-1',
                    'title': 'Elegí tu Infusión',
                    'type': 'single',
                    'min': 1,
                    'max': 1,
                    'required': True,
                    'options': ['Café', 'Café con leche', 'Té']
                }
            ],
            'upgradeCoffee': {
                'enabled': True,
                'price': 1000,
                'label': 'Café Grande'
            }
        },
        'extras': [
            {'name': 'Café Grande', 'price': 1000}
        ]
    }

    # Creating combo with extras and coffee upgrade
    r = c.post('/api/menu-management/products', json=combo_body, headers={'Idempotency-Key': key()})
    assert r.status_code == 200
    pid = r.json()['id']
    f['product_ids'].append(pid)

    with SessionLocal() as db:
        p_db = db.get(Product, pid)
        assert p_db.combo_config['upgradeCoffee']['price'] == 1000
        assert p_db.extras == [{'name': 'Café Grande', 'price': 1000}]

    # Updating combo coffee upgrade price from 1000 to 1200
    combo_body['comboConfig']['upgradeCoffee']['price'] = 1200
    combo_body['extras'] = [{'name': 'Café Grande', 'price': 1200}]
    r_put = c.put('/api/menu-management/products/' + pid, json=combo_body)
    assert r_put.status_code == 200

    with SessionLocal() as db:
        p_db = db.get(Product, pid)
        assert p_db.combo_config['upgradeCoffee']['price'] == 1200
        assert p_db.extras == [{'name': 'Café Grande', 'price': 1200}]

    # Order combo with coffee upgrade
    v = open_visit(f)
    order_body = {
        'expectedAccount': v,
        'items': [
            {
                'productId': pid,
                'size': '',
                'flavors': [],
                'extras': ['Café Grande (+$1.200)'],
                'notes': 'Elegí tu Infusión: Café con leche (GRANDE)',
                'quantity': 1
            }
        ]
    }
    r_order = c.post('/api/visits/' + v + '/orders', json=order_body, headers={'Idempotency-Key': key()})
    assert r_order.status_code == 200
    order_id = r_order.json()['id']
    with SessionLocal() as db:
        item = db.scalar(select(OrderItem).where(OrderItem.order_id == order_id))
        # Base 4500 + 1200 upgrade = 5700
        assert item.unit_price == Decimal('5700')



