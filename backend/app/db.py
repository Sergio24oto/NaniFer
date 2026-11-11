import json
from decimal import Decimal
from sqlalchemy import create_engine, URL
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings


def _json_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _json_dumps(obj):
    return json.dumps(obj, default=_json_default)


class Base(DeclarativeBase):
    pass


if settings.database_url:
    url = settings.database_url
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"connect_timeout": 5},
        isolation_level="READ COMMITTED",
        json_serializer=_json_dumps,
    )
else:
    engine = create_engine(
        URL.create(
            "mysql+pymysql",
            username=settings.db_user,
            password=settings.db_password,
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
        ),
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"connect_timeout": 5},
        isolation_level="READ COMMITTED",
        json_serializer=_json_dumps,
    )
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db
