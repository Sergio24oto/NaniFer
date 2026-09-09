from datetime import timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import SessionLocal
from app.models import Visit, Order, Payment, Product, Reservation, User, Sale
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
