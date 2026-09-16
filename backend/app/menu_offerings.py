"""Carga explícita e idempotente de la carta solicitada; nunca inventa precios."""
from decimal import Decimal
from sqlalchemy import select
from .db import SessionLocal
from .models import Category,Product

def apply():
 with SessionLocal() as db:
  cats={}
  for key,name,image,order in [('comidas','Comidas','pizza',1),('desayunos','Meriendas/Desayunos','coffebreak',2)]:
   c=db.scalar(select(Category).where(Category.name==name))
   if not c:
    c=Category(id='menu-'+key,name=name,image='/menu/'+image+('.jpg' if image=='coffebreak' else '.webp'),sort_order=order,public_visible=True);db.add(c);db.flush()
   cats[key]=c
  chocolate=db.scalar(select(Category).where(Category.name=='Chocolates'))
  if chocolate:chocolate.public_visible=False
  bebidas=db.scalar(select(Category).where(Category.name=='Bebidas'))
  if bebidas:bebidas.image='/menu/bebidas.webp'
  offers=[
   ('pizza-especial','Pizza especial','', 'comidas'),
   ('pizza-huevo','Pizza con huevo','', 'comidas'),
   ('empanadas','Empanadas','Árabes, dulces, saladas y de jamón y queso.', 'comidas'),
   ('picada','Picada','Empanadas, fiambres, maní y milanesa cortada.', 'comidas'),
   ('tostado','Tostado','', 'comidas'),
   ('palta','Tostadas con huevo y palta','', 'desayunos'),
   ('criollos','Criollos','', 'desayunos'),
   ('medialunas','Medialunas','', 'desayunos'),
   ('canela','Rol de canela','', 'desayunos')]
  for key,name,description,category in offers:
   p=db.scalar(select(Product).where(Product.name==name))
   if not p:
    p=Product(id='menu-'+key,name=name,description=description,category_id=cats[category].id,price=Decimal('0'),price_pending=True,available=True,public_categories=[],sizes=[],extras=[]);db.add(p)
   if key=='tostado':p.public_categories=list(set((p.public_categories or [])+[cats['desayunos'].id]))
  db.commit()
 print('Carta incorporada. Precios nuevos pendientes; productos anteriores conservados.')
if __name__=='__main__':apply()
