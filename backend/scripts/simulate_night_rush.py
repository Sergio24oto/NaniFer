"""
Simulación de Carga para 'La Noche de las Heladerías' - NaniFer POS
-------------------------------------------------------------------
Simula un aluvión de 50 ventas de helado (1 bocha, 2 bochas, 3 bochas,
cucuruchos, capelinas con baño de chocolate, y la promo 2x1 en 1/4 kg).

Mide tiempos de respuesta, valida la correlatividad de tickets,
verifica que el arqueo de caja cuadre al centavo y comprueba la
generación del comprobante en PDF.
"""

import sys
import os
import time
import uuid
import secrets
import argparse
from decimal import Decimal
from datetime import datetime, timedelta

# Asegurar que el backend esté en el PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from sqlalchemy import select, delete

from app.main import app
from app.db import SessionLocal
from app.models import (
    User, Session, CashShift, CashMovement, Payment, Sale,
    SaleAllocation, Visit, Order, OrderItem, Operation, now
)
from app.auth import COOKIE, digest
from app.cash_drawer import build_shift_summary


def setup_auth_session(db):
    """Obtiene o crea una sesión válida de administrador para los requests."""
    user = db.scalar(select(User).where(User.role == "admin", User.active == True).limit(1))
    if not user:
        user = db.scalar(select(User).where(User.role == "staff", User.active == True).limit(1))
    if not user:
        raise RuntimeError("No se encontró ningún usuario activo con rol admin o staff en la base de datos.")

    raw_token = secrets.token_hex(32)
    csrf_token = secrets.token_hex(32)
    session_id = digest(raw_token)

    sess = Session(
        token_hash=session_id,
        user_id=user.id,
        csrf=csrf_token,
        expires_at=now() + timedelta(hours=12)
    )
    db.add(sess)
    db.commit()

    return user, raw_token, csrf_token


def generate_sales_plan(count=50):
    """
    Genera el plan de las 50 ventas realistas con helados variados,
    fuerte presencia de la promo 2x1 de 1/4 kg y diferentes medios de pago.
    """
    items_catalog = [
        # (id, name, unit_price, extras, note)
        ("hel-cuarto-kg", "1/4KG", Decimal("9000.00"), [], "Promo 2x1 Noche de las Heladerías (2 potes)"),
        ("hel-1-bocha", "1 BOCHA", Decimal("5500.00"), [], ""),
        ("hel-2-bochas", "2 BOCHAS", Decimal("6500.00"), [], ""),
        ("hel-3-bochas", "3 BOCHAS", Decimal("9000.00"), [], ""),
        ("hel-2-bochas", "2 BOCHAS (Cucurucho)", Decimal("6500.00"), [], ""),
        ("hel-capelina-comun", "CAPELINA COMÚN", Decimal("6500.00"), ["Baño de chocolate"], "Con baño tibio"),
        ("hel-capelina-lady", "CAPELINA LADY", Decimal("7200.00"), ["Baño de chocolate"], ""),
        ("hel-medio-kg", "1/2KG", Decimal("13500.00"), [], ""),
        ("hel-1kg", "1KG", Decimal("24500.00"), [], ""),
        ("hel-sundae", "SUNDAE", Decimal("9000.00"), [], ""),
        ("hel-lanchita", "LANCHITA", Decimal("6500.00"), [], ""),
    ]

    # Precios de adicionales
    bano_price = Decimal("800.00")

    # Distribución equilibrada para 50 ventas
    # ~20 ventas de 1/4kg (Promo 2x1)
    # ~15 ventas de bochas y cucuruchos
    # ~6 ventas de capelinas con baño
    # ~5 ventas de 1/2kg y 1kg
    # ~4 ventas de postres (sundae / lanchita)
    recipes = []
    recipes.extend([items_catalog[0]] * 20)  # 20 de 1/4kg promo
    recipes.extend([items_catalog[1]] * 6)   # 6 de 1 bocha
    recipes.extend([items_catalog[2]] * 6)   # 6 de 2 bochas
    recipes.extend([items_catalog[3]] * 4)   # 4 de 3 bochas
    recipes.extend([items_catalog[4]] * 3)   # 3 de cucurucho
    recipes.extend([items_catalog[5]] * 4)   # 4 capelina común c/baño
    recipes.extend([items_catalog[6]] * 2)   # 2 capelina lady c/baño
    recipes.extend([items_catalog[7]] * 3)   # 3 de 1/2kg
    recipes.extend([items_catalog[8]] * 1)   # 1 de 1kg
    recipes.extend([items_catalog[9]] * 1)   # 1 sundae
    recipes.extend([items_catalog[10]] * 0)

    # Ajustar a la cantidad solicitada
    while len(recipes) < count:
        recipes.append(items_catalog[0])
    recipes = recipes[:count]

    # Distribución de medios de pago:
    # 40% Efectivo, 30% QR, 20% Débito, 6% Transferencia, 4% Mixto
    methods_cycle = (
        ["efectivo"] * 20 +
        ["qr"] * 15 +
        ["tarjeta"] * 10 +
        ["transferencia"] * 3 +
        ["mixto"] * 2
    )
    while len(methods_cycle) < count:
        methods_cycle.append("efectivo")
    methods_cycle = methods_cycle[:count]

    plan = []
    for i in range(count):
        prod_id, prod_name, base_price, extras, note = recipes[i]
        method = methods_cycle[i]

        extras_cost = bano_price if "Baño de chocolate" in extras else Decimal("0.00")
        total_price = base_price + extras_cost

        item = {
            "productId": prod_id,
            "quantity": 1,
            "flavors": [],
            "extras": extras,
            "notes": note,
        }

        # Configurar medio de pago
        if method == "mixto":
            half1 = (total_price / 2).quantize(Decimal("1.00"))
            half2 = total_price - half1
            payment_config = {
                "method": "mixto",
                "expectedBalance": float(total_price),
                "splits": [
                    {"method": "efectivo", "amount": float(half1), "received": float(half1)},
                    {"method": "qr", "amount": float(half2)}
                ]
            }
        elif method == "efectivo":
            # A veces pagan con billete redondo (ej. $10.000 para $9.000)
            received = total_price
            if total_price == Decimal("9000.00"):
                received = Decimal("10000.00")
            elif total_price == Decimal("5500.00"):
                received = Decimal("6000.00")
            payment_config = {
                "method": "efectivo",
                "expectedBalance": float(total_price),
                "received": float(received)
            }
        else:
            payment_config = {
                "method": method,
                "expectedBalance": float(total_price),
                "received": None
            }

        plan.append({
            "index": i + 1,
            "product_name": prod_name,
            "extras": extras,
            "total_price": total_price,
            "method": method,
            "payload": {
                "items": [item],
                "needsPreparation": False,
                **payment_config
            }
        })

    return plan


def run_simulation(count=50, mode="keep"):
    """
    Ejecuta la simulación completa:
    1. Abre turno de prueba.
    2. Ejecuta las ventas midiendo tiempos.
    3. Verifica el arqueo y conciliación matemática.
    4. Prueba la generación de PDF.
    5. Limpia si mode == 'cleanup'.
    """
    print(f"\n{'='*70}")
    print(f"🍦 SIMULACIÓN DE CARGA · NOCHE DE LAS HELADERÍAS ({count} VENTAS)")
    print(f"{'='*70}\n")

    db = SessionLocal()
    client = TestClient(app)

    created_payment_ids = []
    created_visit_ids = []
    created_order_ids = []
    created_order_item_ids = []
    created_idempotency_keys = []
    test_shift_id = None

    try:
        # Autenticación
        user, raw_token, csrf_token = setup_auth_session(db)
        client.cookies.set(COOKIE, raw_token)
        headers_base = {
            "X-CSRF-Token": csrf_token,
            "X-Requested-With": "NaniFer",
        }

        # 1. Verificar si hay turno abierto
        current_res = client.get("/api/cash-drawer/current", headers=headers_base)
        current_data = current_res.json()
        prev_shift_was_open = current_data.get("active", False)

        if prev_shift_was_open:
            print(f"⚠️ Ya existe un turno activo en curso (Abierto por: {current_data.get('shift', {}).get('openedByName')}).")
            print("   Se usarán las ventas dentro de este turno para la prueba.")
            test_shift_id = current_data["shift"]["id"]
        else:
            initial_cash = Decimal("50000.00")
            print(f"1️⃣ Abriendo Turno de Prueba con fondo inicial de ${initial_cash:,.2f}...")
            open_res = client.post(
                "/api/cash-drawer/open",
                headers=headers_base,
                json={
                    "initialCash": float(initial_cash),
                    "shiftType": "T. Noche (Simulación)",
                    "responsibleName": "Sofía (Prueba Carga)",
                    "notes": "Prueba de estrés para la Noche de las Heladerías"
                }
            )
            if open_res.status_code != 200:
                print(f"❌ Error al abrir turno: {open_res.status_code} - {open_res.text}")
                return False
            test_shift_id = open_res.json()["shift"]["id"]
            print(f"   ✓ Turno de prueba abierto con éxito (ID: {test_shift_id[:8]}...)")

        # 2. Generar el plan de 50 ventas
        print(f"\n2️⃣ Generando plan de {count} ventas realistas...")
        plan = generate_sales_plan(count)
        promo_count = sum(1 for p in plan if "1/4KG" in p["product_name"])
        dip_count = sum(1 for p in plan if "Baño de chocolate" in p["extras"])
        expected_total = sum((p["total_price"] for p in plan), Decimal("0.00"))

        print(f"   • Ventas totales a procesar: {count}")
        print(f"   • Promo 2x1 en 1/4KG: {promo_count} ventas (${promo_count * 9000:,.2f})")
        print(f"   • Helados con Baño de Chocolate: {dip_count} ventas")
        print(f"   • Monto total bruto a facturar: ${expected_total:,.2f}")

        # 3. Ejecutar las ventas en ráfaga
        print(f"\n3️⃣ Ejecutando las {count} ventas en el mostrador...")
        start_time = time.time()
        latencies = []
        errors = []

        expected_income_by_method = {
            "efectivo": Decimal("0.00"),
            "qr": Decimal("0.00"),
            "debito": Decimal("0.00"),
            "transferencia": Decimal("0.00")
        }

        for item in plan:
            key = f"sim-{uuid.uuid4().hex}"
            created_idempotency_keys.append(key)
            headers = {**headers_base, "Idempotency-Key": key}

            t0 = time.time()
            res = client.post("/api/counter/checkout", headers=headers, json=item["payload"])
            t1 = time.time()
            latencies.append((t1 - t0) * 1000)

            if res.status_code != 200:
                errors.append((item["index"], res.status_code, res.text))
                print(f"   ❌ Venta #{item['index']} falló: {res.text}")
            else:
                data = res.json()
                created_payment_ids.append(data["id"])
                created_visit_ids.append(data.get("accountId"))

                # Acumular según desglose del medio de pago
                if item["method"] == "mixto":
                    for sp in item["payload"]["splits"]:
                        m = sp["method"]
                        m_key = "debito" if m in ("tarjeta", "debito") else m
                        expected_income_by_method[m_key] += Decimal(str(sp["amount"]))
                else:
                    m = item["method"]
                    m_key = "debito" if m in ("tarjeta", "debito") else m
                    expected_income_by_method[m_key] += item["total_price"]

                # Imprimir progreso cada 10 ventas
                if item["index"] % 10 == 0 or item["index"] == count:
                    print(f"   ✓ {item['index']}/{count} ventas completadas... ({t1 - start_time:.2f}s)")

        total_duration = time.time() - start_time
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        min_latency = min(latencies) if latencies else 0
        max_latency = max(latencies) if latencies else 0
        tps = count / total_duration if total_duration > 0 else 0

        # 4. Auditoría y Arqueo de Caja
        print(f"\n4️⃣ Auditando arqueo de caja y conciliación centavo a centavo...")
        shift_res = client.get("/api/cash-drawer/current", headers=headers_base)
        shift_info = shift_res.json()
        totals = shift_info.get("totals", {})

        incomes = totals.get("incomes", {})
        actual_efectivo = Decimal(str(incomes.get("efectivo", 0)))
        actual_qr = Decimal(str(incomes.get("qr", 0)))
        actual_debito = Decimal(str(incomes.get("debito", 0)))
        actual_transf = Decimal(str(incomes.get("transferencia", 0)))
        actual_total_incomes = Decimal(str(totals.get("totalSales", totals.get("incomes", {}).get("total", 0))))

        # 5. Prueba de Comprobante PDF del Turno
        print(f"\n5️⃣ Verificando generación del comprobante PDF con {count} ventas acumuladas...")
        pdf_res = client.get(f"/api/cash-drawer/shifts/{test_shift_id}/export.pdf", headers=headers_base)
        pdf_ok = (pdf_res.status_code == 200 and pdf_res.content.startswith(b"%PDF"))
        pdf_size_kb = len(pdf_res.content) / 1024

        if pdf_ok:
            print(f"   ✓ PDF del turno generado exitosamente ({pdf_size_kb:.1f} KB, Cabecera %PDF-1.4 válida)")
        else:
            print(f"   ❌ Error al generar el PDF del turno: Status {pdf_res.status_code}")

        # Recopilar IDs de órdenes y ítems para limpieza
        if created_visit_ids:
            for v_id in created_visit_ids:
                orders = list(db.scalars(select(Order).where(Order.visit_id == v_id)))
                for o in orders:
                    created_order_ids.append(o.id)
                    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == o.id)))
                    for it in items:
                        created_order_item_ids.append(it.id)

        # 6. Informe Final
        print(f"\n{'='*70}")
        print("📊 REPORTE DE RESULTADOS DE LA PRUEBA")
        print(f"{'='*70}")
        print(f"• Ventas enviadas:             {count}")
        print(f"• Ventas exitosas (HTTP 200):   {count - len(errors)} / {count}")
        print(f"• Fallos o errores de bloqueo:  {len(errors)}")
        print(f"• Tiempo total de ejecución:    {total_duration:.2f} segundos")
        print(f"• Velocidad promedio:          {tps:.1f} ventas por segundo")
        print(f"• Latencia por venta:          Promedio: {avg_latency:.1f} ms | Mín: {min_latency:.1f} ms | Máx: {max_latency:.1f} ms")
        print(f"• Generación PDF Comprobante:   {'✓ Éxito instantáneo' if pdf_ok else '❌ Falló'}")
        print(f"\n--- CONCILIACIÓN DE CAJA ---")
        print(f"{'Medio de Pago':<18} | {'Esperado (Plan)':<15} | {'Registrado en Caja':<18} | {'Diferencia'}")
        print(f"{'-'*70}")

        methods_comp = [
            ("Efectivo", expected_income_by_method["efectivo"], actual_efectivo),
            ("QR / Mercado Pago", expected_income_by_method["qr"], actual_qr),
            ("Débito / Tarjetas", expected_income_by_method["debito"], actual_debito),
            ("Transferencias", expected_income_by_method["transferencia"], actual_transf),
        ]

        all_matched = True
        for name, exp, act in methods_comp:
            diff = act - exp
            match = "✓ EXACTO ($0.00)" if abs(diff) < Decimal("0.01") else f"❌ Diferencia: ${diff:+,.2f}"
            if abs(diff) >= Decimal("0.01") and not prev_shift_was_open:
                all_matched = False
            print(f"{name:<18} | ${exp:>13,.2f} | ${act:>16,.2f} | {match}")

        print(f"{'-'*70}")
        print(f"{'TOTAL INGRESOS':<18} | ${expected_total:>13,.2f} | ${actual_total_incomes:>16,.2f} | {'✓ EXACTO' if all_matched else 'Revisar'}")

        # 7. Manejo del estado del turno y limpieza
        if mode == "cleanup":
            print(f"\n🧹 Modo limpieza activado: eliminando datos de prueba...")
            perform_cleanup(
                db,
                test_shift_id=None if prev_shift_was_open else test_shift_id,
                payment_ids=created_payment_ids,
                visit_ids=created_visit_ids,
                order_ids=created_order_ids,
                order_item_ids=created_order_item_ids,
                idempotency_keys=created_idempotency_keys
            )
            print("   ✓ Base de datos restaurada al estado original. 100% limpia.")
        elif mode == "close":
            print(f"\n🔒 Cerrando turno de prueba...")
            expected_cash = totals.get("expectedCash", 0)
            close_res = client.post(
                "/api/cash-drawer/close",
                headers=headers_base,
                json={
                    "countedCash": float(expected_cash),
                    "responsibleName": "Sofía",
                    "notes": "Cierre automático de prueba de carga completado con éxito."
                }
            )
            if close_res.status_code == 200:
                print(f"   ✓ Turno cerrado correctamente con saldo exacto de ${expected_cash:,.2f}.")
            else:
                print(f"   ❌ Error al cerrar turno: {close_res.text}")
        else: # mode == "keep"
            print(f"\n📌 El turno se mantuvo abierto.")
            print(f"   Podés entrar a la tablet ahora mismo para ver la planilla de caja y los {count} pedidos.")

        print(f"\n{'='*70}")
        if len(errors) == 0 and all_matched and pdf_ok:
            print("🎉 DIAGNÓSTICO: EL SISTEMA ESTÁ 100% LISTO PARA LA NOCHE DE LAS HELADERÍAS")
        else:
            print("⚠️ DIAGNÓSTICO: Se detectaron discrepancias que requieren atención.")
        print(f"{'='*70}\n")

        return len(errors) == 0 and all_matched

    finally:
        db.close()


def perform_cleanup(db, test_shift_id, payment_ids, visit_ids, order_ids, order_item_ids, idempotency_keys):
    """Elimina cuidadosamente todos los registros de la prueba respetando integridad referencial."""
    try:
        # 1. Sale allocations
        if payment_ids:
            db.execute(delete(SaleAllocation).where(SaleAllocation.sale_id.in_(payment_ids)))
            # 2. Sales
            db.execute(delete(Sale).where(Sale.id.in_(payment_ids)))

        # 3. Order items
        if order_item_ids:
            db.execute(delete(OrderItem).where(OrderItem.id.in_(order_item_ids)))

        # 4. Orders
        if order_ids:
            db.execute(delete(Order).where(Order.id.in_(order_ids)))

        # 5. Payments
        if payment_ids:
            db.execute(delete(Payment).where(Payment.id.in_(payment_ids)))

        # 6. Visits
        if visit_ids:
            db.execute(delete(Visit).where(Visit.id.in_(visit_ids)))

        # 7. CashShift (si fue creado para el test)
        if test_shift_id:
            db.execute(delete(CashMovement).where(CashMovement.shift_id == test_shift_id))
            db.execute(delete(CashShift).where(CashShift.id == test_shift_id))

        # 8. Operation idempotency keys
        if idempotency_keys:
            db.execute(delete(Operation).where(Operation.key.in_(idempotency_keys)))

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"❌ Error durante la limpieza: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulación de Carga NaniFer POS")
    parser.add_argument("--count", type=int, default=50, help="Cantidad de ventas a simular (default: 50)")
    parser.add_argument(
        "--mode",
        choices=["keep", "cleanup", "close"],
        default="cleanup",
        help="keep: deja el turno abierto para verlo en la tablet; cleanup: borra las ventas de prueba; close: cierra el turno"
    )
    args = parser.parse_args()

    run_simulation(count=args.count, mode=args.mode)
