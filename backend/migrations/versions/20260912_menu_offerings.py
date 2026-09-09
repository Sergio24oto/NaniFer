from alembic import op
import sqlalchemy as sa
revision='20260912_menu_offerings'
down_revision='20260911_menu'
branch_labels=None
depends_on=None
def upgrade():
 op.add_column('categories',sa.Column('note',sa.String(500),nullable=False,server_default=''))
 op.add_column('products',sa.Column('price_pending',sa.Boolean(),nullable=False,server_default='0'))
 op.add_column('products',sa.Column('public_categories',sa.JSON(),nullable=True))
 op.execute("UPDATE products SET public_categories=JSON_ARRAY() WHERE public_categories IS NULL")
 op.alter_column('products','public_categories',existing_type=sa.JSON(),nullable=False)
def downgrade():
 raise RuntimeError('Conservar los datos mediante una migración de avance.')
