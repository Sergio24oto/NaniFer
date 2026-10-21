"""add sectors to dining_tables and seed 8 outdoor tables

Revision ID: 20261021_add_table_sectors
Revises: 20261020_helados_catalog
Create Date: 2026-10-21 18:35:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = '20261021_add_table_sectors'
down_revision = '20261020_helados_catalog'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('dining_tables')]

    if 'sector' not in cols:
        op.add_column('dining_tables', sa.Column('sector', sa.String(20), nullable=False, server_default='salon'))
    if 'display_number' not in cols:
        op.add_column('dining_tables', sa.Column('display_number', sa.Integer(), nullable=False, server_default='1'))
    if 'name' not in cols:
        op.add_column('dining_tables', sa.Column('name', sa.String(50), nullable=False, server_default=''))
    if 'active' not in cols:
        op.add_column('dining_tables', sa.Column('active', sa.Boolean(), nullable=False, server_default='1'))

    # Update salon tables 1..15
    conn.execute(
        text("""
            UPDATE dining_tables
            SET sector = 'salon',
                display_number = number,
                name = CONCAT('Mesa ', number),
                active = 1
            WHERE number <= 15
        """)
    )

    # Seed 8 outdoor tables (101 to 108)
    for disp in range(1, 9):
        num = 100 + disp
        name = f"Mesa {disp} (Afuera)"
        existing = conn.execute(
            text("SELECT number FROM dining_tables WHERE number = :num"),
            {"num": num}
        ).fetchone()

        if existing:
            conn.execute(
                text("""
                    UPDATE dining_tables
                    SET sector = 'afuera',
                        display_number = :disp,
                        name = :name,
                        active = 1
                    WHERE number = :num
                """),
                {"num": num, "disp": disp, "name": name}
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO dining_tables (number, sector, display_number, name, active)
                    VALUES (:num, 'afuera', :disp, :name, 1)
                """),
                {"num": num, "disp": disp, "name": name}
            )


def downgrade():
    conn = op.get_bind()
    # Remove outdoor tables
    conn.execute(text("DELETE FROM dining_tables WHERE sector = 'afuera'"))
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('dining_tables')]
    if 'active' in cols:
        op.drop_column('dining_tables', 'active')
    if 'name' in cols:
        op.drop_column('dining_tables', 'name')
    if 'display_number' in cols:
        op.drop_column('dining_tables', 'display_number')
    if 'sector' in cols:
        op.drop_column('dining_tables', 'sector')
