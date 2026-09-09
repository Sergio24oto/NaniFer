from alembic import op
import sqlalchemy as sa
revision='20260913_catalog_crud'
down_revision='20260912_menu_offerings'
branch_labels=None
depends_on=None
def upgrade():
 op.add_column('products',sa.Column('archived',sa.Boolean(),nullable=False,server_default='0'))
def downgrade():
 raise RuntimeError('Use a forward migration to preserve archived products.')
