from sqlalchemy import select
from app.db import SessionLocal
from app.models import Product,User,Order,StockItem
from test_mysql import fixture,key,account,pay
from test_stock import configured,qty,move


def test_manual_icecream_without_flavors_table_and_counter(fixture):
 from app.models import OrderItem
 from app.schemas import ItemIn
 from app.services import priced_item
 from fastapi import HTTPException
 import pytest
 f=fixture;c=f['client']
 with SessionLocal() as db:
  p=db.get(Product,f['product']);p.sizes=[{'name':'Dos bochas','price':500,'max':2}];db.commit()
 item={'productId':f['product'],'quantity':2,'size':'Dos bochas','flavors':[]}
 body={'expectedAccount':None,'items':[item]};token=key()
 r=c.post(f"/api/tables/{f['table']}/consumptions",json=body,headers={'Idempotency-Key':token})
 assert r.status_code==200,r.text
 assert c.post(f"/api/tables/{f['table']}/consumptions",json=body,headers={'Idempotency-Key':token}).json()==r.json()
 assert account(f,r.json()['accountId'])['balance']==3000
 with SessionLocal() as db:
  line=db.scalar(select(OrderItem).where(OrderItem.order_id==r.json()['id']))
  assert line.snapshot['flavors']==[] and line.unit_price==1500
  with pytest.raises(HTTPException):priced_item(db,ItemIn(**item))
 assert c.post('/api/counter/quote',json={'items':[item]}).json()['total']=='3000.00'
 result=c.post('/api/counter/checkout',json={'items':[item],'method':'efectivo','expectedBalance':3000},headers={'Idempotency-Key':key()})
 assert result.status_code==200,result.text

def test_delivered_manual_stock_payment_and_explicit_close(fixture):
 f=fixture;sid=configured(f,initial=5);c=f['client']
 with SessionLocal() as db:db.get(User,f['user_id']).role='staff';db.commit()
 body={'expectedAccount':None,'items':[{'productId':f['product'],'quantity':2}]};token=key()
 r=c.post(f"/api/tables/{f['table']}/consumptions",json=body,headers={'Idempotency-Key':token});assert r.status_code==200
 assert c.post(f"/api/tables/{f['table']}/consumptions",json=body,headers={'Idempotency-Key':token}).json()==r.json()
 v=r.json()['accountId']
 with SessionLocal() as db:
  o=db.get(Order,r.json()['id']);assert o.status=='entregado' and o.origin=='manual'
 assert qty(sid)==3
 assert pay(f,v,2000).status_code==200
 assert not account(f,v)['closedAt']
 assert c.post('/api/visits/'+v+'/close').status_code==200
 assert qty(sid)==3

def test_availability_reasons_are_distinct(fixture):
 f=fixture;c=f['client']
 def reason():return next(p for p in c.get('/api/catalog').json()['products'] if p['id']==f['product'])['availabilityReason']
 assert reason()=='Disponible'
 with SessionLocal() as db:db.get(Product,f['product']).price_pending=True;db.commit()
 assert reason()=='Sin precio'
 with SessionLocal() as db:db.get(Product,f['product']).price_pending=False;db.commit()
 sid=configured(f,initial=None);assert reason()=='Sin carga inicial de stock'
 move(f,sid,'count',0,reason='Prueba');assert reason()=='Sin stock'
 move(f,sid,'count',3,reason='Prueba');assert reason()=='Disponible'
 with SessionLocal() as db:db.get(Product,f['product']).available=False;db.commit()
 assert reason()=='Venta deshabilitada'
