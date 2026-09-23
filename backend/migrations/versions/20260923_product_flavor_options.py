from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20260923_product_flavor_options'
down_revision = '20260918_remove_combos'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('products')]
    if 'flavor_options' not in columns:
        op.add_column('products', sa.Column('flavor_options', sa.JSON(), nullable=True))
        conn.execute(text("UPDATE products SET flavor_options = '[]' WHERE flavor_options IS NULL"))

def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('products')]
    if 'flavor_options' in columns:
        op.drop_column('products', 'flavor_options')
