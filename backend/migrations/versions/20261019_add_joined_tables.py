"""add joined_tables to visits

Revision ID: 20261019_add_joined_tables
Revises: 20261019_add_cash_drawer
Create Date: 2026-10-19 22:35:00

"""
from alembic import op
import sqlalchemy as sa

revision = '20261019_add_joined_tables'
down_revision = '20261019_add_cash_drawer'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('visits')]
    if 'joined_tables' not in cols:
        op.add_column('visits', sa.Column('joined_tables', sa.JSON(), nullable=True))

def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('visits')]
    if 'joined_tables' in cols:
        op.drop_column('visits', 'joined_tables')
