from alembic import op

revision = '20260915_bebidas_image'
down_revision = '20260914_qr_stock'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("UPDATE categories SET image = '/menu/bebidas.webp' WHERE name = 'Bebidas'")

def downgrade():
    pass
