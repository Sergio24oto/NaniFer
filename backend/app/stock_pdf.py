"""Current inventory report: quantities remain separated by their control units."""
from io import BytesIO
from pathlib import Path
from datetime import datetime
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, CondPageBreak
from .business_day import ZONE


def build_pdf(items,filters):
    out=BytesIO();doc=SimpleDocTemplate(out,pagesize=A4,leftMargin=40,rightMargin=40,topMargin=48,bottomMargin=42,title='NaniFer - Existencias',author='NaniFer')
    styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='StockCell',fontName='Helvetica',fontSize=10,leading=13))
    styles['Heading1'].textColor=colors.HexColor('#b41455')
    def p(text,style='StockCell'):return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
    def table(rows,widths):
        t=Table([[p(cell) for cell in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#f5e7ed')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#faf8f5')]),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8)]));return t
    generated=datetime.now(ZONE).strftime('%d/%m/%Y %H:%M:%S')
    story=[];logo=Path(__file__).resolve().parents[2]/'frontend/public/brand/logo.jpg'
    if logo.exists():
        image=Image(str(logo),width=80,height=80);image.hAlign='LEFT';story.append(image)
    story += [p('NaniFer | Existencias','Heading1'),p('Generado: '+generated+' - Argentina'),Spacer(1,10)]
    names={'search':'Búsqueda','category':'Categoría','mode':'Modalidad','area':'Área'};modes={'unit':'Unidades','containers':'Recipientes','manual':'Disponibilidad manual','beverages':'Bebidas','kiosk':'Kiosco','other':'Otros con stock','empty':'Agotados','flavors':'Helados · Sabores'}
    active=[names[k]+': '+modes.get(v,v) for k,v in filters.items() if v]
    story += [p('Filtros: '+(' · '.join(active) if active else 'Todos los productos y sabores')),p('Las cantidades se muestran por su unidad de control. No se suman unidades incompatibles.'),Spacer(1,12)]
    normal=[r for r in items if r['mode']!='containers']
    for category in sorted(set(r['category'] for r in normal)):
        rows=[r for r in normal if r['category']==category]
        story += [CondPageBreak(140),p(category,'Heading2'),table([['Producto / insumo','Existencia / control','Estado de venta']]+[[r['name'],('Manual - sin conteo' if r['mode']=='manual' else 'Sin carga inicial' if r['quantity'] is None else str(r['quantity'])+' '+r['unit']),'Disponible' if r['available'] else 'Agotado / no habilitado'] for r in rows],[205,155,155]),Spacer(1,10)]
    flavors=[r for r in items if r['mode']=='containers']
    if flavors:
        story += [CondPageBreak(170),p('Helados - recipientes por sabor','Heading2'),p('La disponibilidad es manual. Las ventas de helado no descuentan recipientes.'),Spacer(1,8),table([['Sabor','Cerrados','Abiertos','Disponibilidad manual']]+[[r['name'],r['quantity'] if r['quantity'] is not None else 'Sin carga',r['opened'],'Disponible' if r['available'] else 'Agotado'] for r in flavors],[195,80,80,160])]
    if not items:story.append(p('No hay existencias que coincidan con los filtros.'))
    def page(canvas,doc):
        canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#655b56'));canvas.drawString(40,A4[1]-28,'NaniFer - Existencias actuales | '+generated);canvas.drawString(40,24,'Informe interno - sin valuación de inventario.');canvas.drawRightString(A4[0]-40,24,'Página '+str(doc.page));canvas.restoreState()
    doc.build(story,onFirstPage=page,onLaterPages=page);return out.getvalue()
