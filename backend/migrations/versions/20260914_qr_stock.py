from alembic import op
import sqlalchemy as sa
revision='20260914_qr_stock'
down_revision='20260913_catalog_crud'
branch_labels=None
depends_on=None

def upgrade():
 op.execute('ALTER TABLE orders ADD COLUMN number BIGINT NOT NULL AUTO_INCREMENT UNIQUE')
 op.add_column('categories',sa.Column('stock_area',sa.String(20),nullable=False,server_default='other'))
 op.add_column('orders',sa.Column('device_hash',sa.String(64),nullable=True))
 op.create_index('ix_orders_device_hash','orders',['device_hash'])
 op.add_column('stock_items',sa.Column('units_per_package',sa.Integer(),nullable=False,server_default='1'))
 op.add_column('stock_movements',sa.Column('purchase',sa.JSON(),nullable=True))
 op.create_table('attention_calls',sa.Column('id',sa.String(36),primary_key=True),sa.Column('table_number',sa.Integer(),sa.ForeignKey('dining_tables.number'),nullable=False),sa.Column('pending_table',sa.Integer(),sa.ForeignKey('dining_tables.number'),nullable=True,unique=True),sa.Column('created_at',sa.DateTime(),nullable=False),sa.Column('attended_at',sa.DateTime(),nullable=True),sa.Column('attended_by',sa.String(36),sa.ForeignKey('users.id'),nullable=True))

def downgrade():
 raise RuntimeError('Usar una migración hacia adelante para conservar el historial.')
