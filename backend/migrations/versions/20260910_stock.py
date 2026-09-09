"""Explicit inventory configuration and immutable movement ledger. No historical deductions."""
from alembic import op
import sqlalchemy as sa
revision = "20260910_stock"
down_revision = "20260909_attention"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('products',sa.Column('stock_mode',sa.String(20),nullable=False,server_default='manual'))
    op.add_column('products',sa.Column('cone_links',sa.JSON(),nullable=True))
    op.execute("UPDATE products SET cone_links=JSON_OBJECT() WHERE cone_links IS NULL")
    op.alter_column('products','cone_links',existing_type=sa.JSON(),nullable=False)
    op.create_table('suppliers',
        sa.Column('id',sa.String(36),primary_key=True),sa.Column('name',sa.String(150),nullable=False,unique=True),
        sa.Column('contact',sa.String(200),nullable=False),sa.Column('created_by',sa.String(36),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('created_at',sa.DateTime(),nullable=False))
    op.create_table('stock_items',
        sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('product_id',sa.String(36),sa.ForeignKey('products.id'),unique=True,nullable=True),
        sa.Column('flavor_id',sa.String(36),sa.ForeignKey('flavors.id'),unique=True,nullable=True),
        sa.Column('kind',sa.String(20),nullable=False),sa.Column('name',sa.String(150),nullable=False),
        sa.Column('unit',sa.String(30),nullable=False),sa.Column('quantity',sa.Integer(),nullable=True),
        sa.Column('opened',sa.Integer(),nullable=False),sa.Column('version',sa.Integer(),nullable=False))
    op.create_table('stock_movements',
        sa.Column('id',sa.String(36),primary_key=True),sa.Column('stock_id',sa.String(36),sa.ForeignKey('stock_items.id'),nullable=False),
        sa.Column('kind',sa.String(30),nullable=False),sa.Column('before',sa.Integer(),nullable=True),sa.Column('after',sa.Integer(),nullable=False),
        sa.Column('opened_before',sa.Integer(),nullable=False),sa.Column('opened_after',sa.Integer(),nullable=False),
        sa.Column('note',sa.String(500),nullable=False),sa.Column('user_id',sa.String(36),sa.ForeignKey('users.id'),nullable=True),
        sa.Column('supplier_id',sa.String(36),sa.ForeignKey('suppliers.id'),nullable=True),
        sa.Column('unit_cost',sa.Numeric(18,6),nullable=True),sa.Column('total_cost',sa.Numeric(18,2),nullable=True),
        sa.Column('order_item_id',sa.String(36),sa.ForeignKey('order_items.id'),nullable=True),
        sa.Column('correction_id',sa.String(36),sa.ForeignKey('sale_corrections.id'),nullable=True),
        sa.Column('created_at',sa.DateTime(),nullable=False))
    for field in ('stock_id','order_item_id','correction_id'):
        op.create_index('ix_stock_movements_'+field,'stock_movements',[field])
    op.execute("INSERT INTO stock_items (id,kind,name,unit,quantity,opened,version) VALUES ('cone-1','cone','Cucurucho tipo 1','unidades',NULL,0,0),('cone-2','cone','Cucurucho tipo 2','unidades',NULL,0,0)")


def downgrade():
    raise RuntimeError('Conservar movimientos históricos: usar una migración de avance revisada.')
