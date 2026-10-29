"""add sort_order to products table

Revision ID: 20261028_add_product_sort_order
Revises: 20261021_add_table_sectors
Create Date: 2026-10-28 23:59:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261028_add_product_sort_order'
down_revision = '20261021_add_table_sectors'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('products')]

    if 'sort_order' not in cols:
        op.add_column('products', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('products')]

    if 'sort_order' in cols:
        op.drop_column('products', 'sort_order')
