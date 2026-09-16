from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20260918_remove_combos'
down_revision = '20260917_golosinas_image'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    conn.execute(text("""
        DELETE FROM products 
        WHERE category_id = 'menu-combos' 
           OR category_id IN (SELECT id FROM categories WHERE LOWER(name) LIKE '%combo%')
           OR id IN ('menu-combo-licuado', 'menu-combo-jugo', 'menu-combo-criollos', 'menu-combo-medialuna')
    """))
    conn.execute(text("""
        DELETE FROM categories 
        WHERE id = 'menu-combos' 
           OR LOWER(name) LIKE '%combo%'
    """))

def downgrade():
    pass
