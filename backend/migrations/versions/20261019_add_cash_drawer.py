"""add cash_shifts and cash_movements tables and shift_id to payments

Revision ID: 20261019_add_cash_drawer
Revises: 20261019_add_payment_splits
Create Date: 2026-10-19 21:10:00

"""
from alembic import op
import sqlalchemy as sa

revision = '20261019_add_cash_drawer'
down_revision = '20261019_add_payment_splits'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()
    if 'cash_shifts' not in tables:
        op.create_table(
            'cash_shifts',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('opened_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('closed_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('opened_at', sa.DateTime(), nullable=False),
            sa.Column('closed_at', sa.DateTime(), nullable=True),
            sa.Column('initial_cash', sa.Numeric(12, 2), nullable=False, server_default='0.00'),
            sa.Column('expected_cash', sa.Numeric(12, 2), nullable=True),
            sa.Column('counted_cash', sa.Numeric(12, 2), nullable=True),
            sa.Column('difference', sa.Numeric(12, 2), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='open'),
            sa.Column('notes', sa.String(500), nullable=False, server_default=''),
        )
    if 'cash_movements' not in tables:
        op.create_table(
            'cash_movements',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('shift_id', sa.String(36), sa.ForeignKey('cash_shifts.id'), nullable=False, index=True),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('kind', sa.String(20), nullable=False),
            sa.Column('amount', sa.Numeric(12, 2), nullable=False),
            sa.Column('category', sa.String(100), nullable=False),
            sa.Column('notes', sa.String(500), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
        )
    p_cols = [c['name'] for c in insp.get_columns('payments')]
    if 'shift_id' not in p_cols:
        op.add_column('payments', sa.Column('shift_id', sa.String(36), sa.ForeignKey('cash_shifts.id'), nullable=True))


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()
    p_cols = [c['name'] for c in insp.get_columns('payments')]
    if 'shift_id' in p_cols:
        op.drop_column('payments', 'shift_id')
    if 'cash_movements' in tables:
        op.drop_table('cash_movements')
    if 'cash_shifts' in tables:
        op.drop_table('cash_shifts')
