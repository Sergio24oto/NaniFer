"""Staff workflows; reuse the existing transaction and sale ledger."""
from datetime import datetime, date, time, UTC
from decimal import Decimal
from typing import Literal
import secrets
from fastapi import APIRouter, Depends, Header
from pydantic import Field, field_validator
from sqlalchemy import select, update, func, case
from .db import get_db
from .auth import current_session, digest
from .models import Reservation, Visit, User, Table, now
from .schemas import StrictModel, ConsumptionIn, ManualOrderIn, CounterIn, CounterQuoteIn
from .services import lock_table, lock_visit, once, uid, fail, make_order, make_payment, close_visit, priced_item
from .business_day import ZONE, local_iso

router = APIRouter(prefix="/api")


def calendar_today():
    return datetime.now(ZONE).date()


def permissions(user):
    return ["reservations.manage"] if user.can_manage_reservations and user.role in ("admin", "staff") else []


def require_reservations(user):
    if "reservations.manage" not in permissions(user):
        fail("No tenés permiso para gestionar reservas.", 403)


def reservation_json(r):
    local = r.starts_at.replace(tzinfo=UTC).astimezone(ZONE)
    return dict(id=r.id, table=r.table_number, name=r.name, date=r.calendar_date.isoformat(),
                time=local.strftime("%H:%M"), note=r.note, status=r.status, visitId=r.visit_id,
                createdBy=r.created_by, updatedBy=r.updated_by, createdAt=local_iso(r.created_at),
                updatedAt=local_iso(r.updated_at), version=r.version,
                acknowledgment=f"{r.id}:{r.version}")


def pending_reservations(db):
    return [reservation_json(r) for r in db.scalars(select(Reservation).where(
        Reservation.status == "pending").order_by(Reservation.starts_at, Reservation.id))]


def check_reservation(db, number, acknowledgment):
    r = db.scalar(select(Reservation).where(Reservation.table_number == number,
                  Reservation.active_date == calendar_today()).with_for_update())
    if r and acknowledgment != f"{r.id}:{r.version}":
        fail("Hay una reserva pendiente para hoy. Revisá el nombre y la hora y confirmá que querés continuar.")


@router.post("/tables/{number}/consumptions")
def consumptions(number: int, data: ConsumptionIn, key: str = Header(alias="Idempotency-Key"),
                 auth=Depends(current_session), db=Depends(get_db)):
    lock_table(db, number)
    def save():
        from .main import open_table, find_active_visit_for_table
        visit = find_active_visit_for_table(db, number)
        if visit:
            db.scalar(select(Visit).where(Visit.id == visit.id).with_for_update())
        if (visit.id if visit else None) != data.expectedAccount:
            fail("La visita cambió. Revisá la mesa antes de guardar los consumos.")
        if not visit:
            check_reservation(db, number, data.reservationAcknowledgment)
            visit = open_table(db, number, auth[0])
        order = ManualOrderIn(expectedAccount=visit.id, items=data.items, needsPreparation=data.needsPreparation)
        return make_order(db, visit, order, origin="manual", user=auth[0], delivered=not data.needsPreparation)
    result = once(db, key, f"consumptions:{number}", data.model_dump(mode="json"), save)
    db.commit()
    return result


class JoinTablesIn(StrictModel):
    targetTable: int = Field(ge=1)


class SeparateTableIn(StrictModel):
    targetTable: int = Field(ge=1)


@router.post("/tables/{number}/join")
def join_tables(number: int, data: JoinTablesIn, auth=Depends(current_session), db=Depends(get_db)):
    target = data.targetTable
    if number == target:
        fail("No podés juntar una mesa consigo misma.", 422)

    lock_table(db, number)
    lock_table(db, target)
    from .main import open_table, find_active_visit_for_table
    from .models import Order, Payment

    v_source = find_active_visit_for_table(db, number)
    v_target = find_active_visit_for_table(db, target)

    if not v_source and not v_target:
        v_source = open_table(db, number, auth[0])
        v_source.joined_tables = [target]
    elif v_source and not v_target:
        current_joined = list(v_source.joined_tables or [])
        if target not in current_joined:
            current_joined.append(target)
            v_source.joined_tables = current_joined
    elif not v_source and v_target:
        current_joined = list(v_target.joined_tables or [])
        if number not in current_joined:
            current_joined.append(number)
            v_target.joined_tables = current_joined
    else:
        # Both exist!
        if v_source.id != v_target.id:
            # Transfer all orders and payments from v_target to v_source
            db.execute(update(Order).where(Order.visit_id == v_target.id).values(visit_id=v_source.id))
            db.execute(update(Payment).where(Payment.visit_id == v_target.id).values(visit_id=v_source.id))
            v_target.closed_at = now()
            v_target.active_table = None
            current_joined = list(v_source.joined_tables or [])
            if target not in current_joined:
                current_joined.append(target)
            for t in (v_target.joined_tables or []):
                if t not in current_joined and t != number:
                    current_joined.append(t)
            v_source.joined_tables = current_joined

    db.commit()
    return {"ok": True, "source": number, "target": target}


@router.post("/tables/{number}/separate")
def separate_tables(number: int, data: SeparateTableIn, auth=Depends(current_session), db=Depends(get_db)):
    target = data.targetTable
    lock_table(db, number)
    lock_table(db, target)
    from .main import find_active_visit_for_table

    v = find_active_visit_for_table(db, number)
    if v and v.joined_tables and target in v.joined_tables:
        current = list(v.joined_tables)
        current.remove(target)
        v.joined_tables = current
        db.commit()
    return {"ok": True, "separated": target}


@router.post("/counter/quote")
def quote(data: CounterQuoteIn, auth=Depends(current_session), db=Depends(get_db)):
    total = sum((priced_item(db, item, require_flavors=False)[1] * item.quantity for item in data.items), Decimal(0))
    return {"total": str(total)}


@router.post("/counter/checkout")
def counter(data: CounterIn, key: str = Header(alias="Idempotency-Key"),
            auth=Depends(current_session), db=Depends(get_db)):
    # Serialize retries even though a counter purchase has no pre-existing visit to lock.
    db.scalar(select(User).where(User.id == auth[0].id).with_for_update())
    def save():
        visit = Visit(id=uid(), table_number=None, active_table=None, waitress_id=auth[0].id,
                      public_token_hash=digest(secrets.token_urlsafe(32)))
        db.add(visit)
        db.flush()
        order = ManualOrderIn(expectedAccount=visit.id, items=data.items, needsPreparation=data.needsPreparation)
        make_order(db, visit, order, origin="counter", user=auth[0], delivered=not data.needsPreparation)
        result = make_payment(db, visit, data, auth[0])
        if not data.needsPreparation:
            close_visit(db, visit)
        return {**result, "accountId": visit.id}
    result = once(db, key, "counter:" + auth[0].id, data.model_dump(mode="json"), save)
    db.commit()
    return result


class ReservationIn(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    date: date
    time: time
    note: str = Field(default="", max_length=500)
    expectedVersion: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Ingresá el nombre de la reserva.")
        return value.strip()

    @field_validator("time")
    @classmethod
    def local_time(cls, value):
        if value.tzinfo or value.second or value.microsecond:
            raise ValueError("Usá hora y minutos de Argentina.")
        return value

    @field_validator("date")
    @classmethod
    def valid_date(cls, value):
        if not 1970 <= value.year <= 9998:
            raise ValueError("Fecha fuera de rango.")
        return value


class ReservationAction(StrictModel):
    expectedVersion: int = Field(ge=0)
    linkExisting: bool = False
    expectedVisit: str | None = None


def set_reservation(db, r, data, user):
    other = db.scalar(select(Reservation.id).where(Reservation.table_number == r.table_number,
        Reservation.active_date == data.date, Reservation.id != r.id))
    if other:
        fail("Solo se permite una reserva pendiente por mesa y fecha.")
    r.name, r.calendar_date, r.active_date = data.name, data.date, data.date
    r.starts_at = datetime.combine(data.date, data.time, ZONE).astimezone(UTC).replace(tzinfo=None)
    r.note, r.updated_by, r.updated_at = data.note.strip(), user.id, now()


def locked_reservation(db, id):
    r = db.get(Reservation, id)
    if not r:
        fail("Reserva inexistente.", 404)
    lock_table(db, r.table_number)
    db.refresh(r, with_for_update=True)
    return r


def editable(r, version):
    if r.status != "pending" or version != r.version:
        fail("La reserva cambió. Actualizá los datos antes de continuar.")


@router.get("/reservations")
def reservations(date: date, auth=Depends(current_session), db=Depends(get_db)):
    require_reservations(auth[0])
    return [reservation_json(r) for r in db.scalars(select(Reservation).where(
        Reservation.calendar_date == date).order_by(Reservation.starts_at))]


@router.post("/tables/{number}/reservations")
def create_reservation(number: int, data: ReservationIn, key: str = Header(alias="Idempotency-Key"),
                       auth=Depends(current_session), db=Depends(get_db)):
    require_reservations(auth[0])
    lock_table(db, number)
    def save():
        r = Reservation(id=uid(), table_number=number, created_by=auth[0].id, status="pending", version=0)
        set_reservation(db, r, data, auth[0])
        db.add(r)
        db.flush()
        return reservation_json(r)
    result = once(db, key, f"reservation-create:{number}", data.model_dump(mode="json"), save)
    db.commit()
    return result


@router.post("/reservations/{id}/edit")
def edit_reservation(id: str, data: ReservationIn, key: str = Header(alias="Idempotency-Key"),
                     auth=Depends(current_session), db=Depends(get_db)):
    require_reservations(auth[0])
    r = locked_reservation(db, id)
    def save():
        editable(r, data.expectedVersion)
        set_reservation(db, r, data, auth[0])
        r.version += 1
        db.flush()
        return reservation_json(r)
    result = once(db, key, "reservation:" + id, data.model_dump(mode="json"), save)
    db.commit()
    return result


@router.post("/reservations/{id}/{action}")
def reservation_action(id: str, action: str, data: ReservationAction,
                       key: str = Header(alias="Idempotency-Key"), auth=Depends(current_session), db=Depends(get_db)):
    require_reservations(auth[0])
    if action not in ("cancel", "arrive"):
        fail("Acción inexistente.", 404)
    r = locked_reservation(db, id)
    def save():
        editable(r, data.expectedVersion)
        if action == "arrive":
            from .main import open_table
            visit = db.scalar(select(Visit).where(Visit.active_table == r.table_number).with_for_update())
            if visit and (not data.linkExisting or data.expectedVisit != visit.id):
                fail("La mesa tiene una visita activa. Solo podés vincular la reserva si corresponde a esos clientes.")
            if not visit and data.expectedVisit:
                fail("La visita cambió. Revisá la mesa.")
            visit = visit or open_table(db, r.table_number, auth[0])
            r.visit_id = visit.id
        r.status = "arrived" if action == "arrive" else "cancelled"
        r.active_date = None
        r.version += 1
        r.updated_by, r.updated_at = auth[0].id, now()
        db.flush()
        return reservation_json(r)
    result = once(db, key, "reservation:" + id, {"action": action, **data.model_dump()}, save)
    db.commit()
    return result


class TableCreateIn(StrictModel):
    sector: Literal['salon', 'afuera'] = 'afuera'
    name: str | None = None


@router.get("/tables")
def get_tables(auth=Depends(current_session), db=Depends(get_db)):
    tables = list(db.scalars(
        select(Table).where(Table.active == True).order_by(
            case((Table.sector == "salon", 0), else_=1),
            Table.display_number
        )
    ))
    return [
        {
            "number": t.number,
            "sector": t.sector,
            "displayNumber": t.display_number,
            "name": t.name or (f"Mesa {t.display_number}" + (" (Afuera)" if t.sector == "afuera" else "")),
            "active": t.active,
        }
        for t in tables
    ]


@router.post("/tables")
def create_table(data: TableCreateIn, auth=Depends(current_session), db=Depends(get_db)):
    if auth[0].role != "admin":
        fail("Solo el administrador puede agregar mesas.", 403)

    existing_in_sector = list(db.scalars(
        select(Table).where(Table.sector == data.sector, Table.active == True)
    ))
    max_disp = max([t.display_number for t in existing_in_sector], default=0)
    disp = max_disp + 1

    taken_numbers = set(db.scalars(select(Table.number)))
    if data.sector == "salon":
        candidate = disp
        while candidate in taken_numbers:
            candidate += 1
        num = candidate
    else:
        candidate = 100 + disp
        while candidate in taken_numbers:
            candidate += 1
        num = candidate

    table_name = data.name.strip() if data.name and data.name.strip() else (
        f"Mesa {disp}" + (" (Afuera)" if data.sector == "afuera" else "")
    )

    new_t = Table(
        number=num,
        sector=data.sector,
        display_number=disp,
        name=table_name,
        active=True
    )
    db.add(new_t)
    db.commit()
    return {
        "number": new_t.number,
        "sector": new_t.sector,
        "displayNumber": new_t.display_number,
        "name": new_t.name,
        "active": new_t.active,
    }


@router.delete("/tables/{number}")
def remove_table(number: int, auth=Depends(current_session), db=Depends(get_db)):
    if auth[0].role != "admin":
        fail("Solo el administrador puede eliminar mesas.", 403)

    t = db.get(Table, number)
    if not t or not t.active:
        fail("Mesa no encontrada.", 404)

    from .main import find_active_visit_for_table
    if find_active_visit_for_table(db, number):
        fail("No podés eliminar una mesa con atención abierta o pedidos en curso.", 409)

    past_visits_count = db.scalar(select(func.count(Visit.id)).where(Visit.table_number == number))
    if past_visits_count and past_visits_count > 0:
        t.active = False
        db.commit()
        return {"ok": True, "number": number, "archived": True}
    else:
        db.delete(t)
        db.commit()
        return {"ok": True, "number": number, "deleted": True}

