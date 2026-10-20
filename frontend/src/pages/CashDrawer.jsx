import React, { useState, useEffect } from "react";
import { Modal } from "../components";
import { money } from "../domain";
import { useStore, request } from "../store";
import { Banknote, PlusCircle, MinusCircle, Lock, Unlock, History, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import "../cash-drawer.css";

const EGRESO_CATEGORIES = [
  "Verdulería / Frutas",
  "Panadería / Facturas",
  "Lácteos / Fiambres",
  "Insumos / Limpieza",
  "Proveedores / Reparto",
  "Retiro",
  "Otro egreso",
];

const INGRESO_CATEGORIES = [
  "Vuelto de compras",
  "Aporte de cambio",
  "Cobro extraordinario",
  "Otro ingreso",
];

export default function CashDrawer() {
  const s = useStore();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Open shift form
  const [openInitial, setOpenInitial] = useState("20000");
  const [openNotes, setOpenNotes] = useState("");

  // Movement form
  const [moveKind, setMoveKind] = useState("egreso"); // "egreso" | "ingreso"
  const [moveAmount, setMoveAmount] = useState("");
  const [moveCategory, setMoveCategory] = useState("Verdulería / Frutas");
  const [moveNotes, setMoveNotes] = useState("");

  // Close shift form (Arqueo)
  const [closeCounted, setCloseCounted] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  async function loadCurrent() {
    try {
      setError("");
      const res = await request("/cash-drawer/current");
      setData(res);
    } catch (e) {
      setError(e.message || "Error al consultar estado de caja");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const res = await request("/cash-drawer/history?limit=25");
      setHistory(res);
    } catch (e) {
      console.error("Error al cargar historial", e);
    }
  }

  useEffect(() => {
    loadCurrent();
    const timer = setInterval(loadCurrent, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleOpenShift(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await request("/cash-drawer/open", {
        method: "POST",
        body: {
          initialCash: Number(openInitial) || 0,
          notes: openNotes.trim(),
        },
      });
      setData(res);
      setShowOpenModal(false);
      setOpenNotes("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMovement(e) {
    e.preventDefault();
    if (busy) return;
    const amountNum = Number(moveAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Ingresá un importe válido mayor a 0.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await request("/cash-drawer/movements", {
        method: "POST",
        body: {
          kind: moveKind,
          amount: amountNum,
          category: moveCategory,
          notes: moveNotes.trim(),
        },
      });
      setData(res);
      setShowMoveModal(false);
      setMoveAmount("");
      setMoveNotes("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseShift(e) {
    e.preventDefault();
    if (busy) return;
    const countedNum = Number(closeCounted);
    if (!Number.isFinite(countedNum) || countedNum < 0) {
      setError("Ingresá el importe de efectivo contado.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await request("/cash-drawer/close", {
        method: "POST",
        body: {
          countedCash: countedNum,
          notes: closeNotes.trim(),
        },
      });
      setData(res);
      setShowCloseModal(false);
      setCloseCounted("");
      setCloseNotes("");
      loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <main className="cash-drawer-main">
        <p>Cargando información de caja…</p>
      </main>
    );
  }

  const isOpen = data?.active;
  const shift = data?.shift;
  const totals = data?.totals;
  const movements = data?.movements || [];

  // Live calculation for Arqueo modal
  const expectedForClose = totals?.expectedCash || 0;
  const countedNum = Number(closeCounted);
  const diffClose = Number.isFinite(countedNum) && closeCounted !== ""
    ? Math.round((countedNum - expectedForClose) * 100) / 100
    : null;

  return (
    <main className="cash-drawer-main">
      <div className="cash-header">
        <div className="cash-header-title">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Banknote size={32} color="#624335" />
            <h1>Caja y Turnos</h1>
          </div>
          <p>Control de efectivo, arqueos y movimientos extraordinarios del turno.</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`cash-status-tag ${isOpen ? "open" : "closed"}`}>
            <span className="cash-status-dot" />
            {isOpen ? "Caja Abierta" : "Caja Cerrada"}
          </span>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              loadHistory();
              setShowHistoryModal(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <History size={16} />
            Historial de cierres
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {!isOpen ? (
        <div className="cash-banner-closed">
          <h2>No hay ninguna caja abierta en este momento</h2>
          <p>
            Al abrir caja, las mozas pueden definir el fondo inicial de cambio. Todas las ventas en efectivo y cobros se sumarán automáticamente.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => setShowOpenModal(true)}
            style={{ padding: "12px 24px", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Unlock size={20} />
            Abrir turno de caja
          </button>
        </div>
      ) : (
        <>
          {/* Active Shift Stats Cards */}
          <div className="cash-cards-grid">
            <div className="cash-stat-card primary-highlight">
              <div className="cash-stat-card-label">💵 Efectivo Esperado en Gaveta</div>
              <div className="cash-stat-card-amount">
                {money(totals?.expectedCash || 0)}
              </div>
              <div className="cash-stat-card-detail">
                Fondo inicial: <strong>{money(shift?.initialCash || 0)}</strong>
                <br />
                Ventas efectivo: <strong>+{money(totals?.cashSales || 0)}</strong>
                <br />
                Movimientos netos: <strong>{totals?.netMovements >= 0 ? "+" : ""}{money(totals?.netMovements || 0)}</strong>
              </div>
            </div>

            <div className="cash-stat-card">
              <div className="cash-stat-card-label">📈 Total Ventas del Turno</div>
              <div className="cash-stat-card-amount">
                {money(totals?.totalSales || 0)}
              </div>
              <div className="cash-stat-card-detail">
                {totals?.salesCount} cobros registrados:
                <br />
                📱 QR / MP: <strong>{money(totals?.byMethod?.qr || 0)}</strong>
                <br />
                💵 Efectivo: <strong>{money(totals?.byMethod?.efectivo || 0)}</strong>
                <br />
                💳 Tarjeta: <strong>{money(totals?.byMethod?.tarjeta || 0)}</strong> · 🏦 Transf: <strong>{money(totals?.byMethod?.transferencia || 0)}</strong>
              </div>
            </div>

            <div className="cash-stat-card">
              <div className="cash-stat-card-label">🔄 Movimientos Extraordinarios</div>
              <div className="cash-stat-card-amount" style={{ color: totals?.netMovements < 0 ? "#a3321d" : "#276738" }}>
                {totals?.netMovements >= 0 ? "+" : ""}{money(totals?.netMovements || 0)}
              </div>
              <div className="cash-stat-card-detail">
                Salidas (Egresos): <strong style={{ color: "#a3321d" }}>-{money(totals?.totalEgresos || 0)}</strong>
                <br />
                Entradas (Ingresos): <strong style={{ color: "#276738" }}>+{money(totals?.totalIngresos || 0)}</strong>
                <br />
                {movements.length} movimientos en este turno
              </div>
            </div>

            <div className="cash-stat-card">
              <div className="cash-stat-card-label">ℹ️ Información del Turno</div>
              <div style={{ fontSize: 13, color: "#624335", marginTop: 4 }}>
                <strong>Abierto por:</strong> {shift?.openedByName}
                <br />
                <strong>Hora inicio:</strong> {formatDateTime(shift?.openedAt)}
                {shift?.notes && (
                  <>
                    <br />
                    <strong>Nota:</strong> {shift.notes}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="cash-actions-bar">
            <button
              type="button"
              className="cash-btn-movement"
              onClick={() => {
                setMoveKind("egreso");
                setMoveCategory("Verdulería / Frutas");
                setShowMoveModal(true);
              }}
            >
              <MinusCircle size={18} />
              Registrar Egreso (Sacar dinero)
            </button>

            <button
              type="button"
              className="cash-btn-movement"
              style={{ background: "#276738" }}
              onClick={() => {
                setMoveKind("ingreso");
                setMoveCategory("Vuelto de compras");
                setShowMoveModal(true);
              }}
            >
              <PlusCircle size={18} />
              Registrar Ingreso (Entrar dinero / Vuelto)
            </button>

            <button
              type="button"
              className="cash-btn-close"
              onClick={() => {
                setCloseCounted(String(totals?.expectedCash || ""));
                setShowCloseModal(true);
              }}
            >
              <Lock size={18} />
              Cerrar Turno (Arqueo de Caja)
            </button>
          </div>

          {/* Movements table */}
          <div className="cash-section">
            <div className="cash-section-header">
              <h2>Movimientos de Efectivo del Turno Actual</h2>
              <span style={{ fontSize: 13, color: "#866b56" }}>
                {movements.length} registro{movements.length === 1 ? "" : "s"}
              </span>
            </div>

            {movements.length === 0 ? (
              <p style={{ color: "#866b56", fontStyle: "italic", margin: "10px 0" }}>
                No se registraron movimientos extraordinarios en este turno todavía.
              </p>
            ) : (
              <div className="cash-table-wrapper">
                <table className="cash-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Responsable</th>
                      <th>Categoría</th>
                      <th>Detalle / Justificación</th>
                      <th style={{ textAlign: "right" }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td>{formatDateTime(m.createdAt)}</td>
                        <td>
                          <span
                            className={
                              m.kind === "egreso"
                                ? "cash-tag-egreso"
                                : "cash-tag-ingreso"
                            }
                          >
                            {m.kind === "egreso" ? "SALIDA" : "ENTRADA"}
                          </span>
                        </td>
                        <td>{m.userName}</td>
                        <td>
                          <strong>{m.category}</strong>
                        </td>
                        <td>{m.notes || "-"}</td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: m.kind === "egreso" ? "#a3321d" : "#276738",
                          }}
                        >
                          {m.kind === "egreso" ? "-" : "+"}
                          {money(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Abrir Turno */}
      {showOpenModal && (
        <Modal title="Abrir Turno de Caja" onClose={() => setShowOpenModal(false)}>
          <form onSubmit={handleOpenShift}>
            <p style={{ margin: "0 0 16px 0", color: "#624335" }}>
              Ingresá el importe de cambio con el que se inicia la jornada en la gaveta.
            </p>

            <label>
              Fondo inicial de cambio ($)
              <input
                type="number"
                min="0"
                step="100"
                required
                value={openInitial}
                onChange={(e) => setOpenInitial(e.target.value)}
                placeholder="Ej: 20000"
              />
            </label>

            <div className="quick-amount-chips">
              <span>Sugerencias rápidas:</span>
              {[0, 10000, 15000, 20000, 30000, 50000].map((val) => (
                <button
                  type="button"
                  key={val}
                  className="quick-amount-chip"
                  onClick={() => setOpenInitial(String(val))}
                >
                  {money(val)}
                </button>
              ))}
            </div>

            <label style={{ marginTop: 12 }}>
              Observaciones (opcional)
              <input
                type="text"
                placeholder="Ej: Turno Mañana / Caja 1"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="primary full"
              disabled={busy}
              style={{ marginTop: 20 }}
            >
              {busy ? "Abriendo caja…" : "Confirmar apertura de caja"}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal Registrar Movimiento (Egreso / Ingreso) */}
      {showMoveModal && (
        <Modal
          title={
            moveKind === "egreso"
              ? "Registrar Egreso de Dinero"
              : "Registrar Ingreso de Dinero"
          }
          onClose={() => setShowMoveModal(false)}
        >
          <form onSubmit={handleAddMovement}>
            <div className="movement-kind-selector">
              <button
                type="button"
                className={moveKind === "egreso" ? "active-egreso" : ""}
                onClick={() => {
                  setMoveKind("egreso");
                  setMoveCategory("Verdulería / Frutas");
                }}
              >
                🔴 Egreso (Sacar dinero)
              </button>
              <button
                type="button"
                className={moveKind === "ingreso" ? "active-ingreso" : ""}
                onClick={() => {
                  setMoveKind("ingreso");
                  setMoveCategory("Vuelto de compras");
                }}
              >
                🟢 Ingreso (Entrada / Vuelto)
              </button>
            </div>

            <label>
              Importe ($)
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value)}
              />
            </label>

            <label style={{ marginTop: 12 }}>
              Categoría
              <div className="category-chips">
                {(moveKind === "egreso" ? EGRESO_CATEGORIES : INGRESO_CATEGORIES).map(
                  (cat) => (
                    <button
                      type="button"
                      key={cat}
                      className={`category-chip ${moveCategory === cat ? "selected" : ""}`}
                      onClick={() => setMoveCategory(cat)}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
            </label>

            <label style={{ marginTop: 12 }}>
              Motivo o Detalle (Justificación)
              <textarea
                rows={2}
                placeholder={
                  moveKind === "egreso"
                    ? "Ej: Compra de 22mil para bananas y demás en verdulería"
                    : "Ej: Vuelto de la compra de verdulería con ticket"
                }
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
              />
            </label>

            <small style={{ display: "block", color: "#866b56", marginTop: 8 }}>
              {moveKind === "egreso"
                ? "Este importe se restará del saldo esperado en gaveta."
                : "Este importe se sumará al saldo esperado en gaveta."}
            </small>

            <button
              type="submit"
              className="primary full"
              disabled={busy}
              style={{ marginTop: 18 }}
            >
              {busy
                ? "Guardando movimiento…"
                : moveKind === "egreso"
                ? "Confirmar salida de dinero"
                : "Confirmar entrada de dinero"}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal Cerrar Turno (Arqueo de Caja) */}
      {showCloseModal && (
        <Modal title="Cerrar Turno · Arqueo de Caja" onClose={() => setShowCloseModal(false)}>
          <form onSubmit={handleCloseShift}>
            <p style={{ margin: "0 0 14px 0", color: "#624335" }}>
              Verificá el dinero físico en la gaveta contra los registros del sistema.
            </p>

            <div className="arqueo-breakdown">
              <div className="arqueo-row">
                <span>Fondo inicial de cambio:</span>
                <strong>{money(shift?.initialCash || 0)}</strong>
              </div>
              <div className="arqueo-row">
                <span>+ Ventas cobradas en efectivo:</span>
                <strong style={{ color: "#276738" }}>+{money(totals?.cashSales || 0)}</strong>
              </div>
              <div className="arqueo-row">
                <span>+ Ingresos extraordinarios (vueltos, etc.):</span>
                <strong style={{ color: "#276738" }}>+{money(totals?.totalIngresos || 0)}</strong>
              </div>
              <div className="arqueo-row">
                <span>- Egresos extraordinarios (compras, etc.):</span>
                <strong style={{ color: "#a3321d" }}>-{money(totals?.totalEgresos || 0)}</strong>
              </div>
              <div className="arqueo-row total-expected">
                <span>Total de Efectivo Esperado:</span>
                <strong>{money(expectedForClose)}</strong>
              </div>
            </div>

            <label>
              Efectivo físico contado en la gaveta ($)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={closeCounted}
                onChange={(e) => setCloseCounted(e.target.value)}
                placeholder="Importe total de billetes y monedas"
              />
            </label>

            {diffClose !== null && (
              <div
                className={`arqueo-diff-box ${
                  diffClose === 0 ? "exact" : diffClose < 0 ? "negative" : "positive"
                }`}
              >
                {diffClose === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={18} />
                    <strong>✓ Caja perfecta: El dinero contado coincide exactamente con el sistema.</strong>
                  </div>
                ) : diffClose < 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={18} />
                    <strong>Faltante de caja: {money(Math.abs(diffClose))} (hay menos dinero del esperado).</strong>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={18} />
                    <strong>Sobrante de caja: +{money(diffClose)} (hay más dinero del esperado).</strong>
                  </div>
                )}
              </div>
            )}

            <label style={{ marginTop: 14 }}>
              Observaciones de cierre (opcional)
              <input
                type="text"
                placeholder="Ej: Justificación de diferencia, entrega de dinero a encargado, etc."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="primary full"
              disabled={busy}
              style={{ marginTop: 20, background: "#a3321d" }}
            >
              {busy ? "Cerrando turno…" : "Confirmar Cierre de Caja y Arqueo"}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal Historial de Turnos Anteriores */}
      {showHistoryModal && (
        <Modal title="Historial de Cierres de Turno" onClose={() => setShowHistoryModal(false)}>
          {history.length === 0 ? (
            <p style={{ color: "#866b56" }}>No hay turnos anteriores registrados.</p>
          ) : (
            <div className="cash-table-wrapper" style={{ maxHeight: "65vh", overflowY: "auto" }}>
              <table className="cash-table">
                <thead>
                  <tr>
                    <th>Apertura / Cierre</th>
                    <th>Responsable</th>
                    <th>Ventas Totales</th>
                    <th>Efectivo Esperado</th>
                    <th>Efectivo Contado</th>
                    <th>Diferencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const s = h.shift;
                    const diff = s.difference;
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{formatDateTime(s.openedAt)}</strong>
                          <br />
                          <small style={{ color: "#866b56" }}>
                            Cierre: {formatDateTime(s.closedAt)}
                          </small>
                        </td>
                        <td>
                          {s.openedByName}
                          {s.closedByName && s.closedByName !== s.openedByName && (
                            <>
                              <br />
                              <small style={{ color: "#866b56" }}>
                                Cerró: {s.closedByName}
                              </small>
                            </>
                          )}
                        </td>
                        <td>
                          <strong>{money(h.totals.totalSales)}</strong>
                          <br />
                          <small style={{ color: "#866b56" }}>
                            Ef: {money(h.totals.cashSales)}
                          </small>
                        </td>
                        <td>{money(s.expectedCash)}</td>
                        <td>{s.countedCash != null ? money(s.countedCash) : "-"}</td>
                        <td>
                          {diff == null ? (
                            "-"
                          ) : diff === 0 ? (
                            <span style={{ color: "#137333", fontWeight: 700 }}>$0 (Exacto)</span>
                          ) : diff < 0 ? (
                            <span style={{ color: "#a3321d", fontWeight: 700 }}>
                              -{money(Math.abs(diff))}
                            </span>
                          ) : (
                            <span style={{ color: "#b06000", fontWeight: 700 }}>
                              +{money(diff)}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`cash-status-tag ${s.status === "open" ? "open" : "closed"}`}>
                            {s.status === "open" ? "Abierta" : "Cerrada"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
