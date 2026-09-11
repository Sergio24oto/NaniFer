"""Device-scoped QR orders and cart-free calls. No public account access."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from pydantic import Field
from .auth import digest, current_session
from .db import get_db
from .models import Order, OrderItem, Visit, AttentionCall, Operation, now
from .schemas import StrictModel, ItemIn, OrderIn
from .services import lock_table, lock_visit, make_order, once, uid, fail, iso

router=APIRouter(prefix='/api')

def device(x_public_device:str=Header(min_length=32,max_length=128)):
 return digest(x_public_device)

class Basket(StrictModel):
 items:list[ItemIn]=Field(min_length=1,max_length=50)

class EmptyCall(StrictModel):
 pass

def order_json(db,o):
 lines=list(db.scalars(select(OrderItem).where(OrderItem.order_id==o.id)))
 return dict(id=o.id,number=o.number,table=db.get(Visit,o.visit_id).table_number,status=o.status,createdAt=iso(o.created_at),items=[{k:v for k,v in i.snapshot.items() if k in {'productId','name','size','quantity','flavors','extras','notes'}}|{'unitPrice':float(i.unit_price)} for i in lines],total=float(sum(i.quantity*i.unit_price for i in lines)))

@router.post('/public/qr/{number}/orders')
def send(number:int,data:Basket,key:str=Header(alias='Idempotency-Key'),who=Depends(device),db=Depends(get_db)):
 lock_table(db,number)
 def save():
  from .menu_catalog import menu
  visible={p['id'] for p in menu(number,db)['products']}
  if any(i.productId not in visible for i in data.items):fail('Producto fuera de la carta pública.',422)
  from .main import open_table
  v=open_table(db,number);lock_visit(db,v.id)
  result=make_order(db,v,OrderIn(expectedAccount=v.id,items=data.items),origin='qr')
  o=db.get(Order,result['id']);o.device_hash=who;db.flush()
  return order_json(db,o)
 result=once(db,key,'qr:'+who+':'+str(number),data.model_dump(),save);db.commit();return result

@router.get('/public/qr/{number}/orders')
def own_orders(number:int,who=Depends(device),db=Depends(get_db)):
 from .menu_catalog import menu
 menu(number,db)
 return [order_json(db,o) for o in db.scalars(select(Order).join(Visit).where(Visit.table_number==number,Order.device_hash==who).order_by(Order.created_at.desc()).limit(50))]

@router.get('/public/qr/{number}/operations/{key}')
def operation(number:int,key:str,who=Depends(device),db=Depends(get_db)):
 o=db.get(Operation,key)
 if not o or o.scope not in ('qr:'+who+':'+str(number),'call:'+who+':'+str(number)):return {'confirmed':False}
 return {'confirmed':True,'result':o.response}

def call_json(c):
 return dict(id=c.id,table=c.table_number,createdAt=iso(c.created_at),status='pending' if c.pending_table else 'attended')

@router.post('/public/qr/{number}/call')
def call(number:int,data:EmptyCall,key:str=Header(alias='Idempotency-Key'),who=Depends(device),db=Depends(get_db)):
 lock_table(db,number)
 def save():
  from .menu_catalog import menu
  menu(number,db)
  c=db.scalar(select(AttentionCall).where(AttentionCall.pending_table==number))
  if not c:
   c=AttentionCall(id=uid(),table_number=number,pending_table=number);db.add(c);db.flush()
  return call_json(c)
 result=once(db,key,'call:'+who+':'+str(number),{},save);db.commit();return result

def pending_calls(db):
 return [call_json(c) for c in db.scalars(select(AttentionCall).where(AttentionCall.pending_table!=None))]

@router.post('/calls/{id}/attend')
def attend(id:str,auth=Depends(current_session),db=Depends(get_db)):
 c=db.scalar(select(AttentionCall).where(AttentionCall.id==id).with_for_update())
 if not c:fail('Llamado inexistente.',404)
 if c.pending_table:
  c.pending_table=None;c.attended_at=now();c.attended_by=auth[0].id
 db.commit();return call_json(c)
