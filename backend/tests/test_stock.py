from datetime import date
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from fastapi.testclient import TestClient
from sqlalchemy import select,func
from pypdf import PdfReader
from app.main import app
from app.db import SessionLocal
from app.models import StockItem,StockMovement,Supplier,Product,Order,OrderItem,User,Payment,Sale,Flavor
from test_mysql import fixture,key,open_visit,order,pay,deliver,HEADERS


def post(f,path,body,token=None):
    return f['client'].post('/api'+path,json=body,headers={'Idempotency-Key':token or key()})


def promote(f,role='admin'):
    with SessionLocal() as db:db.get(User,f['user_id']).role=role;db.commit()


def configured(f,unit='unidades',initial=10):
    promote(f)
    r=post(f,'/stock/products/'+f['product']+'/configure',{'mode':'unit','unit':unit,'available':True,'coneLinks':{}})
    assert r.status_code==200
    id=r.json()['stockId']
    if initial is not None:move(f,id,'count',initial,reason='Conteo inicial de prueba')
    return id


def move(f,id,action,quantity,**extra):
    with SessionLocal() as db:version=db.get(StockItem,id).version
    body=dict(action=action,quantity=quantity,expectedVersion=version,**extra)
    r=post(f,'/stock/items/'+id+'/movements',body)
    assert r.status_code==200,r.status_code
    return r.json()


def qty(id):
    with SessionLocal() as db:return db.get(StockItem,id).quantity


def supplier(f):
    r=post(f,'/stock/suppliers',{'name':'Proveedor de prueba '+key(),'contact':'Contacto de prueba'})
    assert r.status_code==200
    return r.json()['id']


def test_explicit_configuration_entries_and_portion_precision(fixture):
    f=fixture;id=configured(f,'porciones',None)
    assert qty(id) is None
    catalog=f['client'].get('/api/catalog').json()
    assert not next(p for p in catalog['products'] if p['id']==f['product'])['available']
    sup=supplier(f)
    first=move(f,id,'receive',12,supplierId=sup,totalCost='24000.00')
    assert first['quantity']==12
    move(f,id,'receive',7,supplierId=sup,totalCost='100.00')
    assert qty(id)==19
    with SessionLocal() as db:
        rows=list(db.scalars(select(StockMovement).where(StockMovement.stock_id==id).order_by(StockMovement.version)))
        assert rows[0].unit_cost==Decimal('2000.000000') and rows[0].total_cost==Decimal('24000.00')
        assert rows[1].unit_cost==Decimal('14.285714') and rows[1].total_cost==Decimal('100.00')
        assert db.get(Product,f['product']).price==1000
    move(f,id,'count',12,reason='Conteo físico')
    assert qty(id)==12


def test_units_entry_cost_snapshot_out_count_and_retry(fixture):
    f=fixture;id=configured(f,initial=2);sup=supplier(f)
    move(f,id,'receive',12,supplierId=sup,unitCost='125.123456')
    assert qty(id)==14
    move(f,id,'out',2,outReason='rotura',reason='Envases rotos')
    assert qty(id)==12
    with SessionLocal() as db:version=db.get(StockItem,id).version
    body={'action':'count','quantity':8,'reason':'Recuento físico','expectedVersion':version}
    preview=post(f,'/stock/items/'+id+'/preview',body).json();assert preview['difference']==-4
    token=key();a=post(f,'/stock/items/'+id+'/movements',body,token);b=post(f,'/stock/items/'+id+'/movements',body,token)
    assert a.status_code==b.status_code==200 and a.json()==b.json() and qty(id)==8
    assert post(f,'/stock/items/'+id+'/movements',{'action':'out','quantity':9,'reason':'No alcanza','expectedVersion':a.json()['version']}).status_code==409
    assert qty(id)==8
    with SessionLocal() as db:
        received=db.scalar(select(StockMovement).where(StockMovement.stock_id==id,StockMovement.kind=='receive'))
        assert received.unit_cost==Decimal('125.123456') and received.total_cost==Decimal('1501.48')


def test_manual_qr_counter_discount_once_and_no_delivery_discount(fixture):
    f=fixture;id=configured(f);v=open_visit(f)
    token=key();manual=order(f,v,token);assert manual.status_code==200
    assert order(f,v,token).status_code==200
    deliver(f,manual.json()['id']);assert pay(f,v,1000).status_code==200
    assert qty(id)==9
    with TestClient(app,headers=HEADERS) as c:
        c.post(f"/api/public/mesa/{f['table']}/join")
        body={'expectedAccount':v,'items':[{'productId':f['product'],'quantity':1}]};token=key()
        for _ in range(2):assert c.post(f"/api/public/mesa/{f['table']}/orders",json=body,headers={'Idempotency-Key':token}).status_code==403
        public=c.get(f"/api/public/mesa/{f['table']}").text
        assert 'stockBatches' not in public and 'supplier' not in public and 'Cost' not in public
    token=key();body={'items':[{'productId':f['product'],'quantity':1}],'method':'efectivo','expectedBalance':1000}
    for _ in range(2):assert post(f,'/counter/checkout',body,token).status_code==200
    assert qty(id)==8
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(StockMovement).where(StockMovement.stock_id==id,StockMovement.kind=='order'))==2


def test_last_unit_concurrent_and_atomic_order_rejection(fixture):
    f=fixture;id=configured(f,initial=1);v=open_visit(f)
    def send(_):
        with TestClient(app,headers=dict(f['client'].headers),cookies=f['client'].cookies) as c:
            return c.post('/api/visits/'+v+'/orders',json={'expectedAccount':v,'items':[{'productId':f['product'],'quantity':1}]},headers={'Idempotency-Key':key()})
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(send,range(4)))
    assert sorted(r.status_code for r in results)==[200,409,409,409] and qty(id)==0
    move(f,id,'count',1,reason='Prueba de rechazo completo')
    with SessionLocal() as db:before=db.scalar(select(func.count()).select_from(Order).where(Order.visit_id==v))
    r=post(f,'/visits/'+v+'/orders',{'expectedAccount':v,'items':[{'productId':f['product'],'quantity':1},{'productId':f['product'],'quantity':1}]})
    assert r.status_code==409 and qty(id)==1
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(Order).where(Order.visit_id==v))==before
    # Counter payment validation fails after building its order: the complete transaction rolls back.
    r=post(f,'/counter/checkout',{'items':[{'productId':f['product'],'quantity':1}],'method':'tarjeta','expectedBalance':1})
    assert r.status_code==409 and qty(id)==1


def test_cones_per_presentation_and_manual_disable(fixture):
    f=fixture;promote(f)
    cones=[key(),key()];f['stock_ids'].extend(cones)
    with SessionLocal() as db:
        for i,id in enumerate(cones):db.add(StockItem(id=id,kind='cone',name='Tipo de prueba '+str(i),unit='unidades',quantity=2,opened=0,version=0))
        p=db.get(Product,f['product']);p.sizes=[{'name':'Tipo A','price':0,'max':0},{'name':'Tipo B','price':0,'max':0},{'name':'Vaso','price':0,'max':0}];db.commit()
    r=post(f,'/stock/products/'+f['product']+'/configure',{'mode':'manual','available':True,'coneLinks':{'Tipo A':cones[0],'Tipo B':cones[1]}})
    assert r.status_code==200
    v=open_visit(f)
    def send(size,n):return post(f,'/visits/'+v+'/orders',{'expectedAccount':v,'items':[{'productId':f['product'],'size':size,'quantity':n}]})
    assert send('Tipo A',2).status_code==200
    assert (qty(cones[0]),qty(cones[1]))==(0,2)
    product=next(p for p in f['client'].get('/api/catalog').json()['products'] if p['id']==f['product'])
    assert product['available'] and [z['available'] for z in product['sizes']]==[False,True,True]
    assert send('Tipo A',1).status_code==409
    assert send('Tipo B',1).status_code==200 and send('Vaso',1).status_code==200
    assert qty(cones[1])==1
    post(f,'/stock/products/'+f['product']+'/configure',{'mode':'manual','available':False,'coneLinks':{'Tipo A':cones[0],'Tipo B':cones[1]}})
    assert send('Tipo B',1).status_code==422 and qty(cones[1])==1


def test_containers_manual_flavor_availability_and_losses(fixture):
    f=fixture;promote(f)
    r=post(f,'/stock/flavors/'+f['flavor']+'/configure',{'available':True});assert r.status_code==200
    id=r.json()['stockId'];move(f,id,'receive',4,supplierId=supplier(f),unitCost='50000')
    move(f,id,'open',1);assert qty(id)==3
    with SessionLocal() as db:assert db.get(StockItem,id).opened==1
    v=open_visit(f)
    with SessionLocal() as db:
        p=db.get(Product,f['product']);p.sizes=[{'name':'Bocha','price':0,'max':1}];name=db.get(Flavor,f['flavor']).name;db.commit()
    assert post(f,'/visits/'+v+'/orders',{'expectedAccount':v,'items':[{'productId':f['product'],'size':'Bocha','flavors':[name],'quantity':1}]}).status_code==200
    assert qty(id)==3
    move(f,id,'finish',1)
    with SessionLocal() as db:
        r=db.get(StockItem,id);assert r.opened==0;version=r.version
        assert db.get(Flavor,f['flavor']).available
    assert post(f,'/stock/items/'+id+'/movements',{'action':'finish','quantity':1,'expectedVersion':version}).status_code==409
    assert post(f,'/stock/items/'+id+'/movements',{'action':'open','quantity':4,'expectedVersion':version}).status_code==409
    move(f,id,'out',1,reason='Recipiente dañado',outReason='rotura')
    move(f,id,'open',1);move(f,id,'count',0,bucket='opened',reason='Conteo de abiertos')
    assert qty(id)==1
    with SessionLocal() as db:assert db.get(Flavor,f['flavor']).available


def test_corrections_price_and_returns_not_duplicated(fixture):
    f=fixture;id=configured(f,initial=10);v=open_visit(f)
    assert post(f,'/visits/'+v+'/orders',{'expectedAccount':v,'items':[{'productId':f['product'],'quantity':5}]}).status_code==200
    saleid=pay(f,v,5000).json()['id'];assert qty(id)==5
    def change(quantity,price,returned=None,token=None):
        sale=f['client'].get('/api/sales/'+saleid).json();line=sale['items'][0]
        body={'expectedVersion':sale['version'],'reason':'Ajuste de prueba','items':[{'id':line['id'],'productId':f['product'],'quantity':quantity,'unitPrice':price,'returnToStock':returned}]}
        return post(f,'/sales/'+saleid+'/corrections',body,token),body
    assert change(5,900)[0].status_code==200 and qty(id)==5
    assert change(3,900)[0].status_code==422 and qty(id)==5
    assert change(3,900,False)[0].status_code==200 and qty(id)==5
    assert change(5,900)[0].status_code==200 and qty(id)==3
    token=key();r,body=change(3,900,True,token);assert r.status_code==200 and qty(id)==5
    assert post(f,'/sales/'+saleid+'/corrections',body,token).status_code==200 and qty(id)==5
    assert change(0,900,True)[0].status_code==200 and qty(id)==8
    with SessionLocal() as db:
        assert db.get(Payment,saleid).amount==5000 and db.get(Product,f['product']).price==1000
        assert db.get(Sale,saleid).original_items[0]['quantity']==5
        assert db.get(Sale,saleid).current_total==0


def test_legacy_correction_never_replenishes_untracked_units(fixture):
    f=fixture;promote(f);v=open_visit(f);order(f,v);saleid=pay(f,v,1000).json()['id']
    id=configured(f,initial=5)
    sale=f['client'].get('/api/sales/'+saleid).json();line=sale['items'][0]
    body={'expectedVersion':0,'reason':'No reponer consumo previo','items':[{'id':line['id'],'productId':f['product'],'quantity':0,'unitPrice':1000,'returnToStock':True}]}
    assert post(f,'/sales/'+saleid+'/corrections',body).status_code==200 and qty(id)==5


def test_personnel_permissions_public_privacy_and_pdf(fixture):
    f=fixture;id=configured(f,initial=7);supplier(f)
    row=next(r for r in f['client'].get('/api/stock').json()['items'] if r['stockId']==id)
    pdf=f['client'].get('/api/stock/export.pdf',params={'search':row['name'],'category':row['category']})
    assert pdf.status_code==200
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
    assert '7 unidades' in text and row['name'] in text and 'Proveedor' not in text
    promote(f,'staff')
    listing=f['client'].get('/api/stock');assert listing.status_code==200
    assert all(x not in listing.text for x in ['unitCost','totalCost','supplierId','contact'])
    assert f['client'].get('/api/stock/suppliers').status_code==403
    assert f['client'].get('/api/stock/export.pdf').status_code==403
    assert f['client'].get('/api/stock/items/'+id+'/history',params={'start':str(date.today()),'end':str(date.today())}).status_code==403
    assert post(f,'/stock/items/'+id+'/movements',{'action':'count','quantity':50,'reason':'Intento','expectedVersion':1}).status_code==403
    assert post(f,'/stock/products/'+f['product']+'/configure',{'mode':'manual','available':True}).status_code==403
    assert qty(id)==7
    with TestClient(app,headers=HEADERS) as c:
        assert c.get('/api/stock').status_code==401
        public=c.get('/api/catalog').text
        assert all(x not in public for x in ['unitCost','supplierId','stockBatches','stock_movements','totalCost'])


def test_replacement_consumes_new_product_and_preserves_return_choice(fixture):
    f=fixture;first=configured(f,initial=4)
    second_product=key();f['product_ids'].append(second_product)
    with SessionLocal() as db:
        p=db.get(Product,f['product'])
        db.add(Product(id=second_product,category_id=p.category_id,name='Reemplazo de prueba',price=Decimal('1200'),available=True,sizes=[],extras=[]));db.commit()
    r=post(f,'/stock/products/'+second_product+'/configure',{'mode':'unit','available':True});assert r.status_code==200
    second=r.json()['stockId'];move(f,second,'count',1,reason='Inicial de reemplazo')
    v=open_visit(f);order(f,v);saleid=pay(f,v,1000).json()['id'];line=f['client'].get('/api/sales/'+saleid).json()['items'][0]
    body={'expectedVersion':0,'reason':'Reemplazo sin recuperación','items':[{'id':line['id'],'productId':second_product,'quantity':2,'unitPrice':1200,'returnToStock':False}]}
    assert post(f,'/sales/'+saleid+'/corrections',body).status_code==409
    assert (qty(first),qty(second))==(3,1)
    body['items'][0]['quantity']=1;token=key()
    assert post(f,'/sales/'+saleid+'/corrections',body,token).status_code==200
    assert post(f,'/sales/'+saleid+'/corrections',body,token).status_code==200
    assert (qty(first),qty(second))==(3,0)
    with SessionLocal() as db:
        moves=list(db.scalars(select(StockMovement).where(StockMovement.correction_id!=None,StockMovement.stock_id.in_([first,second]))))
        assert len(moves)==2 and all(m.order_item_id==line['id'] for m in moves)
        assert db.get(Sale,saleid).current_total==1200 and db.get(Payment,saleid).amount==1000


def test_stock_product_creation_with_packaging_and_area(fixture):
    f = fixture
    promote(f)
    listing = f['client'].get('/api/stock').json()
    assert 'categories' in listing
    assert len(listing['categories']) > 0

    sup = supplier(f)
    # 1. Agregar bebida por pack
    body_bev = {
        'name': 'Sprite 500ml ' + key()[:6],
        'area': 'beverages',
        'price': '1800.00',
        'available': True,
        'packageType': 'pack',
        'packages': 2,
        'unitsPerPackage': 6,
        'receivedDate': str(date.today()),
        'supplierId': sup,
        'totalCost': '12000.00',
        'initialStock': True
    }
    r_bev = post(f, '/stock/products', body_bev)
    assert r_bev.status_code == 200, r_bev.text
    bev_data = r_bev.json()
    assert bev_data['quantity'] == 12
    assert bev_data['stockArea'] == 'beverages'
    sid_bev = bev_data['stockId']
    f['product_ids'].append(bev_data['id'])
    assert qty(sid_bev) == 12

    with SessionLocal() as db:
        m = db.scalar(select(StockMovement).where(StockMovement.stock_id == sid_bev))
        assert m is not None
        assert m.kind == 'receive'
        assert m.purchase['type'] == 'pack'
        assert m.purchase['packages'] == 2
        assert m.purchase['units'] == 12
        assert m.total_cost == Decimal('12000.00')

    # 2. Agregar artículo de kiosco por cajón
    body_kiosk = {
        'name': 'Alfajor Havanna ' + key()[:6],
        'area': 'kiosk',
        'price': '2500.00',
        'available': True,
        'packageType': 'cajón',
        'packages': 1,
        'unitsPerPackage': 24,
        'receivedDate': str(date.today()),
        'initialStock': True
    }
    r_kiosk = post(f, '/stock/products', body_kiosk)
    assert r_kiosk.status_code == 200, r_kiosk.text
    kiosk_data = r_kiosk.json()
    assert kiosk_data['quantity'] == 24
    assert kiosk_data['stockArea'] == 'kiosk'
    f['product_ids'].append(kiosk_data['id'])
    assert qty(kiosk_data['stockId']) == 24

    # 3. Nombre duplicado en misma categoría retorna 409
    dup = post(f, '/stock/products', body_bev)
    assert dup.status_code == 409

    # 4. No admin retorna 403
    promote(f, 'staff')
    assert post(f, '/stock/products', {'name': 'Otra gaseosa', 'area': 'beverages'}).status_code == 403

