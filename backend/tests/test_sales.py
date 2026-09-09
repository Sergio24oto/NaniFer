from datetime import datetime, date, timedelta
from decimal import Decimal
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select, func
from app.business_day import business_day, period
from app.models import Sale, SaleCorrection, SaleAllocation
from app.sales_pdf import money
from test_mysql import fixture, open_visit, order, pay, account, deliver, key, SessionLocal, User, Payment, Product, OrderItem, app, HEADERS
import pytest


def promote(f):
    with SessionLocal() as db:
        db.get(User,f['user_id']).role='admin';db.commit()


def historical_payment(f,when):
    v=open_visit(f);r=order(f,v);assert r.status_code==200
    receipt=pay(f,v,1000);assert receipt.status_code==200
    id=receipt.json()['id']
    with SessionLocal() as db:
        db.get(Payment,id).created_at=when;db.commit()
    return id,v


@pytest.mark.parametrize('clock,expected',[('00:45','2026-09-05'),('03:59','2026-09-05'),('04:00','2026-09-06')])
def test_business_boundary(clock,expected):
    assert str(business_day(datetime.fromisoformat('2026-09-06T'+clock+':00-03:00')))==expected


def test_range_limits():
    assert period(date(2026,1,1),date(2026,1,31),'admin')[:2]==(date(2026,1,1),date(2026,1,31))
    for a,b in [(date(2026,1,1),date(2026,2,1)),(date(2026,1,2),date(2026,1,1)),(date(2026,1,1),None)]:
        with pytest.raises(Exception) as e:period(a,b,'admin')
        assert e.value.status_code==422


def test_server_permissions_and_empty(fixture):
    f=fixture;c=f['client']
    assert TestClient(app).get('/api/sales').status_code==401
    assert c.get('/api/sales').status_code==200
    assert c.get('/api/sales?start=2001-01-01&end=2001-01-01').status_code==403
    assert c.get('/api/sales/export.pdf').status_code==403
    id,v=historical_payment(f,datetime(2001,1,1,12))
    assert c.get('/api/sales/'+id).status_code==403
    assert c.post('/api/sales/'+id+'/preview',json={'expectedVersion':0,'reason':'Prueba','items':[{'id':'x','productId':f['product'],'quantity':1,'unitPrice':'1000'}]}).status_code==403
    assert c.post('/api/sales/'+id+'/corrections',json={'expectedVersion':0,'reason':'Prueba','items':[{'id':'x','productId':f['product'],'quantity':1,'unitPrice':'1000'}]},headers={'Idempotency-Key':key()}).status_code==403
    promote(f)
    assert c.get('/api/sales?start=2001-01-01&end=2001-01-31').status_code==200
    for q in ['start=2001-01-01&end=2001-02-01','start=2001-01-02&end=2001-01-01','start=bad','start=2001-01-01']:
        assert c.get('/api/sales?'+q).status_code==422
        assert c.get('/api/sales/export.pdf?'+q).status_code==422
    data=c.get('/api/sales?start=1975-01-01&end=1975-01-01').json()
    assert data['count']==0 and Decimal(data['total'])==0 and data['sales']==[] and len(data['days'])==1
    pdf=c.get('/api/sales/export.pdf?start=1975-01-01&end=1975-01-01')
    assert pdf.status_code==200
    assert 'No hay ventas cobradas' in PdfReader(BytesIO(pdf.content)).pages[0].extract_text()


def test_multiple_payments_corrections_and_no_financial_changes(fixture):
    f=fixture;promote(f);c=f['client'];v=open_visit(f)
    order(f,v); first=pay(f,v,1000).json()['id']
    order(f,v); second=pay(f,v,1000).json()['id']
    order(f,v) # Unpaid third order must not be part of sales.
    before=c.get('/api/sales/'+first).json();other=c.get('/api/sales/'+second).json()
    assert len(before['items'])==1 and len(other['items'])==1
    assert before['items'][0]['id']!=other['items'][0]['id']
    body={'expectedVersion':0,'reason':'Cantidad y precio registrados mal','items':[{'id':before['items'][0]['id'],'productId':f['product'],'quantity':2,'unitPrice':'1200.50'}]}
    preview=c.post('/api/sales/'+first+'/preview',json=body).json()
    assert Decimal(preview['before']['total'])==1000 and Decimal(preview['after']['total'])==2401
    with SessionLocal() as db:assert db.get(Sale,first).version==0
    token=key()
    def send(_):
        with TestClient(app,headers=dict(c.headers),cookies=c.cookies) as client:
            return client.post('/api/sales/'+first+'/corrections',json=body,headers={'Idempotency-Key':token})
    with ThreadPoolExecutor(max_workers=3) as pool:responses=list(pool.map(send,range(3)))
    assert [r.status_code for r in responses]==[200,200,200]
    assert c.post('/api/sales/'+first+'/corrections',json=body,headers={'Idempotency-Key':key()}).status_code==409
    body2={**body,'expectedVersion':1,'reason':'Segundo ajuste','items':[{**body['items'][0],'quantity':1,'unitPrice':'800.00'}]}
    assert c.post('/api/sales/'+first+'/corrections',json=body2,headers={'Idempotency-Key':key()}).status_code==200
    final=c.get('/api/sales/'+first).json()
    assert final['version']==2 and len(final['corrections'])==2
    assert Decimal(final['total'])==800 and Decimal(final['paid'])==1000 and Decimal(final['difference'])==-200
    assert final['originalItems']==before['originalItems']
    with SessionLocal() as db:
        assert db.get(Product,f['product']).price==1000
        assert db.get(Payment,first).amount==1000
        assert db.get(OrderItem,before['items'][0]['id']).unit_price==1000
        assert db.scalar(select(func.count()).select_from(SaleCorrection).where(SaleCorrection.sale_id==first))==2
    assert account(f,v)['balance']==1000
    third=pay(f,v,1000).json()['id']
    assert c.get('/api/sales/'+third).json()['items'][0]['id'] not in {before['items'][0]['id'],other['items'][0]['id']}


def test_report_pdf_boundary_and_totals(fixture):
    f=fixture;promote(f);c=f['client']
    # UTC 03:45,06:59,07:00 are local 00:45,03:59,04:00.
    ids=[]
    for t in [datetime(2002,9,8,3,45),datetime(2002,9,8,6,59),datetime(2002,9,8,7,0)]:
        id,v=historical_payment(f,t);ids.append(id)
    detail=c.get('/api/sales/'+ids[0]).json()
    body={'expectedVersion':0,'reason':'Ajuste para verificar la jornada original','items':[{'id':detail['items'][0]['id'],'productId':f['product'],'quantity':1,'unitPrice':'750.00'}]}
    assert c.post('/api/sales/'+ids[0]+'/corrections',json=body,headers={'Idempotency-Key':key()}).status_code==200
    query='?start=2002-09-07&end=2002-09-08'
    data=c.get('/api/sales'+query).json()
    assert data['count']==3 and Decimal(data['total'])==2750 and Decimal(data['paid'])==3000
    assert [(d['count'],Decimal(d['total'])) for d in data['days']]==[(2,Decimal(1750)),(1,Decimal(1000))]
    assert sum(Decimal(s['total']) for s in data['sales'])==Decimal(data['total'])
    pdf=c.get('/api/sales/export.pdf'+query)
    assert pdf.status_code==200 and pdf.content.startswith(b'%PDF')
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
    assert money(data['total']) in text and money(data['paid']) in text
    assert 'Ajuste para verificar' in text and '04:00' in text and 'Página 1' in text
    for sale in data['sales']:
        assert ('Venta #'+str(sale['number'])) in text
        assert sale['number']==c.get('/api/sales/'+sale['id']).json()['number']


def test_product_correction_and_validation(fixture):
    f=fixture;promote(f);c=f['client'];v=open_visit(f);order(f,v);id=pay(f,v,1000).json()['id']
    original=c.get('/api/sales/'+id).json()
    with SessionLocal() as db:
        product_id=key();price=Decimal('750')
        alternative=Product(id=product_id,name='Alternativa de prueba',category_id=db.get(Product,f['product']).category_id,price=price,available=True)
        db.add(alternative);db.commit();f['product_ids'].append(product_id)
    body={'expectedVersion':0,'reason':'Producto incorrecto','items':[{'id':original['items'][0]['id'],'productId':product_id,'quantity':1,'unitPrice':'100.00'}]}
    for bad in [{**body,'reason':'   '},{**body,'items':[{**body['items'][0],'quantity':-1}]},{**body,'items':[{**body['items'][0],'unitPrice':'NaN'}]}]:
        assert c.post('/api/sales/'+id+'/preview',json=bad).status_code==422
    assert c.post('/api/sales/'+id+'/corrections',json=body,headers={'Idempotency-Key':key()}).status_code==200
    corrected=c.get('/api/sales/'+id).json()
    assert corrected['items'][0]['productId']==product_id
    assert corrected['originalItems'][0]['productId']==f['product']
    with SessionLocal() as db:assert db.get(Product,product_id).price==price


def test_export_includes_more_than_one_ui_page(fixture):
    f=fixture;promote(f);c=f['client'];ids=[]
    for n in range(23):
        id,v=historical_payment(f,datetime(2003,1,15,12,0,n));ids.append(id)
    query='?start=2003-01-01&end=2003-01-31'
    data=c.get('/api/sales'+query).json()
    assert data['count']==23 and Decimal(data['total'])==23000 and len(data['days'])==31
    pdf=c.get('/api/sales/export.pdf'+query);assert pdf.status_code==200
    reader=PdfReader(BytesIO(pdf.content));assert len(reader.pages)>=3
    text=''.join(p.extract_text() for p in reader.pages)
    compact=text.replace('-','').replace(' ','').replace('\n','')
    for sale in data['sales']:assert ('Venta#'+str(sale['number'])) in compact
    for n,page in enumerate(reader.pages,1):
        assert 'NaniFer' in page.extract_text() and f'Página {n}' in page.extract_text()
    assert money(data['total']) in text


def test_competing_corrections_and_noop(fixture):
    f=fixture;promote(f);c=f['client'];v=open_visit(f);order(f,v);id=pay(f,v,1000).json()['id']
    sale=c.get('/api/sales/'+id).json()
    body={'expectedVersion':0,'reason':'Corrección concurrente','items':[{'id':sale['items'][0]['id'],'productId':f['product'],'quantity':1,'unitPrice':'1000'}]}
    assert c.post('/api/sales/'+id+'/preview',json=body).status_code==422
    def send(price):
        with TestClient(app,headers=dict(c.headers),cookies=c.cookies) as client:
            return client.post('/api/sales/'+id+'/corrections',json={**body,'items':[{**body['items'][0],'unitPrice':price}]},headers={'Idempotency-Key':key()})
    with ThreadPoolExecutor(max_workers=2) as pool:responses=list(pool.map(send,['900.00','1100.00']))
    assert sorted(r.status_code for r in responses)==[200,409]
    assert c.get('/api/sales/'+id).json()['version']==1


@pytest.mark.parametrize('moment,expected_day',[
    ('2005-06-14T23:59:00-03:00','2005-06-14'),
    ('2005-06-15T00:00:00-03:00','2005-06-14'),
    ('2005-06-15T03:59:59-03:00','2005-06-14'),
    ('2005-06-15T04:00:00-03:00','2005-06-15'),
])
def test_quick_filters_at_midnight_and_cutoff(fixture,monkeypatch,moment,expected_day):
    import importlib
    module=importlib.import_module('app.business_day')
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls,tz=None):
            return datetime.fromisoformat(moment).astimezone(tz)
    monkeypatch.setattr(module,'datetime',FrozenDatetime)
    f=fixture;c=f['client']
    assert c.get('/api/sales?last=7').status_code==403
    assert c.get('/api/sales?last=31').status_code==403
    assert c.get('/api/sales?last=1').status_code==200
    assert c.get('/api/sales/export.pdf?last=1').status_code==403
    promote(f)
    for last in [1,7,31]:
        response=c.get('/api/sales?last='+str(last));assert response.status_code==200
        data=response.json();assert data['end']==expected_day
        assert data['start']==str(date.fromisoformat(expected_day)-timedelta(days=last-1))
        assert len(data['days'])==last and data['today']==expected_day
        pdf=c.get('/api/sales/export.pdf?last='+str(last));assert pdf.status_code==200
        text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
        assert data['periodTitle'] in text and money(data['total']) in text
    for query in ['last=32','last=0','last=7&start=2005-01-01&end=2005-01-01']:
        assert c.get('/api/sales?'+query).status_code==422


def test_corrections_that_cancel_still_visible(fixture):
    f=fixture;promote(f);c=f['client']
    for price in ['1100.00','900.00']:
        id,_=historical_payment(f,datetime(2006,1,15,12))
        sale=c.get('/api/sales/'+id).json()
        body={'expectedVersion':0,'reason':'Diferencias que se compensan','items':[{'id':sale['items'][0]['id'],'productId':f['product'],'quantity':1,'unitPrice':price}]}
        assert c.post('/api/sales/'+id+'/corrections',json=body,headers={'Idempotency-Key':key()}).status_code==200
        assert c.get('/api/sales/'+id).json()['number']==sale['number']
    query='?start=2006-01-15&end=2006-01-15'
    data=c.get('/api/sales'+query).json()
    assert data['correctedCount']==2 and Decimal(data['difference'])==0
    assert Decimal(data['total'])==Decimal(data['paid'])==2000
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(c.get('/api/sales/export.pdf'+query).content)).pages)
    assert 'Sin correcciones' not in text
    assert 'Diferencia por correcciones' in text and 'El total incluye correcciones' in text
    assert 'Diferencias que se compensan' in text


def test_sale_numbers_are_unique_under_concurrent_payments(fixture):
    f=fixture;c=f['client'];visits=[]
    # Each visit has its own table slot freed only for this isolated test setup.
    from app.models import Visit
    for _ in range(4):
        v=open_visit(f);order(f,v);visits.append(v)
        with SessionLocal() as db:
            db.get(Visit,v).active_table=None;db.commit()
    def send(v):
        with TestClient(app,headers=dict(c.headers),cookies=c.cookies) as client:
            return client.post('/api/visits/'+v+'/payments',json={'method':'tarjeta','expectedBalance':1000},headers={'Idempotency-Key':key()})
    with ThreadPoolExecutor(max_workers=4) as pool:responses=list(pool.map(send,visits))
    assert all(r.status_code==200 for r in responses)
    ids=[r.json()['id'] for r in responses]
    first=[c.get('/api/sales/'+id).json()['number'] for id in ids]
    assert len(set(first))==4 and all(isinstance(n,int) and n>0 for n in first)
    repeated=[c.get('/api/sales/'+id).json()['number'] for id in reversed(ids)]
    assert repeated==list(reversed(first))
    all_sales=c.get('/api/sales').json()['sales']
    assert {s['id']:s['number'] for s in all_sales if s['id'] in ids}==dict(zip(ids,first))
