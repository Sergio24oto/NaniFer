from decimal import Decimal
from fastapi.testclient import TestClient
from app.db import SessionLocal
from app.models import CashShift, CashMovement, Product
from test_mysql import fixture, key, account, pay, HEADERS


def post(f, path, body, token=None):
    return f['client'].post('/api' + path, json=body, headers={'Idempotency-Key': token or key()})


def test_cash_drawer_workflow_and_auto_sales(fixture):
    f = fixture
    c = f['client']

    # 1. Initially no shift is open
    res = c.get('/api/cash-drawer/current').json()
    assert res['active'] is False

    # 2. Open shift with $15.000 initial cash
    open_res = c.post('/api/cash-drawer/open', json={
        'initialCash': 15000,
        'notes': 'Turno Mañana'
    })
    assert open_res.status_code == 200
    shift_data = open_res.json()
    assert shift_data['active'] is True
    assert shift_data['shift']['initialCash'] == 15000
    assert shift_data['totals']['expectedCash'] == 15000

    # Cannot open another shift while one is active
    assert c.post('/api/cash-drawer/open', json={'initialCash': 5000}).status_code == 409

    # 3. Create cash sale on table -> MUST AUTO-ACCUMULATE IN SHIFT
    v = c.post(f"/api/tables/{f['table']}/open").json()['id']
    post(f, f'/tables/{f["table"]}/consumptions', {
        'expectedAccount': v,
        'items': [{'productId': f['product'], 'quantity': 2}] # $2000
    })
    pay_res = post(f, f'/visits/{v}/payments', {
        'method': 'efectivo',
        'received': 3000,
        'expectedBalance': 2000
    })
    assert pay_res.status_code == 200

    # 4. Create split sale on another table ($1000 cash, $1000 qr)
    v2 = c.post(f"/api/tables/{f['table']}/open").json()['id']
    post(f, f'/tables/{f["table"]}/consumptions', {
        'expectedAccount': v2,
        'items': [{'productId': f['product'], 'quantity': 2}] # $2000
    })
    split_res = post(f, f'/visits/{v2}/payments', {
        'method': 'mixto',
        'expectedBalance': 2000,
        'splits': [
            {'method': 'efectivo', 'amount': 1000, 'received': 1000},
            {'method': 'qr', 'amount': 1000}
        ]
    })
    assert split_res.status_code == 200

    # Check shift totals: cash sales = 2000 + 1000 = 3000
    curr = c.get('/api/cash-drawer/current').json()
    assert curr['active'] is True
    assert curr['totals']['cashSales'] == 3000
    assert curr['totals']['byMethod']['efectivo'] == 3000
    assert curr['totals']['byMethod']['qr'] == 1000
    assert curr['totals']['totalSales'] == 4000
    assert curr['totals']['expectedCash'] == 15000 + 3000 # 18000

    # 5. Record extraordinary cash egress (eg. $22.000 for verdulería)
    egress_res = c.post('/api/cash-drawer/movements', json={
        'kind': 'egreso',
        'amount': 22000,
        'category': 'Compras / Verdulería',
        'notes': 'Bananas y frutas de reposición'
    })
    assert egress_res.status_code == 200
    after_egress = egress_res.json()
    assert after_egress['totals']['totalEgresos'] == 22000
    # Expected cash: 18000 - 22000 = -4000
    assert after_egress['totals']['expectedCash'] == -4000
    assert len(after_egress['movements']) == 1
    assert after_egress['movements'][0]['notes'] == 'Bananas y frutas de reposición'

    # 6. Record extraordinary cash ingress (vuelto de verdulería: $2.500)
    ingress_res = c.post('/api/cash-drawer/movements', json={
        'kind': 'ingreso',
        'amount': 2500,
        'category': 'Vuelto de compras',
        'notes': 'Vuelto compra verdulería'
    })
    assert ingress_res.status_code == 200
    after_ingress = ingress_res.json()
    assert after_ingress['totals']['totalIngresos'] == 2500
    # Expected cash: -4000 + 2500 = -1500
    assert after_ingress['totals']['expectedCash'] == -1500
    assert len(after_ingress['movements']) == 2

    # 7. Close shift with physical cash count (Arqueo de caja)
    # Suppose they also added personal cash or counted $0
    close_res = c.post('/api/cash-drawer/close', json={
        'countedCash': 0,
        'notes': 'Cierre de turno verificado'
    })
    assert close_res.status_code == 200
    closed_data = close_res.json()
    assert closed_data['active'] is False
    assert closed_data['shift']['status'] == 'closed'
    assert closed_data['shift']['countedCash'] == 0
    assert closed_data['shift']['expectedCash'] == -1500
    # Difference = counted (0) - expected (-1500) = 1500
    assert closed_data['shift']['difference'] == 1500

    # 8. Check history endpoint
    history = c.get('/api/cash-drawer/history').json()
    assert len(history) >= 1
    assert history[0]['shift']['status'] == 'closed'
