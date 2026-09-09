"""Stable per-item movement ordering, including changes in the same second."""
from alembic import op
import sqlalchemy as sa
revision='20260910_stock_sequence'
down_revision='20260910_stock'
branch_labels=None
depends_on=None


def upgrade():
    op.add_column('stock_movements',sa.Column('version',sa.Integer(),nullable=True))
    db=op.get_bind()
    items=db.execute(sa.text('SELECT id,version FROM stock_items')).all()
    for id,current in items:
        rows=db.execute(sa.text('SELECT id FROM stock_movements WHERE stock_id=:id ORDER BY created_at,id'),{'id':id}).scalars().all()
        for number,mid in enumerate(rows,1):db.execute(sa.text('UPDATE stock_movements SET version=:n WHERE id=:id'),{'n':number,'id':mid})
        if len(rows)>current:db.execute(sa.text('UPDATE stock_items SET version=:n WHERE id=:id'),{'n':len(rows),'id':id})
    op.alter_column('stock_movements','version',existing_type=sa.Integer(),nullable=False)
    op.create_unique_constraint('uq_stock_movement_version','stock_movements',['stock_id','version'])


def downgrade():
    raise RuntimeError('Conservar el orden del historial; usar una migración de avance.')
