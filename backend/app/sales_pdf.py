"""Printable report; consumes the same complete snapshot as the sales screen."""
from io import BytesIO
from pathlib import Path
from datetime import datetime, UTC
from decimal import Decimal
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from .business_day import local_iso


def money(value):
    return '$ ' + f'{Decimal(value):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def stamp(value):
    return datetime.fromisoformat(value).strftime('%d/%m/%Y %H:%M:%S')


def day(value):
    return datetime.fromisoformat(value).strftime('%d/%m/%Y')


def build_pdf(data):
    out=BytesIO()
    doc=SimpleDocTemplate(out,pagesize=A4,rightMargin=40,leftMargin=40,topMargin=48,bottomMargin=44,
                         title='NaniFer - Ventas',author='NaniFer')
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Cell',fontName='Helvetica',fontSize=10,leading=13,spaceAfter=0,wordWrap='CJK'))
    styles.add(ParagraphStyle(name='Muted',fontName='Helvetica',fontSize=9,leading=13,textColor=colors.HexColor('#655b56')))
    styles['Heading1'].textColor=colors.HexColor('#b41455')
    def p(value,style='Cell'):return Paragraph(escape(str(value)).replace('\n','<br/>'),styles[style])
    def table(rows,widths):
        t=Table([[p(c) for c in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT',splitInRow=1)
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#f5e7ed')),('VALIGN',(0,0),(-1,-1),'TOP'),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#faf8f5')]),
            ('LINEBELOW',(0,0),(-1,0),0.6,colors.HexColor('#cbaeb8')),
            ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
            ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
        return t
    story=[]
    logo=Path(__file__).resolve().parents[2]/'frontend/public/brand/logo.jpg'
    if logo.exists():
        img=Image(str(logo),width=84,height=84);img.hAlign='LEFT';story.append(img)
    story += [p('NaniFer | Ventas','Heading1'),p(data['periodTitle'],'Normal'),
              p('Generado: '+stamp(local_iso(datetime.now(UTC).replace(tzinfo=None)))+' - Buenos Aires','Muted'),
              Spacer(1,12),p('Total vendido: '+money(data['total']),'Heading2'),
              p(f"Operaciones cobradas: {data['count']}",'Normal')]
    corrected=[s for s in data['sales'] if s['version']]
    if corrected:
        story += [p('Cobros registrados: '+money(data['paid'])),p('Diferencia por correcciones: '+money(data['difference'])),
                  p('El total incluye correcciones. No generan automáticamente cobros ni devoluciones.','Muted')]
    else:
        story.append(p('Sin correcciones en este período','Muted'))
    story += [Spacer(1,10),p(data['periodNote'] + ' · Buenos Aires (America/Argentina/Buenos_Aires).','Muted'),
              p('Totales por jornada','Heading2'),table([['Jornada','Operaciones','Total','Cobros registrados']]+[[day(d['day']),d['count'],money(d['total']),money(d['paid'])] for d in data['days']],[100,85,165,165]),
              Spacer(1,12),p('Ventas cobradas','Heading2')]
    if not data['sales']:story.append(p('No hay ventas cobradas en el período seleccionado.','Normal'))
    else:
        story.append(table([['Venta','Fecha y hora','Responsable del cobro','Medio de pago','Total']]+[
            ['Venta #'+str(s['number'])+'\n'+('Mostrador' if s['table'] is None else 'Mesa '+str(s['table']))+('\nCorregida' if s['version'] else ''),stamp(s['createdAt']),s['cashier'],s['method'],money(s['total'])] for s in data['sales']], [100,88,127,80,120]))
    if corrected:
        story += [Spacer(1,12),p('Correcciones','Heading2'),p('Se imputan a la jornada original de cada venta. Se conserva el cobro original.','Muted')]
        for s in corrected:
            story.append(KeepTogether([Spacer(1,8),p('Venta #'+str(s['number']),'Heading3'),p(f"Jornada {day(s['day'])} · Original: {money(s['originalTotal'])} · Total: {money(s['total'])}")]))
            story.append(table([['Fecha / administrador','Antes / después','Motivo']]+[
                [stamp(c['createdAt'])+'\n'+c['administrator'],money(c['before']['total'])+'\n'+money(c['after']['total']),c['reason']] for c in s['corrections']], [145,125,245]))
    def page(canvas,doc):
        canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#655b56'))
        canvas.drawString(40,A4[1]-28,'NaniFer - Reporte de ventas | '+day(data['start'])+' al '+day(data['end']))
        canvas.drawString(40,24,'Informe interno. No es comprobante fiscal.')
        canvas.drawRightString(A4[0]-40,24,f'Página {doc.page}');canvas.restoreState()
    doc.build(story,onFirstPage=page,onLaterPages=page)
    return out.getvalue()
