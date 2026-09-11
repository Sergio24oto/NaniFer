"""Inventory accounting shared by orders and sale corrections."""
from collections import Counter
from copy import deepcopy
from sqlalchemy import select
from .models import StockItem, StockMovement, Product
from .services import fail, uid


def locked_products(db, ids):
    return {p.id:p for p in db.scalars(select(Product).where(Product.id.in_(sorted(set(ids)))).order_by(Product.id).with_for_update().execution_options(populate_existing=True))}


def components(db, product, size):
    ids=[]
    if product.stock_mode=='unit':
        item=db.scalar(select(StockItem).where(StockItem.product_id==product.id))
        if not item: fail('Falta configurar las existencias de '+product.name,422)
        presentation=next((s for s in product.sizes if s['name']==size),{})
        ids.extend([item.id]*presentation.get('stockUnits',1))
    cone=(product.cone_links or {}).get(size)
    if cone: ids.append(cone)
    return ids


def lock_items(db, ids):
    rows={r.id:r for r in db.scalars(select(StockItem).where(StockItem.id.in_(sorted(set(ids)))).order_by(StockItem.id).with_for_update().execution_options(populate_existing=True))}
    if set(rows)!=set(ids): fail('Insumo de stock inexistente.',422)
    return rows


def movement(db, row, quantity, opened, kind, user_id, note='', **links):
    if quantity<0 or opened<0 or quantity>1000000000 or opened>1000000000:
        fail('La operación dejaría una existencia inválida.',422)
    m=StockMovement(id=uid(),stock_id=row.id,version=row.version+1,kind=kind,before=row.quantity,after=quantity,
                    opened_before=row.opened,opened_after=opened,user_id=user_id,note=note,**links)
    row.quantity, row.opened = quantity, opened
    row.version+=1
    db.add(m)
    db.flush()
    return m


def prepare_order(db, items):
    products=locked_products(db,[i.productId for i in items])
    plans=[]; needed=Counter()
    for i in items:
        p=products.get(i.productId)
        if not p: fail('Producto inexistente.',422)
        ids=components(db,p,i.size)
        plans.append(ids)
        for id in ids: needed[id]+=i.quantity
    rows=lock_items(db,needed)
    for id,quantity in needed.items():
        if rows[id].quantity is None or rows[id].quantity<quantity:
            fail('Sin stock suficiente de '+rows[id].name+'. Avisá al administrador para revisar la existencia.',409)
    return plans,rows


def apply_order(db, item, ids, rows, user_id):
    item.snapshot={**item.snapshot,'stockBatches':[{'quantity':item.quantity,'components':ids}]}
    for id in ids:
        row=rows[id]
        movement(db,row,row.quantity-item.quantity,row.opened,'order',user_id,order_item_id=item.id)


def catalog_availability(product, stock):
    own=next((r for r in stock.values() if r.product_id==product.id),None)
    base=product.available and not product.archived and not product.price_pending and (product.stock_mode!='unit' or (own is not None and (own.quantity or 0)>0))
    def available(size):
        cone=(product.cone_links or {}).get(size)
        return bool(base and (not cone or (cone in stock and (stock[cone].quantity or 0)>0)))
    sizes=[{**s,'available':available(s['name']) and s.get('enabled',True) and (product.stock_mode!='unit' or (own is not None and (own.quantity or 0)>=s.get('stockUnits',1)))} for s in sorted(product.sizes,key=lambda s:s.get('order',0))]
    return (any(s['available'] for s in sizes) if sizes else available('')),sizes


def availability_reason(product, stock):
    if product.archived or not product.available:return 'Venta deshabilitada'
    if product.price_pending:return 'Sin precio'
    own=next((r for r in stock.values() if r.product_id==product.id),None)
    if product.stock_mode=='unit':
        if own is None or own.quantity is None:return 'Sin carga inicial de stock'
        if own.quantity<=0:return 'Sin stock'
    available,_=catalog_availability(product,stock)
    if available:return 'Disponible'
    cones=[stock.get(id) for id in (product.cone_links or {}).values()]
    if any(c is None or c.quantity is None for c in cones):return 'Sin carga inicial de stock'
    return 'Sin stock'


def correction_plan(db, sale, data, lines):
    """Consume increments only; historic/untracked units can never be returned."""
    previous={i['id']:i for i in sale.current_items}
    inputs={i.id:i for i in data.items}
    products=locked_products(db,[i.productId for i in data.items])
    deltas=[]; summaries=[]
    for line in lines:
        old=previous[line['id']]; incoming=inputs[line['id']]
        batches=deepcopy(old.get('stockBatches',[{'quantity':old['quantity'],'components':[]}]))
        changed=line['productId']!=old['productId']
        removed=old['quantity'] if changed else max(0,old['quantity']-line['quantity'])
        added=line['quantity'] if changed else max(0,line['quantity']-old['quantity'])
        released=Counter()
        left=removed
        for batch in reversed(batches):
            take=min(left,batch['quantity']);batch['quantity']-=take;left-=take
            for id in batch['components']: released[id]+=take
        batches=[b for b in batches if b['quantity']]
        if any(released.values()) and incoming.returnToStock is None:
            fail('Indicá si las unidades retiradas vuelven físicamente al stock. Un producto entregado no se repone automáticamente.',422)
        for id,quantity in released.items():
            if quantity:
                deltas.append(dict(stock_id=id,delta=quantity if incoming.returnToStock else 0,line_id=line['id'],kind='correction_return' if incoming.returnToStock else 'correction_no_return',units=quantity))
        if added:
            product=products[line['productId']]
            size=incoming.size if changed else old.get('size','')
            if product.sizes and size not in [s['name'] for s in product.sizes]:
                fail('Elegí la presentación del producto corregido.',422)
            if not product.sizes and size: fail('El producto no tiene presentaciones.',422)
            ids=components(db,product,size)
            batches.append(dict(quantity=added,components=ids))
            for id in ids:deltas.append(dict(stock_id=id,delta=-added,line_id=line['id'],kind='correction_out',units=added))
            line['size']=size
            if changed: line['options']=size
        line['stockBatches']=batches
    rows=lock_items(db,[d['stock_id'] for d in deltas])
    net=Counter()
    for d in deltas:net[d['stock_id']]+=d['delta']
    for id,delta in net.items():
        row=rows[id]
        if row.quantity is None or row.quantity+delta<0:
            fail('Sin stock suficiente de '+row.name+' para esta corrección.',409)
    for d in deltas:
        summaries.append(dict(name=rows[d['stock_id']].name,change=d['delta'],units=d['units'],returned=d['kind']=='correction_return',kind=d['kind']))
    return deltas,rows,summaries


def apply_correction(db, deltas, rows, correction, user_id, reason):
    # Returns first so a replacement using the same consumable is applied atomically.
    for d in sorted(deltas,key=lambda d:d['delta'],reverse=True):
        row=rows[d['stock_id']]
        movement(db,row,row.quantity+d['delta'],row.opened,d['kind'],user_id,
                 reason[:450]+(' · Unidades no repuestas: '+str(d['units']) if d['kind']=='correction_no_return' else ''),
                 order_item_id=d['line_id'],correction_id=correction.id)
