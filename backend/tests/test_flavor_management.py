from sqlalchemy import select, delete
from app.db import SessionLocal
from app.models import User, Flavor, StockItem, StockMovement, Operation
from test_mysql import fixture, key

def test_admin_add_flavor_retry_duplicate_and_permissions(fixture):
    f = fixture
    c = f['client']
    name = 'Sabor QA ' + key()
    token = key()
    body = {'name': name, 'available': True}
    assert c.post('/api/stock/flavors', json=body, headers={'Idempotency-Key': token}).status_code == 403
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()
    try:
        r = c.post('/api/stock/flavors', json=body, headers={'Idempotency-Key': token})
        assert r.status_code == 200, r.text
        assert c.post('/api/stock/flavors', json=body, headers={'Idempotency-Key': token}).json() == r.json()
        assert c.post('/api/stock/flavors', json=body, headers={'Idempotency-Key': key()}).status_code == 409
        with SessionLocal() as db:
            stock = db.get(StockItem, r.json()['stockId'])
            assert stock.quantity is None and stock.opened == 0
        assert any(x['name'] == name for x in c.get('/api/public/menu/1').json()['flavors'])
        assert any(x['name'] == name for x in c.get('/api/stock?area=flavors').json()['items'])
    finally:
        with SessionLocal() as db:
            ids = list(db.scalars(select(Flavor.id).where(Flavor.name == name)))
            db.execute(delete(StockItem).where(StockItem.flavor_id.in_(ids)))
            db.execute(delete(Flavor).where(Flavor.id.in_(ids)))
            db.execute(delete(Operation).where(Operation.scope == 'flavor-create:' + f['user_id']))
            db.commit()

def test_admin_flavor_catalog_crud_and_safety_checks(fixture):
    f = fixture
    c = f['client']
    name = 'Sabor Menú ' + key()
    token = key()
    body = {'name': name, 'available': True}

    # Staff forbidden
    assert c.post('/api/menu-management/flavors', json=body, headers={'Idempotency-Key': token}).status_code == 403
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()

    # Create flavor via menu management
    r = c.post('/api/menu-management/flavors', json=body, headers={'Idempotency-Key': token})
    assert r.status_code == 200, r.text
    flavor_id = r.json()['id']
    stock_id = r.json()['stockId']

    try:
        # Check in management list
        mgmt = c.get('/api/menu-management').json()
        assert any(fl['id'] == flavor_id and fl['name'] == name and fl['available'] is True for fl in mgmt['flavors'])

        # Update flavor
        updated_name = name + ' Especial'
        up_res = c.put('/api/menu-management/flavors/' + flavor_id, json={'name': updated_name, 'available': False})
        assert up_res.status_code == 200
        assert up_res.json()['name'] == updated_name
        assert up_res.json()['available'] is False

        with SessionLocal() as db:
            fl = db.get(Flavor, flavor_id)
            assert fl.name == updated_name and fl.available is False
            si = db.get(StockItem, stock_id)
            assert si.name == updated_name

        # Simulate a stock movement to verify integrity block
        with SessionLocal() as db:
            mv = StockMovement(
                id=key(),
                stock_id=stock_id,
                version=1,
                kind='receive',
                before=0,
                after=2,
                opened_before=0,
                opened_after=0,
                note='Prueba de integridad',
            )
            db.add(mv)
            db.commit()

        # Delete must fail with 409 because movements exist
        del_fail = c.delete('/api/menu-management/flavors/' + flavor_id)
        assert del_fail.status_code == 409
        assert 'movimientos de stock' in del_fail.text

        # Clean up movement
        with SessionLocal() as db:
            db.execute(delete(StockMovement).where(StockMovement.stock_id == stock_id))
            db.commit()

        # Now delete should succeed
        del_ok = c.delete('/api/menu-management/flavors/' + flavor_id)
        assert del_ok.status_code == 200
        assert del_ok.json()['deleted'] is True

        # Verify deletion in db
        with SessionLocal() as db:
            assert db.get(Flavor, flavor_id) is None
            assert db.get(StockItem, stock_id) is None

    finally:
        with SessionLocal() as db:
            db.execute(delete(StockMovement).where(StockMovement.stock_id == stock_id))
            db.execute(delete(StockItem).where(StockItem.flavor_id == flavor_id))
            db.execute(delete(Flavor).where(Flavor.id == flavor_id))
            db.commit()
