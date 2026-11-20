from decimal import Decimal
from datetime import datetime
from sqlalchemy import select
from fastapi.testclient import TestClient
from app.db import SessionLocal
from app.models import CashShift, CashMovement, Product
from test_mysql import fixture, key, account, pay, HEADERS


def post(f, path, body, token=None):
    return f['client'].post('/api' + path, json=body, headers={'Idempotency-Key': token or key()})


def test_cash_drawer_workflow_and_auto_sales(fixture):
    f = fixture
    c = f['client']

    # 0. Ensure database starts with no active open shifts
    with SessionLocal() as db:
        for s in db.scalars(select(CashShift).where(CashShift.status == 'open')):
            s.status = 'closed'
            s.closed_at = datetime.now()
        db.commit()

    # 1. Initially no shift is open
    res = c.get('/api/cash-drawer/current').json()
    assert res['active'] is False

    # 2. Open shift with $15.000 initial cash and responsible moza
    open_res = c.post('/api/cash-drawer/open', json={
        'initialCash': 15000,
        'shiftType': 'T. Mañana',
        'responsibleName': 'Sofía',
        'notes': 'Turno Mañana'
    })
    assert open_res.status_code == 200
    shift_data = open_res.json()
    assert shift_data['active'] is True
    assert shift_data['shift']['initialCash'] == 15000
    assert shift_data['shift']['openedByName'] == 'Sofía'
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
        'responsibleName': 'Lucía Gómez',
        'notes': 'Cierre de turno verificado'
    })
    assert close_res.status_code == 200
    closed_data = close_res.json()
    assert closed_data['active'] is False
    assert closed_data['shift']['status'] == 'closed'
    assert closed_data['shift']['countedCash'] == 0
    assert closed_data['shift']['expectedCash'] == -1500
    assert closed_data['shift']['closedByName'] == 'Lucía Gómez'
    # Difference = counted (0) - expected (-1500) = 1500
    assert closed_data['shift']['difference'] == 1500
    assert len(closed_data['entries']) >= 4

    # 8. Check history endpoint
    history = c.get('/api/cash-drawer/history').json()
    assert len(history) >= 1
    assert history[0]['shift']['status'] == 'closed'
    shift_id = history[0]['shift']['id']

    # 9. Test PDF Export for Shift
    pdf_res = c.get(f'/api/cash-drawer/shifts/{shift_id}/export.pdf')
    assert pdf_res.status_code == 200
    assert pdf_res.headers['content-type'] == 'application/pdf'
    assert len(pdf_res.content) > 1000

    # 10. Test Monthly Sheet and Monthly PDF Export
    now_dt = datetime.now()
    m_res = c.get(f'/api/cash-drawer/monthly-sheet?month={now_dt.month}&year={now_dt.year}')
    assert m_res.status_code == 200
    m_json = m_res.json()
    assert m_json['month'] == now_dt.month
    assert len(m_json['entries']) >= 1
    # Signature in spreadsheet entries must preserve the moza who opened the shift ('Sofía')
    target_entry = next((e for e in m_json['entries'] if e.get('shiftId') == shift_id), None)
    assert target_entry is not None
    assert target_entry['signature'] == 'Sofía'

    m_pdf_res = c.get(f'/api/cash-drawer/monthly-sheet/export.pdf?month={now_dt.month}&year={now_dt.year}')
    assert m_pdf_res.status_code == 200
    assert m_pdf_res.headers['content-type'] == 'application/pdf'
    assert len(m_pdf_res.content) > 1000

    # 11. Test Days list, Day detail and Day PDF export
    days_res = c.get('/api/cash-drawer/days')
    assert days_res.status_code == 200
    days_list = days_res.json()
    assert len(days_list) >= 1
    target_date = days_list[0]['date']
    assert 'facturacion' in days_list[0]
    assert len(days_list[0]['shifts']) >= 1

    day_detail = c.get(f'/api/cash-drawer/days/{target_date}')
    assert day_detail.status_code == 200
    day_json = day_detail.json()
    assert day_json['date'] == target_date
    day_shift = next((sh for sh in day_json['shifts'] if sh['shiftId'] == shift_id), None)
    assert day_shift is not None
    assert day_shift['saldo'] == day_shift['efectivo'] + day_shift['electronicTotal']
    # Signature in day sheet must preserve the moza who opened the shift ('Sofía')
    assert day_shift['signature'] == 'Sofía'

    day_pdf_res = c.get(f'/api/cash-drawer/days/{target_date}/export.pdf')
    assert day_pdf_res.status_code == 200
    assert day_pdf_res.headers['content-type'] == 'application/pdf'
    assert len(day_pdf_res.content) > 1000


def test_night_shift_after_midnight_preserves_daily_sheet(fixture):
    """
    Verifies that shifts opened after midnight (e.g. 23:30 / 01:00 AM) remain
    consolidated in the same business day sheet alongside Turno Mañana/Siesta/Tarde
    until the 03:00 AM operational cutoff.
    """
    from datetime import date, time, timedelta
    from app.business_day import ZONE, business_day
    from app.cash_drawer import build_day_summary
    from app.models import CashShift, User
    from app.services import uid

    f = fixture
    test_day = date(2026, 11, 20)

    # 1. Turno Mañana: opened at 09:00 AM Argentina time on test_day (12:00 UTC)
    dt_morning_utc = datetime.combine(test_day, time(12, 0, 0))

    # 2. Turno Noche: opened at 22:30 PM Argentina time on test_day (01:30 UTC of next calendar day)
    dt_night_utc = datetime.combine(test_day + timedelta(days=1), time(1, 30, 0))

    with SessionLocal() as db:
        user_id = db.scalar(select(User.id).limit(1))
        shift_m = CashShift(
            id=uid(),
            opened_by=user_id,
            opened_by_name="Lucía",
            opened_at=dt_morning_utc,
            closed_at=datetime.combine(test_day, time(18, 0, 0)),
            shift_type="T. Mañana",
            initial_cash=Decimal("10000.00"),
            counted_cash=Decimal("10000.00"),
            status="closed"
        )
        shift_n = CashShift(
            id=uid(),
            opened_by=user_id,
            opened_by_name="Milagros",
            opened_at=dt_night_utc,
            closed_at=None,
            shift_type="T. Noche",
            initial_cash=Decimal("20000.00"),
            status="open"
        )
        db.add_all([shift_m, shift_n])
        db.commit()

        try:
            # Both shifts must belong to test_day according to business_day(cutoff_hour=3)
            assert business_day(dt_morning_utc, cutoff_hour=3) == test_day
            assert business_day(dt_night_utc, cutoff_hour=3) == test_day

            # When aggregating test_day's summary, BOTH shifts must be present!
            day_sum = build_day_summary(db, test_day)
            assert day_sum["shiftsCount"] >= 2
            shift_ids = [s["shiftId"] for s in day_sum["shifts"]]
            assert shift_m.id in shift_ids
            assert shift_n.id in shift_ids

            # Next day (test_day + 1) must NOT contain these shifts
            next_day_sum = build_day_summary(db, test_day + timedelta(days=1))
            next_shift_ids = [s["shiftId"] for s in next_day_sum["shifts"]]
            assert shift_m.id not in next_shift_ids
            assert shift_n.id not in next_shift_ids
        finally:
            db.delete(shift_m)
            db.delete(shift_n)
            db.commit()
