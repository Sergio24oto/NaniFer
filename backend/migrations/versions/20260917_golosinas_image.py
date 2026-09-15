from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20260917_golosinas_image'
down_revision = '20260916_golosinas'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    conn.execute(text("UPDATE categories SET image = '/menu/golosinas.webp' WHERE id = 'cat-golosinas' OR LOWER(name) LIKE '%golosina%'"))
    conn.execute(text("UPDATE categories SET image = '/menu/bebidas.webp' WHERE LOWER(name) LIKE '%bebida%'"))

def downgrade():
    pass
