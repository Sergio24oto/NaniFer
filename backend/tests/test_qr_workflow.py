from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import select,delete,func
from app.main import app
from app.db import SessionLocal
from app.models import Order,OrderItem,Visit,AttentionCall,Operation,Product,StockMovement,StockItem,User
from test_mysql import fixture,key,HEADERS,account,pay
from test_stock import configured,qty,supplier
import pytest

@pytest.fixture
def qr(fixture,monkeypatch):
 f=fixture
 # Only the fixture table (outside the 15 real tables) is admitted for these tests.
 import app.menu_catalog as menus
 original=menus.menu
 def menu(n,db):
  if n==f['table']:
   from app.main import catalog
   return catalog(db,None)
  return original(n,db)
 monkeypatch.setattr(menus,'menu',menu)
 yield f
 with SessionLocal() as db:
  db.execute(delete(AttentionCall).where(AttentionCall.table_number==f['table']))
  db.execute(delete(Operation).where((Operation.scope.like('qr:%:'+str(f['table'])))|(Operation.scope.like('call:%:'+str(f['table'])))))
  db.commit()

def client():return TestClient(app,headers={**HEADERS,'X-Public-Device':key()+key()})
def send(c,f,token=None,items=None):return c.post(f"/api/public/qr/{f['table']}/orders",json={'items':items or [{'productId':f['product'],'quantity':1}]},headers={'Idempotency-Key':token or key()})

def test_two_devices_one_visit_private_orders_and_retries(qr):
 f=qr;sid=configured(f,initial=3);a=client();b=client();token=key()
 with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda pair:send(pair[0],f,pair[1]),[(a,token),(b,key())]))
 assert all(r.status_code==200 for r in results),[r.text for r in results]
 assert qty(sid)==1
 assert send(a,f,token).json()==results[0].json();assert qty(sid)==1
 for c in (a,b):assert len(c.get(f"/api/public/qr/{f['table']}/orders").json())==1
 assert a.get(f"/api/public/qr/{f['table']}/operations/{token}").json()['confirmed']
 assert not b.get(f"/api/public/qr/{f['table']}/operations/{token}").json()['confirmed']
 with SessionLocal() as db:
  visits=list(db.scalars(select(Visit).where(Visit.active_table==f['table'])));assert len(visits)==1;v=visits[0].id
 assert account(f,v)['balance']==2000
 assert pay(f,v,2000).status_code==200
 assert f['client'].post('/api/visits/'+v+'/close').status_code==409
 for r in results:
  oid=r.json()['id']
  for state in ['pendiente','en preparación']:
   assert f['client'].post('/api/orders/'+oid+'/advance',json={'expectedStatus':state}).status_code==200
 assert f['client'].post('/api/visits/'+v+'/close').status_code==200
 assert qty(sid)==1

def test_call_has_no_cart_no_visit_and_persists_until_attended(qr):
 f=qr;a=client();b=client();url=f"/api/public/qr/{f['table']}/call"
 assert a.post(url,json={'items':[{'productId':f['product'],'quantity':1}]},headers={'Idempotency-Key':key()}).status_code==422
 token_a=key();token_b=key()
 with ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda pair:pair[0].post(url,json={},headers={'Idempotency-Key':pair[1]}),[(a,token_a),(b,token_b)]))
 assert all(r.status_code==200 for r in rs)
 assert rs[0].json()['id']==rs[1].json()['id'];assert set(rs[0].json())=={'id','table','createdAt','status'}
 assert a.get(f"/api/public/qr/{f['table']}/operations/{token_a}").json()['confirmed']
 assert b.get(f"/api/public/qr/{f['table']}/operations/{token_b}").json()['confirmed']
 assert not a.get(f"/api/public/qr/{f['table']}/operations/{key()}").json()['confirmed']
 with SessionLocal() as db:assert db.scalar(select(Visit).where(Visit.active_table==f['table'])) is None
 assert any(c['table']==f['table'] for c in f['client'].get('/api/state').json()['calls'])
 cid=rs[0].json()['id'];assert f['client'].post('/api/calls/'+cid+'/attend',json={}).status_code==200
 with SessionLocal() as db:
  c=db.get(AttentionCall,cid);assert c.attended_by==f['user_id'] and c.attended_at and c.pending_table is None

def test_pack_receipt_presentations_and_stock_disabled(qr):
 f=qr;sid=configured(f,initial=0);sp=supplier(f)
 body={'action':'receive','expectedVersion':1,'packageType':'pack','packages':3,'unitsPerPackage':6,'totalCost':'18000','supplierId':sp}
 with SessionLocal() as db:body['expectedVersion']=db.get(StockItem,sid).version
 r=f['client'].post('/api/stock/items/'+sid+'/movements',json=body,headers={'Idempotency-Key':key()});assert r.status_code==200,r.text
 assert qty(sid)==18
 with SessionLocal() as db:
  p=db.get(Product,f['product']);p.sizes=[{'name':'Docena','salePrice':9000,'stockUnits':12,'enabled':True}];db.commit()
 a=client();items=[{'productId':f['product'],'size':'Docena','quantity':1}]
 r=send(a,f,items=items);assert r.status_code==200,r.text
 assert r.json()['total']==9000 and qty(sid)==6
 assert send(a,f,items=items).status_code==409;assert qty(sid)==6
 with SessionLocal() as db:
  p=db.get(Product,f['product']);p.stock_mode='manual';p.sizes=[{'name':'Docena','salePrice':9500,'stockUnits':12,'enabled':True}];db.commit()
 assert send(a,f,items=items).json()['total']==9500;assert qty(sid)==6
 own=a.get(f"/api/public/qr/{f['table']}/orders").json();assert sorted(o['total'] for o in own)==[9000,9500]

def test_product_flavor_options_validation(qr):
 f=qr;a=client()
 with SessionLocal() as db:
  p=db.get(Product,f['product'])
  p.flavor_options=['Naranja','Durazno','Multifruta']
  db.commit()
 try:
  # Missing flavor -> 422
  r=send(a,f,items=[{'productId':f['product'],'quantity':1}])
  assert r.status_code==422, r.text
  # Invalid flavor -> 422
  r=send(a,f,items=[{'productId':f['product'],'quantity':1,'flavors':['Frutilla']}])
  assert r.status_code==422, r.text
  # Multiple flavors -> 422
  r=send(a,f,items=[{'productId':f['product'],'quantity':1,'flavors':['Naranja','Durazno']}])
  assert r.status_code==422, r.text
  # Valid flavor -> 200
  r=send(a,f,items=[{'productId':f['product'],'quantity':1,'flavors':['Naranja']}])
  assert r.status_code==200, r.text
  data=r.json()
  assert data['items'][0]['flavors']==['Naranja']
 finally:
  with SessionLocal() as db:
   p=db.get(Product,f['product'])
   p.flavor_options=[]
   db.commit()
