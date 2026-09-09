from decimal import Decimal
from sqlalchemy import select,delete
from app.db import SessionLocal
from app.models import User,Category,Product,OrderItem
from test_mysql import fixture,key,open_visit,order

def test_admin_product_crud_retry_price_and_history(fixture):
 f=fixture;c=f['client']
 with SessionLocal() as db:
  cat=db.get(Product,f['product']).category_id
 body=dict(name='Alta '+key(),description='Descripción de prueba',categoryId=cat,price=None,image=None,available=True)
 assert c.post('/api/menu-management/products',json=body,headers={'Idempotency-Key':key()}).status_code==403
 with SessionLocal() as db:db.get(User,f['user_id']).role='admin';db.commit()
 token=key();r=c.post('/api/menu-management/products',json=body,headers={'Idempotency-Key':token});assert r.status_code==200
 pid=r.json()['id'];f['product_ids'].append(pid)
 assert c.post('/api/menu-management/products',json=body,headers={'Idempotency-Key':token}).json()['id']==pid
 assert c.post('/api/menu-management/products',json=body,headers={'Idempotency-Key':key()}).status_code==409
 f['product']=pid;v=open_visit(f);assert order(f,v).status_code==422
 body['price']='2500.50';assert c.put('/api/menu-management/products/'+pid,json=body).status_code==200
 r=order(f,v);assert r.status_code==200
 body.update(name=body['name']+' editado',price='3200',description='Nueva descripción')
 assert c.put('/api/menu-management/products/'+pid,json=body).status_code==200
 with SessionLocal() as db:
  item=db.scalar(select(OrderItem).where(OrderItem.order_id==r.json()['id']))
  assert item.unit_price==Decimal('2500.50')
 assert c.delete('/api/menu-management/products/'+pid).status_code==200
 assert all(p['id']!=pid for p in c.get('/api/catalog').json()['products'])
 assert all(p['id']!=pid for p in c.get('/api/public/menu/1').json()['products'])
 assert order(f,v).status_code==422
 assert c.post('/api/menu-management/products/'+pid+'/restore').status_code==200
 assert any(p['id']==pid for p in c.get('/api/catalog').json()['products'])
 body['price']='-1';assert c.put('/api/menu-management/products/'+pid,json=body).status_code==422
 with SessionLocal() as db:db.get(User,f['user_id']).role='staff';db.commit()
 assert c.delete('/api/menu-management/products/'+pid).status_code==403
 assert c.put('/api/menu-management/products/'+pid,json={**body,'price':'100'}).status_code==403

def test_category_create_edit_note_and_duplicate(fixture):
 f=fixture;c=f['client']
 with SessionLocal() as db:db.get(User,f['user_id']).role='admin';db.commit()
 body=dict(name='Categoría '+key(),image=None,order=3,visible=True,note='Una nota')
 token=key();r=c.post('/api/menu-management/categories',json=body,headers={'Idempotency-Key':token});assert r.status_code==200
 cid=r.json()['id']
 try:
  assert c.post('/api/menu-management/categories',json=body,headers={'Idempotency-Key':token}).json()['id']==cid
  assert c.post('/api/menu-management/categories',json=body,headers={'Idempotency-Key':key()}).status_code==409
  body.update(visible=False,note='Otra nota')
  assert c.put('/api/menu-management/categories/'+cid,json=body).status_code==200
  assert all(x['id']!=cid for x in c.get('/api/public/menu/1').json()['categories'])
 finally:
  with SessionLocal() as db:db.execute(delete(Category).where(Category.id==cid));db.commit()
