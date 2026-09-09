from datetime import datetime, UTC, date
from decimal import Decimal
from sqlalchemy import (
    String,
    Integer,
    BigInteger,
    FetchedValue,
    Boolean,
    DateTime,
    Date,
    Numeric,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now():
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="staff")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    can_manage_reservations: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    csrf: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)

    image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    public_visible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    note: Mapped[str] = mapped_column(String(500), default="", server_default="")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(String(500), default="")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    emoji: Mapped[str] = mapped_column(String(20), default="")
    image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    price_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    public_categories: Mapped[list] = mapped_column(JSON, default=list)
    stock_mode: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual")
    cone_links: Mapped[dict] = mapped_column(JSON, default=dict)
    sizes: Mapped[list] = mapped_column(JSON, default=list)
    extras: Mapped[list] = mapped_column(JSON, default=list)


class Flavor(Base):
    __tablename__ = "flavors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)


class Table(Base):
    __tablename__ = "dining_tables"
    number: Mapped[int] = mapped_column(Integer, primary_key=True)


class Visit(Base):
    __tablename__ = "visits"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    table_number: Mapped[int | None] = mapped_column(
        ForeignKey("dining_tables.number"), index=True, nullable=True
    )
    # A NULL slot is historical; a unique non-NULL slot ensures one active visit per table.
    active_table: Mapped[int | None] = mapped_column(
        ForeignKey("dining_tables.number"), unique=True, nullable=True
    )
    waitress_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    public_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pendiente")
    origin: Mapped[str] = mapped_column(String(20), default="legacy", server_default="legacy")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Immutable sale snapshot: names/options must survive subsequent catalog changes.
    snapshot: Mapped[dict] = mapped_column(JSON)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    method: Mapped[str] = mapped_column(String(20))
    received: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    change: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Operation(Base):
    __tablename__ = "operations"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(100))
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PublicSession(Base):
    __tablename__ = "public_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

class Sale(Base):
    __tablename__ = "sales"
    # MySQL generates this unique public number; the payment UUID remains the PK.
    number: Mapped[int] = mapped_column(BigInteger, unique=True, server_default=FetchedValue())
    id: Mapped[str] = mapped_column(ForeignKey("payments.id"), primary_key=True)
    cashier_name: Mapped[str] = mapped_column(String(100))
    original_items: Mapped[list] = mapped_column(JSON)
    current_items: Mapped[list] = mapped_column(JSON)
    current_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    version: Mapped[int] = mapped_column(Integer, default=0)


class SaleAllocation(Base):
    __tablename__ = "sale_allocations"
    order_item_id: Mapped[str] = mapped_column(ForeignKey("order_items.id"), primary_key=True)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id"), index=True)


class SaleCorrection(Base):
    __tablename__ = "sale_corrections"
    __table_args__ = (UniqueConstraint("sale_id", "version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    administrator: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(String(500))
    before: Mapped[dict] = mapped_column(JSON)
    after: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (UniqueConstraint("table_number", "active_date", name="uq_reservation_table_date"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    table_number: Mapped[int] = mapped_column(ForeignKey("dining_tables.number"))
    name: Mapped[str] = mapped_column(String(100))
    calendar_date: Mapped[date] = mapped_column(Date)
    active_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    note: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    visit_id: Mapped[str | None] = mapped_column(ForeignKey("visits.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    version: Mapped[int] = mapped_column(Integer, default=0)


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    contact: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class StockItem(Base):
    __tablename__ = "stock_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.id"), unique=True, nullable=True)
    flavor_id: Mapped[str | None] = mapped_column(ForeignKey("flavors.id"), unique=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(150))
    unit: Mapped[str] = mapped_column(String(30), default="unidades")
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opened: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=0)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (UniqueConstraint("stock_id", "version", name="uq_stock_movement_version"),)
    version: Mapped[int] = mapped_column(Integer)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    stock_id: Mapped[str] = mapped_column(ForeignKey("stock_items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    after: Mapped[int] = mapped_column(Integer)
    opened_before: Mapped[int] = mapped_column(Integer)
    opened_after: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(500), default="")
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    order_item_id: Mapped[str | None] = mapped_column(ForeignKey("order_items.id"), nullable=True, index=True)
    correction_id: Mapped[str | None] = mapped_column(ForeignKey("sale_corrections.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
