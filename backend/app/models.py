from datetime import datetime, UTC
from decimal import Decimal
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
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
    table_number: Mapped[int] = mapped_column(
        ForeignKey("dining_tables.number"), index=True
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
