from datetime import timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import SessionLocal
from app.models import StockItem, Visit, Order, Payment, Product, Reservation, User, Sale, Table
from app.attention import calendar_today
from test_mysql import fixture, key, account, pay, deliver, HEADERS


def post(f, path, body, token=None):
    return f['client'].post('/api' + path, json=body, headers={'Idempotency-Key': token or key()})


def test_manual_preparation_same_visit_and_new_visit(fixture):
    f = fixture
    body = {'expectedAccount': None, 'items': [{'productId': f['product'], 'quantity': 2}]}
    token = key()
    path = f"/tables/{f['table']}/consumptions"
    first = post(f, path, body, token)
    assert first.status_code == 200
    assert post(f, path, body, token).json() == first.json()
    v = first.json()['accountId']
    with SessionLocal() as db:
        o = db.get(Order, first.json()['id'])
        assert (o.status, o.origin, o.created_by) == ('entregado', 'manual', f['user_id'])
        assert not list(db.scalars(select(Payment).where(Payment.visit_id == v)))
    qr = post(f, '/visits/'+v+'/orders', {'expectedAccount':v,'needsPreparation':True,'items':[{'productId':f['product'],'quantity':1}]})
    assert qr.status_code == 200
    assert account(f, v)['balance'] == 3000
    assert pay(f, v, 3000).status_code == 200
    assert f['client'].post('/api/visits/'+v+'/close').status_code == 409
    with SessionLocal() as db:
        assert db.get(Order, qr.json()['id']).status == 'pendiente'
    deliver(f, qr.json()['id'])
    assert f['client'].post('/api/visits/'+v+'/close').status_code == 200
    new = post(f, path, body).json()['accountId']
    assert new != v and account(f, new)['balance'] == 2000


def test_counter_atomic_paid_preparation_and_retries(fixture):
    f = fixture
    with SessionLocal() as db:
        db.get(Product, f['product']).price = Decimal('2500')
        db.commit()
    items = [{'productId': f['product'], 'quantity': 1}]
    assert post(f, '/counter/quote', {'items': items}).json()['total'] == '2500.00'
    body = {'items': items, 'method': 'tarjeta', 'expectedBalance': 2500}
    token = key()
    def send(_):
        with TestClient(app, headers=dict(f['client'].headers), cookies=f['client'].cookies) as c:
            return c.post('/api/counter/checkout', json=body, headers={'Idempotency-Key': token})
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()['id'] for r in results}) == 1
    first = results[0].json()
    with SessionLocal() as db:
        v = db.get(Visit, first['accountId'])
        assert v.table_number is None and v.closed_at is not None
        assert db.get(Sale, first['id']).current_total == 2500
        before = len(list(db.scalars(select(Visit.id).where(Visit.waitress_id == f['user_id']))))
    assert post(f, '/counter/checkout', {**body, 'expectedBalance': 1}).status_code == 409
    with SessionLocal() as db:
        assert len(list(db.scalars(select(Visit.id).where(Visit.waitress_id == f['user_id'])))) == before
    second = post(f, '/counter/checkout', {**body, 'needsPreparation': True}).json()
    assert second['accountId'] != first['accountId']
    state = f['client'].get('/api/state').json()
    o = next(o for o in state['orders'] if o['accountId'] == second['accountId'])
    assert o['table'] is None and o['status'] == 'pendiente'
    assert account(f, second['accountId'])['balance'] == 0
    deliver(f, o['id'])
    with SessionLocal() as db:
        assert db.get(Visit, second['accountId']).closed_at is not None
    sales = f['client'].get('/api/sales').json()['sales']
    assert len([s for s in sales if s['id'] in (first['id'], second['id'])]) == 2


def reserve(f, date=None):
    return post(f, f"/tables/{f['table']}/reservations", {'name':'Reserva privada', 'date':str(date or calendar_today()), 'time':'18:00', 'note':'Nota privada'})


def test_reservations_permissions_privacy_and_occupied(fixture):
    f = fixture
    today = calendar_today()
    for role in ['staff', 'admin']:
        with SessionLocal() as db:
            db.get(User, f['user_id']).role = role
            db.commit()
        r = reserve(f, today + timedelta(days=1 if role == 'staff' else 2))
        assert r.status_code == 200
    r = reserve(f).json()
    assert reserve(f).status_code == 409
    assert f['client'].post(f"/api/tables/{f['table']}/open").status_code == 409
    v = f['client'].post(f"/api/tables/{f['table']}/open", json={'reservationAcknowledgment':r['acknowledgment']}).json()['id']
    assert account(f, v)['balance'] == 0
    assert post(f, '/reservations/'+r['id']+'/arrive', {'expectedVersion':0}).status_code == 409
    arrived = post(f, '/reservations/'+r['id']+'/arrive', {'expectedVersion':0, 'linkExisting':True, 'expectedVisit':v})
    assert arrived.status_code == 200 and arrived.json()['visitId'] == v
    edited = reserve(f).json()
    token = key()
    edit = {'name':'Nombre editado', 'date':str(today), 'time':'19:30', 'note':'Otra nota', 'expectedVersion':0}
    assert post(f, '/reservations/'+edited['id']+'/edit', edit, token).status_code == 200
    assert post(f, '/reservations/'+edited['id']+'/edit', edit, token).json()['version'] == 1
    assert post(f, '/reservations/'+edited['id']+'/cancel', {'expectedVersion':0}).status_code == 409
    assert post(f, '/reservations/'+edited['id']+'/cancel', {'expectedVersion':1}).status_code == 200
    assert account(f, v)['balance'] == 0
    with TestClient(app, headers=HEADERS) as c:
        assert c.get('/api/reservations', params={'date':str(today)}).status_code == 401
        assert c.post(f"/api/tables/{f['table']}/reservations", json=edit, headers={'Idempotency-Key':key()}).status_code == 401
        c.post(f"/api/public/mesa/{f['table']}/join")
        text = c.get(f"/api/public/mesa/{f['table']}").text
        assert 'reservations' not in text and 'privada' not in text and 'Nombre editado' not in text
    with SessionLocal() as db:
        db.get(User, f['user_id']).can_manage_reservations = False
        db.commit()
    assert reserve(f).status_code == 403


def test_concurrent_reservation_and_arrival_free(fixture):
    f = fixture
    body = {'name':'Simultánea', 'date':str(calendar_today()), 'time':'00:45'}
    token = key()
    def send(_):
        with TestClient(app, headers=dict(f['client'].headers), cookies=f['client'].cookies) as c:
            return c.post(f"/api/tables/{f['table']}/reservations", json=body, headers={'Idempotency-Key':token})
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()['id'] for r in results}) == 1
    r = results[0].json()
    assert r['date'] == body['date'] and r['time'] == '00:45'
    a = post(f, '/reservations/'+r['id']+'/arrive', {'expectedVersion':0})
    assert a.status_code == 200
    assert account(f, a.json()['visitId'])['total'] == 0


def test_fifteen_tables_concurrent_manual_entries(fixture):
    from app.models import Table
    f = fixture
    with SessionLocal() as db:
        used = set(db.scalars(select(Table.number)))
        for n in range(9000, 9100):
            if n not in used and len(f['tables']) < 15:
                f['tables'].append(n)
                db.add(Table(number=n))
        db.commit()
    def send(number):
        with TestClient(app, headers=dict(f['client'].headers), cookies=f['client'].cookies) as c:
            body = {'expectedAccount':None, 'items':[{'productId':f['product'],'quantity':1}]}
            return c.post(f'/api/tables/{number}/consumptions',json=body,headers={'Idempotency-Key':key()})
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(send, f['tables']))
    assert len(results) == 15 and all(r.status_code == 200 for r in results)
    ids = {r.json()['accountId'] for r in results}
    state = f['client'].get('/api/state').json()
    accounts = [a for a in state['accounts'] if a['id'] in ids]
    assert len(accounts) == 15 and sum(a['balance'] for a in accounts) == 15000
    assert all(o['status']=='entregado' for o in state['orders'] if o['accountId'] in ids)


def test_reservation_created_while_occupied_preserves_current_visit(fixture):
    f=fixture
    first=post(f,f"/tables/{f['table']}/consumptions",{'items':[{'productId':f['product'],'quantity':1}]})
    assert first.status_code==200
    visit=first.json()['accountId']
    before=account(f,visit)
    result=reserve(f,calendar_today()+timedelta(days=40))
    assert result.status_code==200
    assert account(f,visit)==before
    assert result.json()['visitId'] is None
    with SessionLocal() as db:
        r=db.get(Reservation,result.json()['id'])
        assert r.created_by==f['user_id'] and r.updated_by==f['user_id']
        assert r.active_date==calendar_today()+timedelta(days=40)


def test_direct_delivery_and_deliver_all_to_liberate_table(fixture):
    f = fixture
    v = f['client'].post(f"/api/tables/{f['table']}/open").json()['id']
    qr = post(f, '/visits/' + v + '/orders', {'expectedAccount': v, 'needsPreparation': True, 'items': [{'productId': f['product'], 'quantity': 1}]})
    assert qr.status_code == 200
    oid = qr.json()['id']
    with SessionLocal() as db:
        assert db.get(Order, oid).status == 'pendiente'
    assert pay(f, v, 1000).status_code == 200
    assert f['client'].post('/api/visits/' + v + '/close').status_code == 409
    assert f['client'].post('/api/visits/' + v + '/deliver-all').status_code == 200
    with SessionLocal() as db:
        assert db.get(Order, oid).status == 'entregado'
    assert f['client'].post('/api/visits/' + v + '/close').status_code == 200
    v2 = f['client'].post(f"/api/tables/{f['table']}/open").json()['id']
    qr2 = post(f, '/visits/' + v2 + '/orders', {'expectedAccount': v2, 'needsPreparation': True, 'items': [{'productId': f['product'], 'quantity': 1}]})
    oid2 = qr2.json()['id']
    assert f['client'].post(f"/api/orders/{oid2}/deliver").status_code == 200
    with SessionLocal() as db:
        assert db.get(Order, oid2).status == 'entregado'
    assert pay(f, v2, 1000).status_code == 200
    assert f['client'].post('/api/visits/' + v2 + '/close').status_code == 200


def test_split_and_qr_payment(fixture):
    f = fixture
    v = f['client'].post(f"/api/tables/{f['table']}/open").json()['id']
    post(f, f'/tables/{f["table"]}/consumptions', {
        'expectedAccount': v,
        'items': [{'productId': f['product'], 'quantity': 3}]
    })
    bal = account(f, v)['balance']
    assert bal == 3000

    bad_split = post(f, f'/visits/{v}/payments', {
        'method': 'mixto',
        'expectedBalance': 3000,
        'splits': [
            {'method': 'efectivo', 'amount': 1000},
            {'method': 'qr', 'amount': 1500}
        ]
    })
    assert bad_split.status_code == 422

    bad_cash = post(f, f'/visits/{v}/payments', {
        'method': 'mixto',
        'expectedBalance': 3000,
        'splits': [
            {'method': 'efectivo', 'amount': 2000, 'received': 1500},
            {'method': 'qr', 'amount': 1000}
        ]
    })
    assert bad_cash.status_code == 422

    ok_split = post(f, f'/visits/{v}/payments', {
        'method': 'mixto',
        'expectedBalance': 3000,
        'splits': [
            {'method': 'efectivo', 'amount': 2000, 'received': 2500},
            {'method': 'qr', 'amount': 1000}
        ]
    })
    assert ok_split.status_code == 200
    res = ok_split.json()
    assert res['total'] == 3000
    assert res['method'] == 'mixto'
    assert res['change'] == 500
    assert len(res['splits']) == 2

    with SessionLocal() as db:
        p = db.get(Payment, res['id'])
        assert p.method == 'mixto'
        assert p.amount == Decimal('3000.00')
        assert p.received == Decimal('2500.00')
        assert p.change == Decimal('500.00')
        assert len(p.splits) == 2
        assert p.splits[0]['method'] == 'efectivo'
        assert p.splits[1]['method'] == 'qr'


def test_join_and_separate_tables(fixture):
    f = fixture
    c = f['client']
    t1 = f['table']
    t2 = t1 + 100
    f['tables'].append(t2)
    with SessionLocal() as db:
        db.add(Table(number=t2))
        db.commit()

    v1 = c.post(f"/api/tables/{t1}/open").json()['id']
    post(f, f'/tables/{t1}/consumptions', {
        'expectedAccount': v1,
        'items': [{'productId': f['product'], 'quantity': 1}]
    })
    assert account(f, v1)['balance'] == 1000

    v2 = c.post(f"/api/tables/{t2}/open").json()['id']
    post(f, f'/tables/{t2}/consumptions', {
        'expectedAccount': v2,
        'items': [{'productId': f['product'], 'quantity': 2}]
    })
    assert account(f, v2)['balance'] == 2000

    join_res = c.post(f'/api/tables/{t1}/join', json={'targetTable': t2})
    assert join_res.status_code == 200

    acc1 = account(f, v1)
    assert acc1['balance'] == 3000
    assert t2 in acc1['joinedTables']

    v2_routed = c.post(f"/api/tables/{t2}/open").json()['id']
    assert v2_routed == v1

    post(f, f'/tables/{t2}/consumptions', {
        'expectedAccount': v1,
        'items': [{'productId': f['product'], 'quantity': 1}]
    })
    assert account(f, v1)['balance'] == 4000

    sep_res = c.post(f'/api/tables/{t1}/separate', json={'targetTable': t2})
    assert sep_res.status_code == 200

    acc1_after = account(f, v1)
    assert t2 not in acc1_after['joinedTables']




def test_table_sectors_and_management(fixture):
    f = fixture
    c = f['client']
    # Check tables in state
    state = c.get('/api/state').json()
    assert 'tables' in state
    tables = state['tables']
    assert any(t['sector'] == 'afuera' for t in tables)
    assert any(t['sector'] == 'salon' for t in tables)
    afuera_tables = [t for t in tables if t['sector'] == 'afuera']
    assert len(afuera_tables) >= 8

    # Non admin cannot create table
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'staff'
        db.commit()
    assert c.post('/api/tables', json={'sector': 'afuera'}).status_code == 403

    # Admin can create table
    with SessionLocal() as db:
        db.get(User, f['user_id']).role = 'admin'
        db.commit()
    r = c.post('/api/tables', json={'sector': 'afuera'})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['sector'] == 'afuera'
    assert data['displayNumber'] >= 9
    new_num = data['number']

    # Admin can delete the newly created table
    del_r = c.delete(f'/api/tables/{new_num}')
    assert del_r.status_code == 200


def test_edit_order_quantity_and_totals(fixture):
    f = fixture
    c = f['client']
    t = f['table']

    # Open table and add order with 2 units (price is 1000 each in fixture -> total 2000)
    r = post(f, f'/tables/{t}/consumptions', {
        'items': [{'productId': f['product'], 'quantity': 2}],
        'needsPreparation': False
    })
    assert r.status_code == 200

    state = c.get('/api/state').json()
    orders = [o for o in state['orders'] if o['table'] == t]
    assert len(orders) == 1
    order = orders[0]
    assert len(order['items']) == 1
    item = order['items'][0]
    assert item['quantity'] == 2
    assert 'id' in item
    unit_price = item['unitPrice']

    # Table balance
    acc = next(a for a in state['accounts'] if a['table'] == t)
    assert acc['total'] == 2 * unit_price
    assert acc['balance'] == 2 * unit_price

    # Edit consumption: reduce quantity from 2 to 1 (waitstaff made a mistake)
    edit_res = c.put(f"/api/orders/{order['id']}", json={
        'items': [{
            'id': item['id'],
            'productId': f['product'],
            'quantity': 1,
            'notes': 'Corregido por error de moza'
        }]
    })
    assert edit_res.status_code == 200, edit_res.text
    res_data = edit_res.json()
    assert res_data['ok'] is True
    assert res_data['total'] == 1 * unit_price
    assert res_data['balance'] == 1 * unit_price

    # Verify state after edit
    state_after = c.get('/api/state').json()
    acc_after = next(a for a in state_after['accounts'] if a['table'] == t)
    assert acc_after['total'] == 1 * unit_price
    assert acc_after['balance'] == 1 * unit_price

    orders_after = [o for o in state_after['orders'] if o['table'] == t]
    assert len(orders_after) == 1
    assert orders_after[0]['items'][0]['quantity'] == 1


def test_delete_item_and_cancel_order(fixture):
    f = fixture
    c = f['client']
    t = f['table']

    r = post(f, f'/tables/{t}/consumptions', {
        'items': [{'productId': f['product'], 'quantity': 2}],
        'needsPreparation': False
    })
    assert r.status_code == 200

    state = c.get('/api/state').json()
    order = next(o for o in state['orders'] if o['table'] == t)
    item_id = order['items'][0]['id']

    # Delete the single item via DELETE /api/orders/{id}/items/{item_id}
    del_item_res = c.delete(f"/api/orders/{order['id']}/items/{item_id}")
    assert del_item_res.status_code == 200
    assert del_item_res.json()['deletedOrder'] is True

    # Check state: order is deleted and balance is 0
    state_after = c.get('/api/state').json()
    orders_after = [o for o in state_after['orders'] if o['table'] == t]
    assert len(orders_after) == 0
    acc_after = next(a for a in state_after['accounts'] if a['table'] == t)
    assert acc_after['total'] == 0
    assert acc_after['balance'] == 0


def test_cancel_order_directly_and_paid_protection(fixture):
    f = fixture
    c = f['client']
    t = f['table']

    post(f, f'/tables/{t}/consumptions', {
        'items': [{'productId': f['product'], 'quantity': 1}],
        'needsPreparation': False
    })

    state = c.get('/api/state').json()
    order = next(o for o in state['orders'] if o['table'] == t)

    # Cancel directly via DELETE /api/orders/{id}
    del_res = c.delete(f"/api/orders/{order['id']}")
    assert del_res.status_code == 200
    assert del_res.json()['deleted'] is True

    # Re-add order and pay it
    acc = next(a for a in state['accounts'] if a['table'] == t)
    r2 = post(f, f'/tables/{t}/consumptions', {
        'expectedAccount': acc['id'],
        'items': [{'productId': f['product'], 'quantity': 1}],
        'needsPreparation': False
    })
    assert r2.status_code == 200, r2.text
    state2 = c.get('/api/state').json()
    order2 = next(o for o in state2['orders'] if o['table'] == t)
    acc2 = next(a for a in state2['accounts'] if a['table'] == t)

    # Pay the table
    pay_res = post(f, f"/visits/{acc2['id']}/payments", {
        'method': 'efectivo',
        'expectedBalance': acc2['balance'],
        'received': acc2['balance']
    })
    assert pay_res.status_code == 200

    # Attempting to delete or edit a paid order must fail (409)
    assert c.delete(f"/api/orders/{order2['id']}").status_code == 409
    assert c.put(f"/api/orders/{order2['id']}", json={'items': []}).status_code == 409


def test_order_edit_and_cancel_reverts_stock(fixture):
    from test_stock import configured
    f = fixture
    c = f['client']
    t = f['table']

    sid = configured(f, initial=10)

    # Initial stock is 10
    with SessionLocal() as db:
        assert db.get(StockItem, sid).quantity == 10

    # Place order of 2 units
    post(f, f'/tables/{t}/consumptions', {
        'items': [{'productId': f['product'], 'quantity': 2}],
        'needsPreparation': False
    })

    # Stock should be 8
    with SessionLocal() as db:
        assert db.get(StockItem, sid).quantity == 8

    state = c.get('/api/state').json()
    order = next(o for o in state['orders'] if o['table'] == t)
    item = order['items'][0]

    # Edit order: reduce quantity to 1
    edit_res = c.put(f"/api/orders/{order['id']}", json={
        'items': [{
            'id': item['id'],
            'productId': f['product'],
            'quantity': 1,
        }]
    })
    assert edit_res.status_code == 200

    # Stock should be restored by 1 unit -> now 9
    with SessionLocal() as db:
        assert db.get(StockItem, sid).quantity == 9

    # Cancel the entire order
    del_res = c.delete(f"/api/orders/{order['id']}")
    assert del_res.status_code == 200

    # Stock should be restored by the remaining 1 unit -> now back to 10!
    with SessionLocal() as db:
        assert db.get(StockItem, sid).quantity == 10
