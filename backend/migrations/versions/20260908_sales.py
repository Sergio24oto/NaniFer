"""Sales tied one-to-one to payments, immutable allocations and correction audit."""
from alembic import op
import sqlalchemy as sa
from decimal import Decimal
import json

revision = "20260908_sales"
down_revision = "879fddfe8172"
branch_labels = None
depends_on = None


def historical_allocations(conn):
    # Validate BEFORE DDL (MySQL DDL auto-commits). Never guess a partial or
    # ambiguous same-second allocation. Existing app only charges full balances.
    payments = list(conn.execute(sa.text("SELECT p.*, u.name AS cashier FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at,p.id")).mappings())
    items = list(conn.execute(sa.text("SELECT i.*, o.visit_id, o.created_at FROM order_items i JOIN orders o ON o.id=i.order_id ORDER BY o.created_at,i.id")).mappings())
    used = set(); result = []
    for payment in payments:
        candidates = [i for i in items if i['visit_id']==payment['visit_id'] and i['id'] not in used and i['created_at'] <= payment['created_at']]
        if sum((i['quantity']*i['unit_price'] for i in candidates), Decimal(0)) != payment['amount']:
            raise RuntimeError("Historial ambiguo en cobro " + payment['id'] + ". Revisar la asignación de consumos antes de migrar; no se modificaron las tablas.")
        lines=[]
        for i in candidates:
            s=i['snapshot'] if isinstance(i['snapshot'],dict) else json.loads(i['snapshot'])
            lines.append(dict(id=i['id'],productId=i['product_id'],name=s['name'],quantity=i['quantity'],unitPrice=str(i['unit_price']),subtotal=str(i['quantity']*i['unit_price']),options=' · '.join(filter(None,[s.get('size',''),*s.get('flavors',[]),*s.get('extras',[])])),notes=s.get('notes','')))
            used.add(i['id'])
        result.append((payment,lines))
    return result


def upgrade():
    conn=op.get_bind()
    historical=historical_allocations(conn)
    op.create_table('sales',
        sa.Column('id',sa.String(36),sa.ForeignKey('payments.id'),primary_key=True),
        sa.Column('cashier_name',sa.String(100),nullable=False),
        sa.Column('original_items',sa.JSON(),nullable=False),
        sa.Column('current_items',sa.JSON(),nullable=False),
        sa.Column('current_total',sa.Numeric(12,2),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),mysql_engine='InnoDB')
    op.create_table('sale_allocations',
        sa.Column('order_item_id',sa.String(36),sa.ForeignKey('order_items.id'),primary_key=True),
        sa.Column('sale_id',sa.String(36),sa.ForeignKey('sales.id'),nullable=False),mysql_engine='InnoDB')
    op.create_index('ix_sale_allocations_sale_id','sale_allocations',['sale_id'])
    op.create_table('sale_corrections',
        sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('sale_id',sa.String(36),sa.ForeignKey('sales.id'),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),
        sa.Column('user_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('administrator',sa.String(100),nullable=False),
        sa.Column('reason',sa.String(500),nullable=False),
        sa.Column('before',sa.JSON(),nullable=False),
        sa.Column('after',sa.JSON(),nullable=False),
        sa.Column('created_at',sa.DateTime(),nullable=False),
        sa.UniqueConstraint('sale_id','version'),mysql_engine='InnoDB')
    op.create_index('ix_sale_corrections_sale_id','sale_corrections',['sale_id'])
    sales=sa.table('sales',sa.column('id'),sa.column('cashier_name'),sa.column('original_items',sa.JSON()),sa.column('current_items',sa.JSON()),sa.column('current_total'),sa.column('version'))
    allocations=sa.table('sale_allocations',sa.column('order_item_id'),sa.column('sale_id'))
    for p,lines in historical:
        conn.execute(sales.insert().values(id=p['id'],cashier_name=p['cashier'],original_items=lines,current_items=lines,current_total=p['amount'],version=0))
        for line in lines:
            conn.execute(allocations.insert().values(order_item_id=line['id'],sale_id=p['id']))


def downgrade():
    raise RuntimeError('La reversión eliminaría el historial de correcciones. Usar una migración de avance revisada.')
