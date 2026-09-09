from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import Field, field_validator
from sqlalchemy import select
from .auth import current_session
from .db import get_db
from .models import Sale, SaleCorrection, Payment, Product, Visit
from .schemas import StrictModel
from .services import once, uid, fail
from .business_day import business_day, period, local_iso, period_labels

router = APIRouter(prefix='/api/sales', tags=['Ventas'])


class CorrectLine(StrictModel):
    id: str
    productId: str
    quantity: int = Field(ge=0, le=999, strict=True)
    returnToStock: bool | None = None
    size: str = ""
    unitPrice: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class CorrectionIn(StrictModel):
    expectedVersion: int = Field(ge=0)
    reason: str = Field(min_length=3, max_length=500)
    items: list[CorrectLine] = Field(min_length=1, max_length=2000)

    @field_validator('reason')
    @classmethod
    def reason_not_blank(cls, value):
        if len(value.strip()) < 3:
            raise ValueError('Escribí el motivo de la corrección.')
        return value.strip()


def admin(auth):
    if auth[0].role != 'admin':
        fail('Solo el administrador puede realizar esta operación.', 403)


def report(db, user, start=None, end=None, sale_id=None, last=None):
    # One SQL statement: sale totals and complete history come from one consistent
    # MySQL statement snapshot, including while another administrator corrects.
    if sale_id:
        filters = [Sale.id == sale_id]
    else:
        start,end,lower,upper = period(start,end,user.role,last)
        filters = [Payment.created_at >= lower, Payment.created_at < upper]
    rows=db.execute(select(Sale,Payment,Visit.table_number,SaleCorrection)
        .join(Payment,Payment.id==Sale.id).join(Visit,Visit.id==Payment.visit_id)
        .outerjoin(SaleCorrection,SaleCorrection.sale_id==Sale.id)
        .where(*filters).order_by(Payment.created_at.desc(),Sale.id,SaleCorrection.version)).all()
    sales={}
    for s,p,table,c in rows:
        day=business_day(p.created_at)
        if user.role != 'admin' and day != business_day():
            fail('El personal solo puede consultar la jornada actual.',403)
        if s.id not in sales:
            sales[s.id]=dict(id=s.id,number=s.number,visitId=p.visit_id,table=table,day=str(day),createdAt=local_iso(p.created_at),
                cashier=s.cashier_name,method=p.method,paid=str(p.amount),originalTotal=str(p.amount),
                total=str(s.current_total),difference=str(s.current_total-p.amount),version=s.version,
                items=s.current_items,originalItems=s.original_items,corrections=[])
        if c:
            sales[s.id]['corrections'].append(dict(id=c.id,version=c.version,createdAt=local_iso(c.created_at),
                administrator=c.administrator,reason=c.reason,before=c.before,after=c.after))
    if sale_id:
        if not sales: fail('Venta inexistente.',404)
        return next(iter(sales.values()))
    from datetime import timedelta
    daily={str(start+timedelta(days=i)):dict(day=str(start+timedelta(days=i)),total=Decimal(0),paid=Decimal(0),count=0)
           for i in range((end-start).days+1)}
    for s in sales.values():
        d=daily[s['day']];d['total']+=Decimal(s['total']);d['paid']+=Decimal(s['paid']);d['count']+=1
    total=sum((d['total'] for d in daily.values()),Decimal(0))
    paid=sum((d['paid'] for d in daily.values()),Decimal(0))
    title, note = period_labels(start, end)
    return dict(periodTitle=title,periodNote=note,correctedCount=sum(s['version'] > 0 for s in sales.values()),
                start=str(start),end=str(end),today=str(business_day()),total=str(total),paid=str(paid),
                difference=str(total-paid),count=len(sales),sales=list(sales.values()),
                days=[{**d,'total':str(d['total']),'paid':str(d['paid'])} for d in daily.values()])


@router.get('')
def list_sales(start: date | None=None,end: date | None=None,last: int | None=None,auth=Depends(current_session),db=Depends(get_db)):
    return report(db,auth[0],start,end,last=last)


@router.get('/export.pdf')
def export(start: date | None=None,end: date | None=None,last: int | None=None,auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    data=report(db,auth[0],start,end,last=last)
    from .sales_pdf import build_pdf
    return Response(build_pdf(data),media_type='application/pdf',headers={
        'Content-Disposition':f'attachment; filename="NaniFer-ventas-{data["start"]}-{data["end"]}.pdf"'})


@router.get('/{id}')
def detail(id: str,auth=Depends(current_session),db=Depends(get_db)):
    return report(db,auth[0],sale_id=id)


def correction_preview(db,sale,data,stock_plan=False):
    if sale.version != data.expectedVersion:
        fail('La venta cambió. Volvé a abrir el detalle y revisá la corrección.')
    previous={i['id']:i for i in sale.current_items}
    if len(data.items)!=len(previous) or set(i.id for i in data.items)!=set(previous):
        fail('La corrección debe conservar los renglones originales.',422)
    lines=[]
    for i in data.items:
        old=previous[i.id]
        product=db.get(Product,i.productId)
        if not product: fail('Producto inexistente.',422)
        changed=i.productId != old['productId']
        lines.append({**old,'productId':i.productId,'name':product.name if changed else old['name'],
                      'options':'' if changed else old.get('options',''),
                      'quantity':i.quantity,'unitPrice':str(i.unitPrice.quantize(Decimal('0.01'))),'subtotal':str((i.quantity*i.unitPrice).quantize(Decimal('0.01')))})
    total=sum((Decimal(i['subtotal']) for i in lines),Decimal(0))
    if total > Decimal('9999999999.99'): fail('Total fuera del límite admitido.',422)
    if lines == sale.current_items: fail('No hay cambios para guardar.',422)
    before=dict(items=sale.current_items,total=str(sale.current_total))
    from .stock_accounting import correction_plan
    deltas,rows,stock_changes=correction_plan(db,sale,data,lines)
    after=dict(items=lines,total=str(total))
    result=dict(before=before,after=after,reason=data.reason,version=sale.version,stockChanges=stock_changes)
    return (result,deltas,rows) if stock_plan else result


def locked_sale(db,id):
    sale=db.scalar(select(Sale).where(Sale.id==id).with_for_update().execution_options(populate_existing=True))
    if not sale:fail('Venta inexistente.',404)
    return sale


@router.post('/{id}/preview')
def preview(id: str,data: CorrectionIn,auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    return correction_preview(db,locked_sale(db,id),data)


@router.post('/{id}/corrections')
def correct(id: str,data: CorrectionIn,key: str=Header(alias='Idempotency-Key'),auth=Depends(current_session),db=Depends(get_db)):
    admin(auth)
    sale=locked_sale(db,id)
    def apply():
        change,deltas,rows=correction_preview(db,sale,data,stock_plan=True)
        sale.version+=1
        correction=SaleCorrection(id=uid(),sale_id=id,version=sale.version,user_id=auth[0].id,
            administrator=auth[0].name,reason=data.reason,before=change['before'],after=change['after'])
        db.add(correction)
        db.flush()
        from .stock_accounting import apply_correction
        apply_correction(db,deltas,rows,correction,auth[0].id,data.reason)
        sale.current_items=change['after']['items']
        sale.current_total=Decimal(change['after']['total'])
        db.flush()
        return {'id':id,'version':sale.version}
    result=once(db,key,'correct:'+id,data.model_dump(mode='json'),apply)
    db.commit()
    return result
