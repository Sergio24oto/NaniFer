from pathlib import Path
from fastapi import APIRouter, Depends, Header
from decimal import Decimal
from pydantic import Field, field_validator
from sqlalchemy import select
from .models import Category, Product, Table, User
from .db import get_db
from .auth import current_session
from .schemas import StrictModel
from .services import fail, once, uid
router=APIRouter(prefix="/api")

def admin(auth=Depends(current_session)):
    if auth[0].role != 'admin': fail('Solo el administrador puede gestionar la carta.',403)
    return auth

def categories(db):
    return [dict(id=c.id,name=c.name,image=c.image,order=c.sort_order,visible=c.public_visible,note=c.note) for c in db.scalars(select(Category).order_by(Category.sort_order,Category.name))]

@router.get('/public/menu/{number}')
def menu(number:int,db=Depends(get_db)):
    if not 1 <= number <= 15 or not db.get(Table,number): fail('Este enlace de mesa no es válido. Consultá a la moza.',404)
    from .main import catalog
    data=catalog(db,None)
    cats=[c for c in categories(db) if c['visible']]
    visible={c['name'] for c in cats}
    data['categories']=[{k:v for k,v in c.items() if k!='visible'} for c in cats]
    data['products']=[p for p in data['products'] if p['category'] in visible or set(p['publicCategories']) & {c['id'] for c in cats}]
    for p in data['products']:
        if p['pricePending']:p['price']=None
    return dict(table=number,**data)

@router.get('/menu-management')
def management(db=Depends(get_db),auth=Depends(admin)):
    root=Path(__file__).resolve().parents[2]/'frontend/public/menu'
    return dict(categories=categories(db),products=[dict(id=p.id,name=p.name,image=p.image,description=p.description,categoryId=p.category_id,price=None if p.price_pending else str(p.price),available=p.available,archived=p.archived) for p in db.scalars(select(Product).order_by(Product.name))],images=['/menu/'+p.name for p in sorted(p for p in root.iterdir() if p.suffix.lower() in ('.webp','.jpg','.jpeg','.png'))])

class CategoryIn(StrictModel):
    name:str=Field(min_length=1,max_length=100)
    image:str|None=None
    order:int=Field(ge=0,le=9999)
    visible:bool
    note:str=Field(default="",max_length=500)
    @field_validator('name')
    @classmethod
    def name_valid(cls,v):
        if not v.strip(): raise ValueError('Ingresá un nombre.')
        return v.strip()
class PhotoIn(StrictModel):
    image:str|None=None

def image_path(value):
    if not value:return None
    import re
    if not re.fullmatch(r'/menu/[a-zA-Z0-9_-]+\.(webp|jpg|jpeg|png)',value):fail('Usá una foto local de /menu/, sin enlaces externos.',422)
    root=Path(__file__).resolve().parents[2]/'frontend/public'
    if not (root/value.lstrip('/')).is_file():fail('La foto no existe en frontend/public/menu.',422)
    return value

@router.put('/menu-management/categories/{id}')
def update_category(id:str,data:CategoryIn,db=Depends(get_db),auth=Depends(admin)):
    c=db.scalar(select(Category).where(Category.id==id).with_for_update())
    if not c:fail('Categoría inexistente.',404)
    if db.scalar(select(Category.id).where(Category.name==data.name,Category.id!=id)):fail('Ya existe una categoría con ese nombre.',409)
    c.name=data.name;c.image=image_path(data.image);c.sort_order=data.order;c.public_visible=data.visible;c.note=data.note
    db.commit();return {'saved':True}

@router.put('/menu-management/products/{id}/photo')
def update_photo(id:str,data:PhotoIn,db=Depends(get_db),auth=Depends(admin)):
    p=db.get(Product,id)
    if not p:fail('Producto inexistente.',404)
    p.image=image_path(data.image);db.commit();return {'saved':True}


class ProductIn(StrictModel):
    name:str=Field(min_length=1,max_length=150)
    description:str=Field(default='',max_length=500)
    categoryId:str
    price:Decimal|None=Field(default=None,ge=0,max_digits=12,decimal_places=2)
    image:str|None=None
    available:bool=True
    @field_validator('name')
    @classmethod
    def trimmed(cls,v):
        if not v.strip():raise ValueError('Ingresá el nombre del producto.')
        return v.strip()


def apply_product(db,p,data):
    if not db.get(Category,data.categoryId):fail('Elegí una categoría existente.',422)
    p.name=data.name;p.description=data.description.strip();p.category_id=data.categoryId
    p.price_pending=data.price is None;p.price=data.price if data.price is not None else Decimal(0)
    p.image=image_path(data.image);p.available=data.available

@router.post('/menu-management/products')
def create_product(data:ProductIn,key:str=Header(alias='Idempotency-Key'),db=Depends(get_db),auth=Depends(admin)):
    db.scalar(select(User).where(User.id==auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Product.id).where(Product.name==data.name,Product.category_id==data.categoryId,Product.archived==False)):fail('Ya existe este producto en la categoría. Editalo desde la lista.',409)
        p=Product(id=uid(),public_categories=[],sizes=[],extras=[],cone_links={})
        apply_product(db,p,data);db.add(p);db.flush();return {'id':p.id}
    result=once(db,key,'catalog-product:'+auth[0].id,data.model_dump(mode='json'),save)
    db.commit();return result

@router.put('/menu-management/products/{id}')
def update_product(id:str,data:ProductIn,db=Depends(get_db),auth=Depends(admin)):
    p=db.scalar(select(Product).where(Product.id==id).with_for_update())
    if not p:fail('Producto inexistente.',404)
    apply_product(db,p,data);db.commit();return {'id':id}

@router.delete('/menu-management/products/{id}')
def archive_product(id:str,db=Depends(get_db),auth=Depends(admin)):
    p=db.scalar(select(Product).where(Product.id==id).with_for_update())
    if not p:fail('Producto inexistente.',404)
    p.archived=True;db.commit();return {'id':id,'archived':True}

@router.post('/menu-management/products/{id}/restore')
def restore_product(id:str,db=Depends(get_db),auth=Depends(admin)):
    p=db.scalar(select(Product).where(Product.id==id).with_for_update())
    if not p:fail('Producto inexistente.',404)
    p.archived=False;db.commit();return {'id':id}

@router.post('/menu-management/categories')
def create_category(data:CategoryIn,key:str=Header(alias='Idempotency-Key'),db=Depends(get_db),auth=Depends(admin)):
    db.scalar(select(User).where(User.id==auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Category.id).where(Category.name==data.name)):fail('Ya existe una categoría con ese nombre.',409)
        c=Category(id=uid(),name=data.name,image=image_path(data.image),sort_order=data.order,public_visible=data.visible,note=data.note)
        db.add(c);db.flush();return {'id':c.id}
    result=once(db,key,'catalog-category:'+auth[0].id,data.model_dump(),save);db.commit();return result
