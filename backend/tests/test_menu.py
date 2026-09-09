from sqlalchemy import select,func
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Category,Product,Visit,Order,StockMovement,User,Table
from test_mysql import fixture,open_visit,order,HEADERS

def test_read_only_menu_and_internal_orders(fixture):
 f=fixture
 with SessionLocal() as db:
  number=db.scalar(select(Table.number).where(Table.number.between(1,15)))
  before=[db.scalar(select(func.count()).select_from(m)) for m in (Visit,Order,StockMovement)]
 c=TestClient(app,headers=HEADERS)
 for n in range(1,16):
  r=c.get('/api/public/menu/'+str(n));assert r.status_code==200;assert r.json()['table']==n
  assert set(r.json())=={'table','categories','products','flavors'}
 assert c.get('/api/public/menu/99999').status_code==404
 assert c.get('/api/catalog').status_code==401
 assert c.post('/api/public/mesa/'+str(number)+'/join').status_code==403
 assert c.post('/api/public/mesa/'+str(number)+'/orders',json={'expectedAccount':None,'items':[{'productId':f['product'],'quantity':1}]},headers={'Idempotency-Key':'menu-block-test'}).status_code==403
 assert c.get('/api/public/mesa/'+str(number)).json()=={'table':number}
 with SessionLocal() as db:assert before==[db.scalar(select(func.count()).select_from(m)) for m in (Visit,Order,StockMovement)]
 v=open_visit(f);assert order(f,v).status_code==200

def test_menu_category_visibility_and_permissions(fixture):
 f=fixture;c=f['client']
 assert c.get('/api/menu-management').status_code==403
 with SessionLocal() as db:
  db.get(User,f['user_id']).role='admin';pid=db.get(Product,f['product']).category_id;db.commit()
 data=c.get('/api/menu-management').json();cat=next(x for x in data['categories'] if x['id']==pid)
 body={k:cat[k] for k in ('name','image','order','visible')};body['visible']=False
 assert c.put('/api/menu-management/categories/'+pid,json=body).status_code==200
 public=c.get('/api/public/menu/1').json()
 assert not any(x['id']==pid for x in public['categories'])
 assert not any(x['id']==f['product'] for x in public['products'])
 assert any(x['id']==f['product'] for x in c.get('/api/catalog').json()['products'])
 body.update(visible=True,name=cat['name']+' editada',image='/menu/tortas.webp',order=9)
 assert c.put('/api/menu-management/categories/'+pid,json=body).status_code==200
 public=c.get('/api/public/menu/1').json();assert next(x for x in public['categories'] if x['id']==pid)['image']=='/menu/tortas.webp'
 assert c.put('/api/menu-management/products/'+f['product']+'/photo',json={'image':'https://external/image.jpg'}).status_code==422
 assert c.put('/api/menu-management/products/'+f['product']+'/photo',json={'image':'/menu/helados.webp'}).status_code==200
 assert next(x for x in c.get('/api/public/menu/1').json()['products'] if x['id']==f['product'])['image']=='/menu/helados.webp'


def test_pending_price_cannot_be_sold(fixture):
 f=fixture
 with SessionLocal() as db:
  p=db.get(Product,f['product']);p.price_pending=True;p.price=0;db.commit()
 c=f['client'];v=open_visit(f)
 assert order(f,v).status_code != 200
 data=c.get('/api/public/menu/1').json()
 p=next(p for p in data['products'] if p['id']==f['product'])
 assert p['price'] is None and p['pricePending']
 assert not next(p for p in c.get('/api/catalog').json()['products'] if p['id']==f['product'])['available']
