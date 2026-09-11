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
