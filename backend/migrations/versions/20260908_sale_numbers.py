"""Persistent readable sale numbers; existing payment identifiers stay unchanged."""
from alembic import op
import sqlalchemy as sa

revision = "20260908_sale_numbers"
down_revision = "20260908_sales"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sales", sa.Column("number", sa.BigInteger(), nullable=True))
    connection = op.get_bind()
    ids = connection.execute(sa.text(
        "SELECT s.id FROM sales s JOIN payments p ON p.id=s.id ORDER BY p.created_at, s.id"
    )).scalars().all()
    for number, sale_id in enumerate(ids, 1):
        connection.execute(sa.text("UPDATE sales SET number=:number WHERE id=:id"),
                           {"number": number, "id": sale_id})
    op.create_unique_constraint("uq_sales_number", "sales", ["number"])
    # InnoDB allocates numbers atomically, including concurrent payments.
    # Numbers may have gaps after rollbacks; they are not fiscal voucher numbers.
    op.execute("ALTER TABLE sales MODIFY COLUMN number BIGINT NOT NULL AUTO_INCREMENT")


def downgrade():
    raise RuntimeError("Los números publicados de venta deben conservarse. Usar una migración de avance revisada.")
