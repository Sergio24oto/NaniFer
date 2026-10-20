from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select

from .auth import current_session
from .db import get_db
from .models import CashShift, CashMovement, Payment, User, now
from .schemas import StrictModel
from .services import uid, fail

router = APIRouter(prefix="/api/cash-drawer", tags=["cash-drawer"])


class OpenShiftIn(StrictModel):
    initialCash: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    notes: str = Field(default="", max_length=500)


class CashMovementIn(StrictModel):
    kind: Literal["egreso", "ingreso"]
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=500)


class CloseShiftIn(StrictModel):
    countedCash: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    notes: str = Field(default="", max_length=500)


def build_shift_summary(db, shift: CashShift):
    users = {u.id: u.name for u in db.scalars(select(User))}

    payments = list(db.scalars(
        select(Payment).where(
            (Payment.shift_id == shift.id) |
            ((Payment.shift_id == None) & (Payment.created_at >= shift.opened_at) &
             ((Payment.created_at <= shift.closed_at) if shift.closed_at else True))
        ).order_by(Payment.created_at)
    ))

    sales_by_method = {
        "efectivo": Decimal("0.00"),
        "tarjeta": Decimal("0.00"),
        "transferencia": Decimal("0.00"),
        "qr": Decimal("0.00"),
    }
    total_sales = Decimal("0.00")
    cash_sales = Decimal("0.00")

    for p in payments:
        total_sales += p.amount
        if p.splits:
            for sp in p.splits:
                m = sp.get("method")
                a = Decimal(str(sp.get("amount", 0)))
                if m in sales_by_method:
                    sales_by_method[m] += a
                if m == "efectivo":
                    cash_sales += a
        else:
            m = p.method
            if m in sales_by_method:
                sales_by_method[m] += p.amount
            if m == "efectivo":
                cash_sales += p.amount

    movements = list(db.scalars(
        select(CashMovement).where(CashMovement.shift_id == shift.id).order_by(CashMovement.created_at.desc())
    ))

    total_ingresos = sum((m.amount for m in movements if m.kind == "ingreso"), Decimal("0.00"))
    total_egresos = sum((m.amount for m in movements if m.kind == "egreso"), Decimal("0.00"))

    expected_cash = shift.initial_cash + cash_sales + total_ingresos - total_egresos

    difference = None
    if shift.counted_cash is not None:
        difference = shift.counted_cash - expected_cash
    elif shift.difference is not None:
        difference = shift.difference

    return {
        "shift": {
            "id": shift.id,
            "status": shift.status,
            "openedBy": shift.opened_by,
            "openedByName": users.get(shift.opened_by, "Personal"),
            "closedBy": shift.closed_by,
            "closedByName": users.get(shift.closed_by) if shift.closed_by else None,
            "openedAt": shift.opened_at.isoformat() if shift.opened_at else None,
            "closedAt": shift.closed_at.isoformat() if shift.closed_at else None,
            "initialCash": float(shift.initial_cash),
            "expectedCash": float(expected_cash),
            "countedCash": float(shift.counted_cash) if shift.counted_cash is not None else None,
            "difference": float(difference) if difference is not None else None,
            "notes": shift.notes or "",
        },
        "totals": {
            "totalSales": float(total_sales),
            "cashSales": float(cash_sales),
            "byMethod": {k: float(v) for k, v in sales_by_method.items()},
            "salesCount": len(payments),
            "totalIngresos": float(total_ingresos),
            "totalEgresos": float(total_egresos),
            "netMovements": float(total_ingresos - total_egresos),
            "expectedCash": float(expected_cash),
        },
        "movements": [
            {
                "id": m.id,
                "shiftId": m.shift_id,
                "userId": m.user_id,
                "userName": users.get(m.user_id, "Personal"),
                "kind": m.kind,
                "amount": float(m.amount),
                "category": m.category,
                "notes": m.notes,
                "createdAt": m.created_at.isoformat(),
            }
            for m in movements
        ],
    }


@router.get("/current")
def get_current_shift(auth=Depends(current_session), db=Depends(get_db)):
    active = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )
    if not active:
        # Check if there is any closed shift
        last_closed = db.scalar(
            select(CashShift).where(CashShift.status == "closed").order_by(CashShift.closed_at.desc()).limit(1)
        )
        return {
            "active": False,
            "lastShift": build_shift_summary(db, last_closed) if last_closed else None,
        }

    return {
        "active": True,
        **build_shift_summary(db, active),
    }


@router.post("/open")
def open_shift(data: OpenShiftIn, auth=Depends(current_session), db=Depends(get_db)):
    active = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )
    if active:
        fail("Ya hay una caja abierta. Cerrá el turno actual antes de abrir uno nuevo.", 409)

    shift = CashShift(
        id=uid(),
        opened_by=auth[0].id,
        opened_at=now(),
        initial_cash=data.initialCash,
        notes=data.notes,
        status="open",
    )
    db.add(shift)
    db.commit()

    return {
        "active": True,
        **build_shift_summary(db, shift),
    }


@router.post("/movements")
def add_movement(data: CashMovementIn, auth=Depends(current_session), db=Depends(get_db)):
    active = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )
    if not active:
        fail("No hay una caja abierta en este momento. Abrí la caja antes de registrar movimientos.", 409)

    movement = CashMovement(
        id=uid(),
        shift_id=active.id,
        user_id=auth[0].id,
        kind=data.kind,
        amount=data.amount,
        category=data.category.strip(),
        notes=data.notes.strip(),
        created_at=now(),
    )
    db.add(movement)
    db.commit()

    return {
        "active": True,
        **build_shift_summary(db, active),
    }


@router.post("/close")
def close_shift(data: CloseShiftIn, auth=Depends(current_session), db=Depends(get_db)):
    active = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )
    if not active:
        fail("No hay ninguna caja abierta para cerrar.", 409)

    summary = build_shift_summary(db, active)
    expected = Decimal(str(summary["totals"]["expectedCash"]))
    counted = data.countedCash
    difference = counted - expected

    active.closed_by = auth[0].id
    active.closed_at = now()
    active.expected_cash = expected
    active.counted_cash = counted
    active.difference = difference
    active.status = "closed"
    if data.notes:
        active.notes = (active.notes + " | " + data.notes).strip(" |")

    db.commit()

    return {
        "active": False,
        **build_shift_summary(db, active),
    }


@router.get("/history")
def get_history(limit: int = 30, auth=Depends(current_session), db=Depends(get_db)):
    shifts = list(db.scalars(
        select(CashShift).order_by(CashShift.opened_at.desc()).limit(limit)
    ))
    return [build_shift_summary(db, s) for s in shifts]
