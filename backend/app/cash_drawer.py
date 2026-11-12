from decimal import Decimal
from typing import Literal
from datetime import datetime, UTC
import calendar
from fastapi import APIRouter, Depends, Response
from pydantic import Field
from sqlalchemy import select, and_

from .auth import current_session
from .db import get_db
from .models import CashShift, CashMovement, Payment, Sale, Visit, User, now
from .schemas import StrictModel
from .services import uid, fail
from .business_day import ZONE, local_iso
from .cash_drawer_pdf import build_shift_pdf, build_monthly_pdf

router = APIRouter(prefix="/api/cash-drawer", tags=["cash-drawer"])

MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]


class OpenShiftIn(StrictModel):
    initialCash: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    notes: str = Field(default="", max_length=500)


class CashMovementIn(StrictModel):
    kind: Literal["egreso", "ingreso"]
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(min_length=1, max_length=100)
    method: Literal["efectivo", "transferencia", "debito", "otro"] = "efectivo"
    notes: str = Field(default="", max_length=500)


class CloseShiftIn(StrictModel):
    countedCash: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    responsibleName: str = Field(default="", max_length=150)
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

    # Pre-fetch Sales and Visits to avoid N+1 queries and provide clean details
    p_ids = [p.id for p in payments]
    v_ids = [p.visit_id for p in payments if p.visit_id]

    sales_map = {s.id: s for s in db.scalars(select(Sale).where(Sale.id.in_(p_ids)))} if p_ids else {}
    visits_map = {v.id: v for v in db.scalars(select(Visit).where(Visit.id.in_(v_ids)))} if v_ids else {}

    movements = list(db.scalars(
        select(CashMovement).where(CashMovement.shift_id == shift.id).order_by(CashMovement.created_at)
    ))

    # Totals accumulators
    incomes = {
        "efectivo": Decimal("0.00"),
        "transferencia": Decimal("0.00"),
        "debito": Decimal("0.00"),
        "qr": Decimal("0.00"),
        "voucher": Decimal("0.00"),
    }
    expenses = {
        "efectivo": Decimal("0.00"),
        "transferencia": Decimal("0.00"),
        "debito": Decimal("0.00"),
        "otro": Decimal("0.00"),
    }

    # Interleave events chronologically
    events = []

    for p in payments:
        sale = sales_map.get(p.id)
        visit = visits_map.get(p.visit_id)
        origin = f"Mesa {visit.table_number}" if (visit and visit.table_number is not None) else "Mostrador"

        items_parts = []
        if sale and sale.current_items:
            for it in sale.current_items:
                q = it.get("quantity", 1)
                n = it.get("name", "")
                items_parts.append(f"{q}x {n}" if q > 1 else n)
        items_str = ", ".join(items_parts)

        sale_num = getattr(sale, "number", None)
        num_str = f"#{sale_num}" if sale_num is not None else ""
        detail = f"Venta {num_str} · {origin}: {items_str}" if items_str else f"Venta {num_str} · {origin}"

        # Breakdown payment by method
        p_efectivo = Decimal("0.00")
        p_transf = Decimal("0.00")
        p_debito = Decimal("0.00")
        p_qr = Decimal("0.00")
        p_voucher = Decimal("0.00")

        if p.splits:
            for sp in p.splits:
                m = sp.get("method")
                a = Decimal(str(sp.get("amount", 0)))
                if m == "efectivo":
                    p_efectivo += a
                elif m == "transferencia":
                    p_transf += a
                elif m in ("tarjeta", "debito"):
                    p_debito += a
                elif m == "qr":
                    p_qr += a
                elif m == "voucher":
                    p_voucher += a
        else:
            m = p.method
            if m == "efectivo":
                p_efectivo += p.amount
            elif m == "transferencia":
                p_transf += p.amount
            elif m in ("tarjeta", "debito"):
                p_debito += p.amount
            elif m == "qr":
                p_qr += p.amount
            elif m == "voucher":
                p_voucher += p.amount

        incomes["efectivo"] += p_efectivo
        incomes["transferencia"] += p_transf
        incomes["debito"] += p_debito
        incomes["qr"] += p_qr
        incomes["voucher"] += p_voucher

        cashier = (sale.cashier_name if sale and sale.cashier_name else None) or users.get(p.user_id, "Personal")

        events.append({
            "type": "sale",
            "time": p.created_at,
            "id": f"pay-{p.id}",
            "detail": detail,
            "efectivo": p_efectivo,
            "transferencia": p_transf,
            "debito": p_debito,
            "qr": p_qr,
            "voucher": p_voucher,
            "isExpense": False,
            "expenseMethod": None,
            "expenseAmount": Decimal("0.00"),
            "signature": cashier,
        })

    for m in movements:
        m_method = getattr(m, "method", "efectivo") or "efectivo"
        user_name = users.get(m.user_id, "Personal")

        if m.kind == "ingreso":
            m_efectivo = m.amount if m_method == "efectivo" else Decimal("0.00")
            m_transf = m.amount if m_method == "transferencia" else Decimal("0.00")
            m_debito = m.amount if m_method in ("debito", "tarjeta") else Decimal("0.00")
            m_qr = m.amount if m_method == "qr" else Decimal("0.00")

            incomes["efectivo"] += m_efectivo
            incomes["transferencia"] += m_transf
            incomes["debito"] += m_debito
            incomes["qr"] += m_qr

            detail = f"[Ingreso Manual] {m.category}" + (f": {m.notes}" if m.notes else "")
            events.append({
                "type": "movement_in",
                "time": m.created_at,
                "id": f"mov-{m.id}",
                "detail": detail,
                "efectivo": m_efectivo,
                "transferencia": m_transf,
                "debito": m_debito,
                "qr": m_qr,
                "voucher": Decimal("0.00"),
                "isExpense": False,
                "expenseMethod": None,
                "expenseAmount": Decimal("0.00"),
                "signature": user_name,
            })
        else:
            if m_method in expenses:
                expenses[m_method] += m.amount
            else:
                expenses["otro"] += m.amount

            detail = f"[Egreso Manual - {m_method.title()}] {m.category}" + (f": {m.notes}" if m.notes else "")
            events.append({
                "type": "movement_out",
                "time": m.created_at,
                "id": f"mov-{m.id}",
                "detail": detail,
                "efectivo": Decimal("0.00"),
                "transferencia": Decimal("0.00"),
                "debito": Decimal("0.00"),
                "qr": Decimal("0.00"),
                "voucher": Decimal("0.00"),
                "isExpense": True,
                "expenseMethod": m_method,
                "expenseAmount": m.amount,
                "signature": user_name,
            })

    # Sort all events chronologically
    events.sort(key=lambda ev: ev["time"])

    # Calculate running physical cash balance
    running_balance = shift.initial_cash
    entries = []

    # Row 1: Initial balance
    opened_by_name = users.get(shift.opened_by, "Personal")
    entries.append({
        "id": f"init-{shift.id}",
        "type": "initial",
        "createdAt": local_iso(shift.opened_at) if shift.opened_at else None,
        "detail": "[Saldo Inicial] Fondo de caja asignado",
        "efectivo": float(shift.initial_cash),
        "transferencia": 0.0,
        "debito": 0.0,
        "qr": 0.0,
        "voucher": 0.0,
        "isExpense": False,
        "expenseMethod": None,
        "expenseAmount": 0.0,
        "runningBalance": float(running_balance),
        "signature": opened_by_name,
    })

    for ev in events:
        if ev["isExpense"]:
            if ev["expenseMethod"] == "efectivo":
                running_balance -= ev["expenseAmount"]
        else:
            running_balance += ev["efectivo"]

        entries.append({
            "id": ev["id"],
            "type": ev["type"],
            "createdAt": local_iso(ev["time"]) if ev["time"] else None,
            "detail": ev["detail"],
            "efectivo": float(ev["efectivo"]),
            "transferencia": float(ev["transferencia"]),
            "debito": float(ev["debito"]),
            "qr": float(ev["qr"]),
            "voucher": float(ev["voucher"]),
            "isExpense": ev["isExpense"],
            "expenseMethod": ev["expenseMethod"],
            "expenseAmount": float(ev["expenseAmount"]),
            "runningBalance": float(running_balance),
            "signature": ev["signature"],
        })

    # Expected physical cash in drawer:
    expected_cash = shift.initial_cash + incomes["efectivo"] - expenses["efectivo"]

    difference = None
    if shift.counted_cash is not None:
        difference = shift.counted_cash - expected_cash
    elif shift.difference is not None:
        difference = shift.difference

    total_incomes = sum(incomes.values(), Decimal("0.00"))
    total_expenses = sum(expenses.values(), Decimal("0.00"))

    closed_by_name = shift.closed_by_name or users.get(shift.closed_by)

    # If shift is closed, add final closure entry
    if shift.status == "closed":
        closure_detail = f"[Cierre de Turno] Efectivo contado: ${float(shift.counted_cash or 0):,.2f} · Dif: ${float(difference or 0):,.2f}"
        entries.append({
            "id": f"close-{shift.id}",
            "type": "closure",
            "createdAt": local_iso(shift.closed_at) if shift.closed_at else None,
            "detail": closure_detail,
            "efectivo": 0.0,
            "transferencia": 0.0,
            "debito": 0.0,
            "qr": 0.0,
            "voucher": 0.0,
            "isExpense": False,
            "expenseMethod": None,
            "expenseAmount": 0.0,
            "runningBalance": float(shift.counted_cash or running_balance),
            "signature": closed_by_name or "Personal",
        })

    total_sales = sum((p.amount for p in payments), Decimal("0.00"))
    manual_ingresos = sum((m.amount for m in movements if m.kind == "ingreso"), Decimal("0.00"))
    manual_egresos = sum((m.amount for m in movements if m.kind == "egreso"), Decimal("0.00"))

    return {
        "shift": {
            "id": shift.id,
            "status": shift.status,
            "openedBy": shift.opened_by,
            "openedByName": opened_by_name,
            "closedBy": shift.closed_by,
            "closedByName": closed_by_name,
            "openedAt": local_iso(shift.opened_at) if shift.opened_at else None,
            "closedAt": local_iso(shift.closed_at) if shift.closed_at else None,
            "initialCash": float(shift.initial_cash),
            "expectedCash": float(expected_cash),
            "countedCash": float(shift.counted_cash) if shift.counted_cash is not None else None,
            "difference": float(difference) if difference is not None else None,
            "notes": shift.notes or "",
        },
        "totals": {
            "initialCash": float(shift.initial_cash),
            "totalSales": float(total_sales),
            "cashSales": float(incomes["efectivo"]),
            "byMethod": {k: float(v) for k, v in incomes.items()},
            "incomes": {
                "efectivo": float(incomes["efectivo"]),
                "transferencia": float(incomes["transferencia"]),
                "debito": float(incomes["debito"]),
                "qr": float(incomes["qr"]),
                "voucher": float(incomes["voucher"]),
                "total": float(total_incomes),
            },
            "expenses": {
                "efectivo": float(expenses["efectivo"]),
                "transferencia": float(expenses["transferencia"]),
                "debito": float(expenses["debito"]),
                "otro": float(expenses["otro"]),
                "total": float(total_expenses),
            },
            "totalIngresos": float(manual_ingresos),
            "totalEgresos": float(manual_egresos),
            "netMovements": float(manual_ingresos - manual_egresos),
            "expectedCash": float(expected_cash),
            "countedCash": float(shift.counted_cash) if shift.counted_cash is not None else None,
            "difference": float(difference) if difference is not None else None,
            "salesCount": len(payments),
            "movementsCount": len(movements),
        },
        "entries": entries,
        "movements": [
            {
                "id": m.id,
                "shiftId": m.shift_id,
                "userId": m.user_id,
                "userName": users.get(m.user_id, "Personal"),
                "kind": m.kind,
                "method": getattr(m, "method", "efectivo") or "efectivo",
                "amount": float(m.amount),
                "category": m.category,
                "notes": m.notes,
                "createdAt": local_iso(m.created_at),
            }
            for m in movements
        ],
    }


def build_monthly_ledger(db, month: int, year: int):
    """Builds a month-wide ledger data matching the paper sheet format."""
    _, last_day = calendar.monthrange(year, month)
    start_dt = datetime(year, month, 1, 0, 0, 0)
    end_dt = datetime(year, month, last_day, 23, 59, 59)

    shifts = list(db.scalars(
        select(CashShift).where(
            and_(CashShift.opened_at >= start_dt, CashShift.opened_at <= end_dt)
        ).order_by(CashShift.opened_at)
    ))

    all_entries = []
    tot_in_ef = Decimal("0.00")
    tot_in_tr = Decimal("0.00")
    tot_in_db = Decimal("0.00")
    tot_in_qr = Decimal("0.00")
    tot_ex_ef = Decimal("0.00")
    tot_ex_tr = Decimal("0.00")

    running_balance = Decimal("0.00")
    total_sales_count = 0

    for s in shifts:
        s_summary = build_shift_summary(db, s)
        total_sales_count += s_summary["totals"]["salesCount"]

        t = s_summary["totals"]
        tot_in_ef += Decimal(str(t["incomes"]["efectivo"]))
        tot_in_tr += Decimal(str(t["incomes"]["transferencia"]))
        tot_in_db += Decimal(str(t["incomes"]["debito"]))
        tot_in_qr += Decimal(str(t["incomes"]["qr"]))
        tot_ex_ef += Decimal(str(t["expenses"]["efectivo"]))
        tot_ex_tr += Decimal(str(t["expenses"]["transferencia"]))

        # Flatten entries into monthly view
        for ent in s_summary["entries"]:
            # Format friendly date
            d_str = ent.get("createdAt", "")[:10]
            try:
                d_obj = datetime.fromisoformat(ent.get("createdAt", ""))
                date_formatted = d_obj.strftime("%d/%m")
            except Exception:
                date_formatted = d_str

            ent_copy = dict(ent)
            ent_copy["dateStr"] = date_formatted
            all_entries.append(ent_copy)
            running_balance = Decimal(str(ent.get("runningBalance", 0)))

    tot_incomes = tot_in_ef + tot_in_tr + tot_in_db + tot_in_qr
    tot_expenses = tot_ex_ef + tot_ex_tr

    month_name = MONTH_NAMES[month] if 1 <= month <= 12 else str(month)

    return {
        "month": month,
        "monthName": month_name,
        "year": year,
        "shiftsCount": len(shifts),
        "salesCount": total_sales_count,
        "entries": all_entries,
        "totals": {
            "incomes": {
                "efectivo": float(tot_in_ef),
                "transferencia": float(tot_in_tr),
                "debito": float(tot_in_db),
                "qr": float(tot_in_qr),
                "total": float(tot_incomes),
            },
            "expenses": {
                "efectivo": float(tot_ex_ef),
                "transferencia": float(tot_ex_tr),
                "total": float(tot_expenses),
            },
            "finalBalance": float(running_balance),
        }
    }


@router.get("/current")
def get_current_shift(auth=Depends(current_session), db=Depends(get_db)):
    active = db.scalar(
        select(CashShift).where(CashShift.status == "open").order_by(CashShift.opened_at.desc()).limit(1)
    )
    if not active:
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
        notes=data.notes.strip(),
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
        method=data.method,
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

    resp_name = (data.responsibleName or "").strip() or auth[0].name

    active.closed_by = auth[0].id
    active.closed_by_name = resp_name
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
def get_history(limit: int = 50, auth=Depends(current_session), db=Depends(get_db)):
    shifts = list(db.scalars(
        select(CashShift).order_by(CashShift.opened_at.desc()).limit(limit)
    ))
    return [build_shift_summary(db, s) for s in shifts]


@router.get("/shifts/{id}")
def get_shift_detail(id: str, auth=Depends(current_session), db=Depends(get_db)):
    shift = db.get(CashShift, id)
    if not shift:
        fail("Turno no encontrado.", 404)
    return build_shift_summary(db, shift)


@router.get("/monthly-sheet")
def get_monthly_sheet(month: int, year: int, auth=Depends(current_session), db=Depends(get_db)):
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        fail("Mes o año inválido.", 422)
    return build_monthly_ledger(db, month, year)


@router.get("/shifts/{id}/export.pdf")
def export_shift_pdf(id: str, auth=Depends(current_session), db=Depends(get_db)):
    shift = db.get(CashShift, id)
    if not shift:
        fail("Turno no encontrado.", 404)
    summary = build_shift_summary(db, shift)
    pdf_bytes = build_shift_pdf(summary)
    date_str = (shift.opened_at or now()).strftime("%Y-%m-%d")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="NaniFer-cierre-caja-{date_str}.pdf"'}
    )


@router.get("/monthly-sheet/export.pdf")
def export_monthly_sheet_pdf(month: int, year: int, auth=Depends(current_session), db=Depends(get_db)):
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        fail("Mes o año inválido.", 422)
    monthly_data = build_monthly_ledger(db, month, year)
    pdf_bytes = build_monthly_pdf(monthly_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="NaniFer-planilla-mensual-{year}-{month:02d}.pdf"'}
    )
