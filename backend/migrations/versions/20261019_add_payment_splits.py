"""add splits column to payments table for split payments

Revision ID: 20261019_add_payment_splits
Revises: 20261019_add_combo_config
Create Date: 2026-10-19 20:50:00

"""
from alembic import op
import sqlalchemy as sa

revision = '20261019_add_payment_splits'
down_revision = '20261019_add_combo_config'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    columns = [c['name'] for c in sa.inspect(conn).get_columns('payments')]
    if 'splits' not in columns:
        op.add_column('payments', sa.Column('splits', sa.JSON(), nullable=True))

def downgrade():
    conn = op.get_bind()
    columns = [c['name'] for c in sa.inspect(conn).get_columns('payments')]
    if 'splits' in columns:
        op.drop_column('payments', 'splits')
