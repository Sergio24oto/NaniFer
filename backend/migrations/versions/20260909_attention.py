"""Manual entry provenance, independent counter purchases and private reservations."""
from alembic import op
import sqlalchemy as sa
revision = "20260909_attention"
down_revision = "20260908_sale_numbers"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("visits", "table_number", existing_type=sa.Integer(), nullable=True)
    op.add_column("users", sa.Column("can_manage_reservations", sa.Boolean(), nullable=False, server_default="1"))
    op.add_column("orders", sa.Column("origin", sa.String(20), nullable=False, server_default="legacy"))
    op.add_column("orders", sa.Column("created_by", sa.String(36), nullable=True))
    op.create_foreign_key("fk_orders_created_by", "orders", "users", ["created_by"], ["id"])
    op.create_table("reservations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("table_number", sa.Integer(), sa.ForeignKey("dining_tables.number"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column("active_date", sa.Date(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("note", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("visit_id", sa.String(36), sa.ForeignKey("visits.id"), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.UniqueConstraint("table_number", "active_date", name="uq_reservation_table_date"))


def downgrade():
    raise RuntimeError("Conservar compras y reservas: usar una migración de avance revisada.")
