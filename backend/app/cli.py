import argparse, getpass, json
from pathlib import Path
from decimal import Decimal
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from .db import SessionLocal
from .models import Category, Product, Flavor, Table, User
from .auth import password_hash
from .services import uid
from .config import settings


def seed(db):
    data = json.loads(
        Path(__file__).with_name("demo_catalog.json").read_text(encoding="utf-8")
    )
    for index, name in enumerate(data["categories"]):
        if not db.scalar(select(Category).where(Category.name == name)):
            db.add(Category(id="demo-" + str(index), name=name))
            db.flush()
    for p in data["products"]:
        if db.get(Product, p["id"]):
            continue
        category = db.scalar(select(Category).where(Category.name == p["category"]))
        db.add(
            Product(
                id=p["id"],
                category_id=category.id,
                name=p["name"],
                description=p["description"],
                price=Decimal(str(p["price"])),
                available=p["available"],
                emoji=p["emoji"],
                sizes=p.get("sizes", []),
                extras=p.get("extras", []),
            )
        )
    for index, f in enumerate(data["flavors"]):
        if not db.scalar(select(Flavor).where(Flavor.name == f["name"])):
            db.add(
                Flavor(
                    id="demo-" + str(index), name=f["name"], available=f["available"]
                )
            )
    for n in range(1, 16):
        if not db.get(Table, n):
            db.add(Table(number=n))
    db.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["check-db", "seed-demo", "create-user"])
    args = parser.parse_args()
    try:
        with SessionLocal() as db:
            if args.command == "check-db":
                db.execute(text("SELECT 1"))
                print("MySQL accesible.")
                return
            if args.command == "seed-demo":
                if not settings.db_name.endswith(("_dev", "_test")):
                    raise SystemExit(
                        "Solo se permiten ejemplos en bases terminadas en _dev o _test."
                    )
                seed(db)
                print("Ejemplos agregados. No se actualizaron registros existentes.")
                return
            username = input("Usuario: ").strip()
            name = input("Nombre visible: ").strip()
            role = input("Rol (staff/admin): ").strip()
            if not username or not name or role not in ("staff", "admin"):
                raise SystemExit("Datos invalidos.")
            if db.scalar(select(User).where(User.username == username)):
                raise SystemExit("El usuario ya existe; no se modifico.")
            password = getpass.getpass("Contrasena (minimo 12 caracteres): ")
            if len(password) < 12 or password != getpass.getpass(
                "Repetir contrasena: "
            ):
                raise SystemExit("Contrasenas invalidas.")
            db.add(
                User(
                    id=uid(),
                    username=username,
                    name=name,
                    role=role,
                    password_hash=password_hash(password),
                )
            )
            db.commit()
            print("Usuario creado.")
    except SQLAlchemyError:
        raise SystemExit(
            "No fue posible acceder a MySQL. Revisa el servicio, permisos, backend/.env y las migraciones. No se muestran credenciales."
        )


if __name__ == "__main__":
    main()
