"""Public category presentation; internal catalog remains unchanged."""
from alembic import op
import sqlalchemy as sa
revision='20260911_menu'
down_revision='20260910_stock_sequence'
branch_labels=None
depends_on=None
def upgrade():
    op.add_column('categories',sa.Column('image',sa.String(500),nullable=True))
    op.add_column('categories',sa.Column('sort_order',sa.Integer(),nullable=False,server_default='0'))
    op.add_column('categories',sa.Column('public_visible',sa.Boolean(),nullable=False,server_default='1'))
def downgrade():
    raise RuntimeError('Usar una migración de avance para conservar la configuración.')
