from datetime import date, datetime, time, timedelta, UTC
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from fastapi import APIRouter, Depends, Header, Response
from pydantic import Field, field_validator
from sqlalchemy import select
from .models import StockItem, StockMovement, Supplier, Product, Flavor, Category, User
from .auth import current_session
from .db import get_db
from .schemas import StrictModel
from .services import fail, once, uid
from .business_day import ZONE, local_iso
from .stock_accounting import locked_products, lock_items, movement, catalog_availability, availability_reason
router=APIRouter(prefix='/api/stock',tags=['Stock'])


def admin(auth):
    if auth[0].role!='admin':fail('Solo el administrador puede modificar stock o ver costos.',403)


class SupplierIn(StrictModel):
    name:str=Field(min_length=1,max_length=150)
    contact:str=Field(default='',max_length=200)
    @field_validator('name')
    @classmethod
    def name_ok(cls,v):
        if not v.strip():raise ValueError('Ingresá el nombre.')
        return v.strip()


class ConfigIn(StrictModel):
    mode:Literal['manual','unit']
    unit:Literal['unidades','porciones']='unidades'
    coneLinks:dict[str,str]=Field(default_factory=dict,max_length=50)
    available:bool


class AvailabilityIn(StrictModel):
    available:bool

class FlavorIn(AvailabilityIn):
    name:str=Field(min_length=1,max_length=100)
    @field_validator('name')
    @classmethod
    def clean_name(cls,v):
        v=' '.join(v.split())
        if not v:raise ValueError('Ingresá el nombre del sabor.')
        return v

@router.post('/flavors')
def create_flavor(data:FlavorIn,key:str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    db.scalar(select(User).where(User.id==auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Flavor).where(Flavor.name==data.name)):fail('Ya existe ese sabor. Buscalo en Helados para gestionar su disponibilidad.',409)
        f=Flavor(id=uid(),name=data.name,available=data.available);db.add(f);db.flush()
        row=StockItem(id=uid(),flavor_id=f.id,kind='containers',name=f.name,unit='recipientes',quantity=None,opened=0,version=0)
        db.add(row);db.flush()
        return {'id':f.id,'stockId':row.id,'name':f.name}
    result=once(db,key,'flavor-create:'+auth[0].id,data.model_dump(),save);db.commit();return result


class StockAction(StrictModel):
    action:Literal['receive','count','out','open','finish','rename']
    quantity:int=Field(default=0,ge=0,le=1000000000,strict=True)
    bucket:Literal['closed','opened']='closed'
    expectedVersion:int=Field(ge=0)
    reason:str=Field(default='',max_length=450)
    outReason:Literal['rotura','vencimiento','regalo','personal','otro']='otro'
    supplierId:str|None=None
    unitCost:Decimal|None=Field(default=None,ge=0,max_digits=18,decimal_places=6)
    totalCost:Decimal|None=Field(default=None,ge=0,max_digits=18,decimal_places=2)
    name:str|None=Field(default=None,min_length=1,max_length=150)
    packageType:Literal['pack','cajón','caja','unidades']|None=None
    packages:int=Field(default=1,ge=1,le=1000000)
    unitsPerPackage:int=Field(default=1,ge=1,le=10000)
    receivedDate:date|None=None


def snapshot(db,search='',category='',mode='',area=''):
    products=list(db.scalars(select(Product).order_by(Product.name)))
    flavors=list(db.scalars(select(Flavor).order_by(Flavor.name)))
    stock=list(db.scalars(select(StockItem)))
    by_product={r.product_id:r for r in stock if r.product_id}
    by_flavor={r.flavor_id:r for r in stock if r.flavor_id}
    categories={c.id:c.name for c in db.scalars(select(Category))}
    areas={c.id:c.stock_area for c in db.scalars(select(Category))}
    index={r.id:r for r in stock}
    result=[]
    for p in products:
        r=by_product.get(p.id); available,_=catalog_availability(p,index)
        result.append(dict(id='product:'+p.id,stockId=r.id if r else None,productId=p.id,name=p.name,
            category=categories[p.category_id],stockArea=areas[p.category_id],unitsPerPackage=r.units_per_package if r else 1,coneEligible=bool(p.cone_links) or any(z.get("max",0)>0 for z in p.sizes),mode=p.stock_mode,unit=r.unit if r else 'sin conteo',
            quantity=r.quantity if r and p.stock_mode=='unit' else None,opened=None,version=r.version if r else 0,
            available=available,availabilityReason=availability_reason(p,index),manualAvailable=p.available,coneLinks=p.cone_links,sizes=[s['name'] for s in p.sizes]))
    for r in stock:
        if r.kind=='cone':result.append(dict(id=r.id,stockId=r.id,name=r.name,category='Cucuruchos',mode='unit',unit=r.unit,
            quantity=r.quantity,opened=None,version=r.version,available=(r.quantity or 0)>0,kind='cone'))
    for f in flavors:
        r=by_flavor.get(f.id)
        result.append(dict(id='flavor:'+f.id,stockId=r.id if r else None,flavorId=f.id,name=f.name,category='Sabores de helado',
            mode='containers',unit='recipientes',quantity=r.quantity if r else None,opened=r.opened if r else 0,
            version=r.version if r else 0,available=f.available,manualAvailable=f.available))
    return [r for r in result if (not search or search.casefold() in r['name'].casefold()) and (not category or r['category']==category) and (not mode or r['mode']==mode) and (not area or (area=='flavors' and r['mode']=='containers') or (area in ('beverages','kiosk') and r.get('stockArea')==area) or (area=='other' and r['mode']!='manual' and r.get('stockArea') not in ('beverages','kiosk')) or (area=='empty' and r['mode']!='manual' and r['quantity']==0) or (area=='manual' and r['mode']=='manual'))]


@router.get('')
def listing(search:str='',category:str='',mode:str='',area:str='',auth=Depends(current_session),db=Depends(get_db)):
    return {'items':snapshot(db,search,category,mode,area),'generatedAt':local_iso(datetime.now(UTC).replace(tzinfo=None))}


@router.get('/suppliers')
def suppliers(auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    return [dict(id=s.id,name=s.name,contact=s.contact) for s in db.scalars(select(Supplier).order_by(Supplier.name))]


@router.post('/suppliers')
def create_supplier(data:SupplierIn,key:str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    db.scalar(select(User).where(User.id==auth[0].id).with_for_update())
    def save():
        old=db.scalar(select(Supplier).where(Supplier.name==data.name))
        if old:fail('Ya existe un proveedor con ese nombre. Seleccionalo en la lista.',409)
        row=Supplier(id=uid(),name=data.name,contact=data.contact.strip(),created_by=auth[0].id)
        db.add(row);db.flush();return dict(id=row.id,name=row.name)
    result=once(db,key,'supplier:'+auth[0].id,data.model_dump(),save);db.commit();return result


@router.post('/products/{id}/configure')
def configure_product(id:str,data:ConfigIn,key:str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    product=locked_products(db,[id]).get(id)
    if not product:fail('Producto inexistente.',404)
    def save():
        sizes=[s['name'] for s in product.sizes] or ['']
        if any(size not in sizes for size in data.coneLinks):fail('Presentación inexistente.',422)
        for cone in data.coneLinks.values():
            r=db.get(StockItem,cone)
            if not r or r.kind!='cone':fail('Tipo de cucurucho inválido.',422)
        row=db.scalar(select(StockItem).where(StockItem.product_id==id).with_for_update())
        if data.mode=='unit' and not row:
            row=StockItem(id=uid(),product_id=id,kind='unit',name=product.name,unit=data.unit,quantity=None,opened=0,version=0)
            db.add(row);db.flush()
        if row:row.unit=data.unit
        product.stock_mode=data.mode;product.cone_links=data.coneLinks;product.available=data.available
        return {'id':id,'stockId':row.id if row else None}
    result=once(db,key,'stock-config:'+id,data.model_dump(),save);db.commit();return result


@router.post('/flavors/{id}/configure')
def configure_flavor(id:str,data:AvailabilityIn,key:str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    flavor=db.scalar(select(Flavor).where(Flavor.id==id).with_for_update())
    if not flavor:fail('Sabor inexistente.',404)
    def save():
        row=db.scalar(select(StockItem).where(StockItem.flavor_id==id))
        if not row:
            row=StockItem(id=uid(),flavor_id=id,kind='containers',name=flavor.name,unit='recipientes',quantity=None,opened=0,version=0)
            db.add(row);db.flush()
        flavor.available=data.available
        return {'id':id,'stockId':row.id}
    result=once(db,key,'stock-flavor:'+id,data.model_dump(),save);db.commit();return result


def action_plan(db,row,data):
    if row.version!=data.expectedVersion:fail('La existencia cambió. Volvé a consultar antes de confirmar.')
    q=row.quantity or 0;o=row.opened;cost=None;unit=None
    if data.action=='rename':
        if row.kind!='cone' or not data.name or not data.name.strip():fail('Ingresá un nombre para el cucurucho.',422)
        return q,o,None,None
    quantity=data.packages*data.unitsPerPackage if data.action=='receive' and data.packageType else data.quantity
    if data.packageType and data.action!='receive':fail('Los envases corresponden a una entrada.',422)
    if data.packageType=='unidades' and data.unitsPerPackage!=1:fail('Para unidades sueltas usá una unidad por envase.',422)
    if data.action in ('receive','out','open','finish') and quantity<=0:fail('La cantidad debe ser mayor que cero.',422)
    if data.action in ('out','count') and not data.reason.strip():fail('Ingresá el motivo del movimiento.',422)
    if data.bucket=='opened' and row.kind!='containers':fail('Este producto no tiene recipientes abiertos.',422)
    if data.action=='receive':
        if data.bucket!='closed':fail('La recepción de recipientes se registra como cerrados.',422)
        if not data.supplierId or not db.get(Supplier,data.supplierId):fail('Elegí un proveedor.',422)
        if row.unit=='porciones' or data.packageType:
            if data.totalCost is None:fail('Ingresá el costo total de las tortas recibidas.',422)
            cost=data.totalCost;unit=(cost/quantity).quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP)
        else:
            if data.unitCost is None:fail('Ingresá el costo unitario de compra.',422)
            unit=data.unitCost;cost=(unit*data.quantity).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        if cost>Decimal('999999999999.99') or unit>Decimal('999999999999.999999'):fail('Costo fuera de rango.',422)
        q+=quantity
    elif data.action=='count':
        if data.bucket=='opened':o=data.quantity
        else:q=data.quantity
    elif data.action=='out':
        if data.bucket=='opened':o-=data.quantity
        else:q-=data.quantity
    elif data.action=='open':
        if row.kind!='containers':fail('Solo se abren recipientes de helado.',422)
        q-=data.quantity;o+=data.quantity
    elif data.action=='finish':
        if row.kind!='containers':fail('Solo se terminan recipientes de helado.',422)
        o-=data.quantity
    if q<0 or o<0 or q>1000000000 or o>1000000000:fail('La cantidad supera la existencia disponible o el límite admitido.',409)
    return q,o,unit,cost


@router.post('/items/{id}/preview')
def preview_action(id:str,data:StockAction,auth=Depends(current_session),db=Depends(get_db)):
    admin(auth);row=lock_items(db,[id])[id];q,o,unit,cost=action_plan(db,row,data)
    return dict(before=row.quantity,after=q,openedBefore=row.opened,openedAfter=o,difference=q-(row.quantity or 0),openedDifference=o-row.opened,
                unitCost=str(unit) if unit is not None else None,totalCost=str(cost) if cost is not None else None)


@router.post('/items/{id}/movements')
def save_action(id:str,data:StockAction,key:str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth);row=lock_items(db,[id])[id]
    def save():
        q,o,unit,cost=action_plan(db,row,data)
        note=data.reason.strip()
        if data.action=='rename':
            row.name=data.name.strip();row.version+=1
            db.flush()
            return {'id':row.id,'quantity':row.quantity,'opened':row.opened,'version':row.version}
        elif data.action=='out':note=data.outReason+': '+note
        m=movement(db,row,q,o,data.action,auth[0].id,note,supplier_id=data.supplierId if data.action=='receive' else None,unit_cost=unit,total_cost=cost)
        if data.action=='receive' and data.packageType:
            row.units_per_package=data.unitsPerPackage
            m.purchase=dict(type=data.packageType,packages=data.packages,unitsPerPackage=data.unitsPerPackage,units=data.packages*data.unitsPerPackage,date=(data.receivedDate or datetime.now(ZONE).date()).isoformat())
        return {'id':m.id,'quantity':q,'opened':o,'version':row.version}
    result=once(db,key,'stock-move:'+id,data.model_dump(mode='json'),save);db.commit();return result


@router.get('/items/{id}/history')
def history(id:str,start:date,end:date,auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    if start>end or (end-start).days>365 or start.year<1970 or end.year>9998:fail('Elegí un rango de hasta 366 días, en orden.',422)
    lower=datetime.combine(start,time(),ZONE).astimezone(UTC).replace(tzinfo=None)
    upper=datetime.combine(end+timedelta(days=1),time(),ZONE).astimezone(UTC).replace(tzinfo=None)
    rows=db.execute(select(StockMovement,User.name,Supplier.name).outerjoin(User,User.id==StockMovement.user_id).outerjoin(Supplier,Supplier.id==StockMovement.supplier_id)
        .where(StockMovement.stock_id==id,StockMovement.created_at>=lower,StockMovement.created_at<upper).order_by(StockMovement.created_at.desc(),StockMovement.version.desc())).all()
    return [dict(id=m.id,version=m.version,kind=m.kind,before=m.before,after=m.after,openedBefore=m.opened_before,openedAfter=m.opened_after,
        note=m.note,purchase=m.purchase,user=user or 'Pedido QR',supplier=supplier,unitCost=str(m.unit_cost) if m.unit_cost is not None else None,
        totalCost=str(m.total_cost) if m.total_cost is not None else None,createdAt=local_iso(m.created_at),orderItemId=m.order_item_id,correctionId=m.correction_id) for m,user,supplier in rows]


@router.get('/export.pdf')
def export(search:str='',category:str='',mode:str='',area:str='',auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    from .stock_pdf import build_pdf
    data=snapshot(db,search,category,mode,area)
    return Response(build_pdf(data,dict(search=search,category=category,mode=mode,area=area)),media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="NaniFer-existencias.pdf"'})
