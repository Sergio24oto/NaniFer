import React, { useState, useEffect } from "react";
import { Modal } from "../components";
import { money } from "../domain";
import { useStore, request } from "../store";
import {
  Banknote,
  PlusCircle,
  MinusCircle,
  Lock,
  Unlock,
  History,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  FileText,
  Search,
  Receipt
} from "lucide-react";
import "../cash-drawer.css";

const EGRESO_CATEGORIES = [
  "Verdulería / Frutas",
  "Panadería / Facturas",
  "Lácteos / Fiambres",
  "Insumos / Limpieza",
  "Proveedores / Reparto",
  "Retiro de caja",
  "Otro egreso",
];

const INGRESO_CATEGORIES = [
  "Vuelto de compras",
  "Aporte de cambio",
  "Cobro extraordinario",
  "Otro ingreso",
];

const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function formatTime(isoStr) {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function formatDateTimeShort(isoStr) {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hours}:${mins}`;
  } catch {
    return isoStr;
  }
}

export default function CashDrawer() {
  const s = useStore();
  const [activeTab, setActiveTab] = useState("today"); // "today" | "history"

  // Live Shift State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closedReceipt, setClosedReceipt] = useState(null);
  const [viewingPastShift, setViewingPastShift] = useState(null);

  // Open shift form
  const [openInitial, setOpenInitial] = useState("10000");
  const [openNotes, setOpenNotes] = useState("");

  // Movement form
  const [moveKind, setMoveKind] = useState("egreso"); // "egreso" | "ingreso"
  const [moveAmount, setMoveAmount] = useState("");
  const [moveCategory, setMoveCategory] = useState("Verdulería / Frutas");
  const [moveMethod, setMoveMethod] = useState("efectivo"); // "efectivo" | "transferencia" | "debito"
  const [moveNotes, setMoveNotes] = useState("");

  // Close shift form (Arqueo)
  const [closeCounted, setCloseCounted] = useState("");
  const [closeResponsible, setCloseResponsible] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // History Tab State
  const [historySubTab, setHistorySubTab] = useState("monthly"); // "monthly" | "shifts"
  const currentDate = new Date();
  const [selMonth, setSelMonth] = useState(currentDate.getMonth() + 1);
  const [selYear, setSelYear] = useState(currentDate.getFullYear());
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [shiftsHistory, setShiftsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  async function loadCurrent() {
    try {
      const res = await request("/cash-drawer/current");
      setData(res);
      if (res?.active && !closeResponsible) {
        setCloseResponsible(s.user?.name || "");
      }
    } catch (e) {
      setError(e.message || "Error al consultar estado de caja");
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthly() {
    try {
      setLoadingMonthly(true);
      const res = await request(`/cash-drawer/monthly-sheet?month=${selMonth}&year=${selYear}`);
      setMonthlyData(res);
    } catch (e) {
      console.error("Error al cargar planilla mensual", e);
    } finally {
      setLoadingMonthly(false);
    }
  }

  async function loadHistoryShifts() {
    try {
      setLoadingHistory(true);
      const res = await request("/cash-drawer/history?limit=60");
      setShiftsHistory(res);
    } catch (e) {
      console.error("Error al cargar historial", e);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadCurrent();
    const timer = setInterval(() => {
      if (activeTab === "today") loadCurrent();
    }, 6000);
    return () => clearInterval(timer);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "history") {
      if (historySubTab === "monthly") {
        loadMonthly();
      } else {
        loadHistoryShifts();
      }
    }
  }, [activeTab, historySubTab, selMonth, selYear]);

  // Open Shift
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
      setClosedReceipt(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Register Movement
  async function handleAddMovement(e) {
    e.preventDefault();
    if (busy) return;
    const amt = Number(moveAmount);
    if (!amt || amt <= 0) {
      alert("Por favor ingresá un importe válido mayor a 0.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await request("/cash-drawer/movements", {
        method: "POST",
        body: {
          kind: moveKind,
          amount: amt,
          category: moveCategory,
          method: moveMethod,
          notes: moveNotes.trim(),
        },
      });
      setData(res);
      setShowMoveModal(false);
      setMoveAmount("");
      setMoveNotes("");
      setMoveMethod("efectivo");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Close Shift
  async function handleCloseShift(e) {
    e.preventDefault();
    if (busy) return;
    const respName = closeResponsible.trim() || s.user?.name || "Personal";
    setBusy(true);
    setError("");
    try {
      const res = await request("/cash-drawer/close", {
        method: "POST",
        body: {
          countedCash: Number(closeCounted) || 0,
          responsibleName: respName,
          notes: closeNotes.trim(),
        },
      });
      setData(res);
      setClosedReceipt(res?.lastShift || res);
      setShowCloseModal(false);
      setCloseCounted("");
      setCloseNotes("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // PDF Downloads
  async function downloadShiftPdf(shiftId) {
    if (!shiftId) return;
    try {
      const blob = await request(`/cash-drawer/shifts/${shiftId}/export.pdf`, { asBlob: true });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NaniFer-cierre-caja-${shiftId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("No se pudo generar el PDF: " + err.message);
    }
  }

  async function downloadMonthlyPdf() {
    try {
      const blob = await request(`/cash-drawer/monthly-sheet/export.pdf?month=${selMonth}&year=${selYear}`, { asBlob: true });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NaniFer-planilla-mensual-${selYear}-${String(selMonth).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("No se pudo generar la planilla mensual: " + err.message);
    }
  }

  if (loading) {
    return (
      <main className="cash-drawer-main">
        <p style={{ textAlign: "center", padding: "40px", color: "#8c6e58" }}>
          Cargando estado de caja…
        </p>
      </main>
    );
  }

  const isOpen = Boolean(data?.active);
  const shift = data?.shift || data?.lastShift?.shift;
  const totals = data?.totals || data?.lastShift?.totals;
  const entries = data?.entries || data?.lastShift?.entries || [];

  const expectedCash = totals?.expectedCash || 0;
  const countedNum = Number(closeCounted || 0);
  const diffCalculated = countedNum - expectedCash;

  return (
    <main className="cash-drawer-main">
      {/* Top Header */}
      <div className="cash-header">
        <div className="cash-header-title">
          <Banknote size={32} color="#624335" />
          <div>
            <h1>Planilla de Caja Diaria</h1>
            <p>Control de ingresos por medio de pago, egresos, saldo físico y arqueos de turno.</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`cash-status-tag ${isOpen ? "open" : "closed"}`}>
            <span className="cash-status-dot" />
            {isOpen ? "Caja Abierta" : "Caja Cerrada"}
          </span>
        </div>
      </div>

      {/* Main Section Navigation Tabs */}
      <div className="cash-nav-tabs">
        <button
          type="button"
          className={`cash-tab-btn ${activeTab === "today" ? "active" : ""}`}
          onClick={() => setActiveTab("today")}
        >
          <Receipt size={18} />
          Caja del Día (Turno Actual)
        </button>

        <button
          type="button"
          className={`cash-tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <History size={18} />
          Historial de Caja y Planillas Mensuales
        </button>
      </div>

      {error && (
        <div className="alert" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* =========================================================================
          TAB 1: CAJA DEL DÍA (TURNO ACTUAL)
          ========================================================================= */}
      {activeTab === "today" && (
        <>
          {/* Post-closing banner / success receipt */}
          {closedReceipt && !isOpen && (
            <div
              className="panel"
              style={{
                background: "#f0fdf4",
                border: "2px solid #86efac",
                borderRadius: 12,
                padding: "20px 24px",
                marginBottom: 24,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16
              }}
            >
              <div>
                <strong style={{ color: "#166534", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={20} />
                  ¡Cierre de Turno Guardado con Éxito!
                </strong>
                <p style={{ margin: "6px 0 0", color: "#14532d", fontSize: 13.5 }}>
                  Responsable: <strong>{closedReceipt.shift?.closedByName || "Personal"}</strong> ·
                  Efectivo contado: <strong>{money(closedReceipt.shift?.countedCash)}</strong> ·
                  Diferencia: <strong>{closedReceipt.shift?.difference === 0 ? "Sin diferencia ($0)" : money(closedReceipt.shift?.difference)}</strong>
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="cash-btn-pdf"
                  onClick={() => downloadShiftPdf(closedReceipt.shift?.id)}
                >
                  <Download size={16} />
                  Descargar Comprobante PDF
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setOpenInitial(String(closedReceipt.shift?.countedCash || "10000"));
                    setShowOpenModal(true);
                  }}
                >
                  <Unlock size={16} />
                  Abrir nuevo turno (Cambio de moza)
                </button>
              </div>
            </div>
          )}

          {!isOpen ? (
            <div className="cash-banner-closed">
              <h2>No hay ninguna caja abierta en este momento</h2>
              <p>
                Al abrir la caja, las ventas y cobros en el salón y mostrador se registrarán automáticamente.
                El sistema calculará el saldo físico exacto discriminando efectivo de transferencias y tarjetas.
              </p>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setOpenInitial(String(data?.lastShift?.shift?.countedCash || "10000"));
                  setShowOpenModal(true);
                }}
                style={{ padding: "12px 26px", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Unlock size={20} />
                Abrir turno de caja
              </button>

              {data?.lastShift && (
                <div style={{ marginTop: 24, padding: "14px", background: "#ffffff", borderRadius: 8, display: "inline-block", border: "1px solid #e7ded5" }}>
                  <span style={{ fontSize: 13, color: "#7a5b48" }}>
                    Último cierre registrado: <strong>{formatDateTimeShort(data.lastShift.shift.closedAt)}</strong> por <strong>{data.lastShift.shift.closedByName || "Personal"}</strong> (Efectivo en gaveta: {money(data.lastShift.shift.countedCash)})
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Action Buttons Bar */}
              <div className="cash-actions-bar">
                <button
                  type="button"
                  className="cash-btn-movement"
                  onClick={() => {
                    setMoveKind("egreso");
                    setMoveCategory("Verdulería / Frutas");
                    setMoveMethod("efectivo");
                    setShowMoveModal(true);
                  }}
                >
                  <MinusCircle size={18} />
                  Registrar Egreso (Gasto / Retiro)
                </button>

                <button
                  type="button"
                  className="cash-btn-movement"
                  style={{ background: "#15803d" }}
                  onClick={() => {
                    setMoveKind("ingreso");
                    setMoveCategory("Vuelto de compras");
                    setMoveMethod("efectivo");
                    setShowMoveModal(true);
                  }}
                >
                  <PlusCircle size={18} />
                  Registrar Ingreso (Extra / Vuelto)
                </button>

                <button
                  type="button"
                  className="cash-btn-pdf"
                  onClick={() => downloadShiftPdf(shift?.id)}
                >
                  <Download size={16} />
                  Descargar Planilla Diaria (PDF)
                </button>

                <button
                  type="button"
                  className="cash-btn-close"
                  onClick={() => {
                    setCloseCounted(String(totals?.expectedCash || ""));
                    setCloseResponsible(s.user?.name || "");
                    setShowCloseModal(true);
                  }}
                >
                  <Lock size={18} />
                  FINALIZAR CIERRE DE CAJA
                </button>
              </div>

              {/* 3-Part Summary Block: INGRESOS, EGRESOS, RESULTADO DE CAJA FÍSICA */}
              <div className="cash-summary-triad">
                {/* 1. INGRESOS */}
                <div className="cash-summary-card incomes">
                  <div className="cash-summary-header">
                    <span>📥 Ingresos del Turno</span>
                    <span>{totals?.salesCount || 0} ventas</span>
                  </div>
                  <div className="cash-summary-row">
                    <span>Efectivo:</span>
                    <strong>{money(totals?.incomes?.efectivo || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>Transferencias:</span>
                    <strong>{money(totals?.incomes?.transferencia || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>Débito / Tarjetas:</span>
                    <strong>{money(totals?.incomes?.debito || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>QR / Mercado Pago:</span>
                    <strong>{money(totals?.incomes?.qr || 0)}</strong>
                  </div>
                  <div className="cash-summary-row total-line">
                    <span>TOTAL GENERAL INGRESOS:</span>
                    <strong style={{ color: "#15803d" }}>{money(totals?.incomes?.total || 0)}</strong>
                  </div>
                </div>

                {/* 2. EGRESOS */}
                <div className="cash-summary-card expenses">
                  <div className="cash-summary-header">
                    <span>📤 Egresos y Gastos</span>
                    <span>{totals?.movementsCount || 0} movimientos</span>
                  </div>
                  <div className="cash-summary-row">
                    <span>Gastos en Efectivo:</span>
                    <strong style={{ color: "#b91c1c" }}>-{money(totals?.expenses?.efectivo || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>Gastos por Transferencia:</span>
                    <strong>{money(totals?.expenses?.transferencia || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>Retiros / Otros:</span>
                    <strong>{money(totals?.expenses?.debito || totals?.expenses?.otro || 0)}</strong>
                  </div>
                  <div className="cash-summary-row total-line">
                    <span>TOTAL GENERAL EGRESOS:</span>
                    <strong style={{ color: "#b91c1c" }}>-{money(totals?.expenses?.total || 0)}</strong>
                  </div>
                </div>

                {/* 3. RESULTADO DE CAJA FÍSICA */}
                <div className="cash-summary-card result">
                  <div className="cash-summary-header">
                    <span>💵 Dinero Físico en Cajón</span>
                    <span>Arqueo en vivo</span>
                  </div>
                  <div className="cash-summary-row">
                    <span>Saldo Inicial (Fondo):</span>
                    <strong>{money(totals?.initialCash || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>(+) Ventas / Entradas Efectivo:</span>
                    <strong style={{ color: "#15803d" }}>+{money(totals?.incomes?.efectivo || 0)}</strong>
                  </div>
                  <div className="cash-summary-row">
                    <span>(-) Gastos / Retiros Efectivo:</span>
                    <strong style={{ color: "#b91c1c" }}>-{money(totals?.expenses?.efectivo || 0)}</strong>
                  </div>
                  <div className="cash-summary-row highlight-cash">
                    <span>SALDO ESPERADO GAVETA:</span>
                    <span>{money(totals?.expectedCash || 0)}</span>
                  </div>
                  <small style={{ fontSize: 11, color: "#8c6e58", marginTop: 4, display: "block" }}>
                    * Transferencias y tarjetas no se suman al cajón físico.
                  </small>
                </div>
              </div>

              {/* The Administrative Sheet Table matching paper form */}
              <div className="cash-sheet-container">
                <div className="cash-sheet-titlebar">
                  <div>
                    <h2>CAFETERÍA NANIFER · PLANILLA CAJA DIARIA</h2>
                    <span className="cash-sheet-sub">
                      Turno abierto por <strong>{shift?.openedByName}</strong> el {formatDateTimeShort(shift?.openedAt)}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "#624335" }}>
                    {entries.length} registro{entries.length === 1 ? "" : "s"} en la planilla
                  </span>
                </div>

                <div className="cash-ledger-wrapper">
                  <table className="cash-ledger-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ width: 110 }}>FECHA / HORA</th>
                        <th rowSpan={2} style={{ textAlign: "left" }}>DETALLE</th>
                        <th colSpan={2} style={{ width: 220 }}>INGRESOS</th>
                        <th rowSpan={2} style={{ width: 120 }}>SALDO</th>
                        <th rowSpan={2} style={{ width: 130 }}>FIRMA</th>
                      </tr>
                      <tr>
                        <th className="subhead" style={{ width: 105 }}>EFECTIVO</th>
                        <th className="subhead" style={{ width: 115 }}>TRANF. / DÉBITO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((item) => {
                        const isInit = item.type === "initial";
                        const isClose = item.type === "closure";
                        const isSale = item.type === "sale";
                        const isExp = item.isExpense;

                        const efVal = item.efectivo || 0;
                        const trVal = (item.transferencia || 0) + (item.debito || 0) + (item.qr || 0);

                        return (
                          <tr
                            key={item.id}
                            className={
                              isInit
                                ? "entry-initial"
                                : isClose
                                ? "entry-closure"
                                : ""
                            }
                          >
                            <td style={{ textAlign: "center", whiteSpace: "nowrap", fontSize: 11.5 }}>
                              {formatDateTimeShort(item.createdAt)}
                            </td>
                            <td>
                              {isSale && <span className="cash-tag-sale">VENTA</span>}
                              {isExp && <span className="cash-tag-egreso">GASTO</span>}
                              {item.type === "movement_in" && <span className="cash-tag-ingreso">INGRESO</span>}
                              {item.detail}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: isInit || efVal > 0 ? 700 : 400 }}>
                              {isExp ? (
                                item.expenseMethod === "efectivo" ? (
                                  <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)}</span>
                                ) : (
                                  "-"
                                )
                              ) : efVal > 0 ? (
                                money(efVal)
                              ) : (
                                "-"
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: trVal > 0 ? 600 : 400 }}>
                              {isExp ? (
                                item.expenseMethod !== "efectivo" ? (
                                  <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)} ({item.expenseMethod})</span>
                                ) : (
                                  "-"
                                )
                              ) : trVal > 0 ? (
                                money(trVal)
                              ) : (
                                "-"
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: "#3d2314" }}>
                              {money(item.runningBalance)}
                            </td>
                            <td style={{ textAlign: "center", fontWeight: 600, color: "#553c30" }}>
                              {item.signature || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* =========================================================================
          TAB 2: HISTORIAL DE CAJA (POR DÍA Y POR MES)
          ========================================================================= */}
      {activeTab === "history" && (
        <div className="cash-history-container">
          <div className="cash-history-toolbar">
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className={`category-chip ${historySubTab === "monthly" ? "selected" : ""}`}
                  onClick={() => setHistorySubTab("monthly")}
                >
                  <FileText size={15} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Planilla Mensual Completa
                </button>
                <button
                  type="button"
                  className={`category-chip ${historySubTab === "shifts" ? "selected" : ""}`}
                  onClick={() => setHistorySubTab("shifts")}
                >
                  <History size={15} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Cierres de Turno Anteriores
                </button>
              </div>

              {historySubTab === "monthly" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label>
                    Mes:
                    <select
                      value={selMonth}
                      onChange={(e) => setSelMonth(Number(e.target.value))}
                    >
                      {MONTH_NAMES.map((name, idx) =>
                        idx > 0 ? (
                          <option key={idx} value={idx}>
                            {name}
                          </option>
                        ) : null
                      )}
                    </select>
                  </label>

                  <label>
                    Año:
                    <select
                      value={selYear}
                      onChange={(e) => setSelYear(Number(e.target.value))}
                    >
                      {[2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="cash-btn-pdf"
                    onClick={downloadMonthlyPdf}
                    style={{ marginLeft: 8 }}
                  >
                    <Download size={15} />
                    Descargar Planilla Mensual (PDF A4)
                  </button>
                </div>
              )}

              {historySubTab === "shifts" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label>
                    <Search size={15} />
                    Buscar:
                    <input
                      type="text"
                      placeholder="Fecha o responsable…"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* SUB-VIEW 1: PLANILLA MENSUAL COMPLETA */}
          {historySubTab === "monthly" && (
            <div>
              {loadingMonthly ? (
                <p style={{ textAlign: "center", padding: "40px", color: "#8c6e58" }}>
                  Cargando planilla mensual…
                </p>
              ) : !monthlyData || monthlyData.entries.length === 0 ? (
                <div className="cash-banner-closed">
                  <h3>No hay movimientos registrados en {MONTH_NAMES[selMonth]} {selYear}</h3>
                  <p>Seleccioná otro mes o año para consultar la planilla histórica.</p>
                </div>
              ) : (
                <div className="cash-sheet-container">
                  <div className="cash-sheet-titlebar">
                    <div>
                      <h2>PLANILLA CAJA DIARIA</h2>
                      <span className="cash-sheet-sub">
                        CAFETERÍA NANIFER &nbsp;|&nbsp; <strong>MES: {monthlyData.monthName?.toUpperCase()} {monthlyData.year}</strong>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#624335" }}>
                        {monthlyData.entries.length} movimientos · {monthlyData.shiftsCount} turnos
                      </span>
                      <button
                        type="button"
                        className="cash-btn-pdf"
                        onClick={downloadMonthlyPdf}
                      >
                        <Download size={14} />
                        Imprimir / PDF
                      </button>
                    </div>
                  </div>

                  <div className="cash-ledger-wrapper">
                    <table className="cash-ledger-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: 100 }}>FECHA</th>
                          <th rowSpan={2} style={{ textAlign: "left" }}>DETALLE</th>
                          <th colSpan={2} style={{ width: 220 }}>INGRESOS</th>
                          <th rowSpan={2} style={{ width: 120 }}>SALDO</th>
                          <th rowSpan={2} style={{ width: 130 }}>FIRMA</th>
                        </tr>
                        <tr>
                          <th className="subhead" style={{ width: 105 }}>EFECTIVO</th>
                          <th className="subhead" style={{ width: 115 }}>TRANF. / DÉBITO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.entries.map((item, idx) => {
                          const isInit = item.type === "initial";
                          const isClose = item.type === "closure";
                          const isSale = item.type === "sale";
                          const isExp = item.isExpense;

                          const efVal = item.efectivo || 0;
                          const trVal = (item.transferencia || 0) + (item.debito || 0) + (item.qr || 0);

                          return (
                            <tr
                              key={`${item.id}-${idx}`}
                              className={isInit ? "entry-initial" : isClose ? "entry-closure" : ""}
                            >
                              <td style={{ textAlign: "center", whiteSpace: "nowrap", fontSize: 11.5 }}>
                                {item.dateStr || formatDateTimeShort(item.createdAt)}
                              </td>
                              <td>
                                {isSale && <span className="cash-tag-sale">VENTA</span>}
                                {isExp && <span className="cash-tag-egreso">GASTO</span>}
                                {item.type === "movement_in" && <span className="cash-tag-ingreso">INGRESO</span>}
                                {item.detail}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: isInit || efVal > 0 ? 700 : 400 }}>
                                {isExp ? (
                                  item.expenseMethod === "efectivo" ? (
                                    <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)}</span>
                                  ) : (
                                    "-"
                                  )
                                ) : efVal > 0 ? (
                                  money(efVal)
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: trVal > 0 ? 600 : 400 }}>
                                {isExp ? (
                                  item.expenseMethod !== "efectivo" ? (
                                    <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)}</span>
                                  ) : (
                                    "-"
                                  )
                                ) : trVal > 0 ? (
                                  money(trVal)
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: 800, color: "#3d2314" }}>
                                {money(item.runningBalance)}
                              </td>
                              <td style={{ textAlign: "center", fontWeight: 600, color: "#553c30" }}>
                                {item.signature || "-"}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Totals Row */}
                        <tr style={{ background: "#dfcfc2", fontWeight: 800 }}>
                          <td style={{ textAlign: "center" }}>TOTALES</td>
                          <td>Resumen mensual del período</td>
                          <td style={{ textAlign: "right" }}>
                            {money(monthlyData.totals?.incomes?.efectivo || 0)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {money(
                              (monthlyData.totals?.incomes?.transferencia || 0) +
                              (monthlyData.totals?.incomes?.debito || 0) +
                              (monthlyData.totals?.incomes?.qr || 0)
                            )}
                          </td>
                          <td style={{ textAlign: "right", color: "#3d2314" }}>
                            {money(monthlyData.totals?.finalBalance || 0)}
                          </td>
                          <td style={{ textAlign: "center" }}>NaniFer</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW 2: CIERRES DE TURNO ANTERIORES */}
          {historySubTab === "shifts" && (
            <div>
              {loadingHistory ? (
                <p style={{ textAlign: "center", padding: "40px", color: "#8c6e58" }}>
                  Cargando turnos pasados…
                </p>
              ) : (
                <div className="cash-history-shifts-grid">
                  {shiftsHistory
                    .filter((sItem) => {
                      if (!historySearch.trim()) return true;
                      const q = historySearch.toLowerCase();
                      const closeName = (sItem.shift?.closedByName || "").toLowerCase();
                      const dateStr = (sItem.shift?.closedAt || sItem.shift?.openedAt || "").toLowerCase();
                      return closeName.includes(q) || dateStr.includes(q);
                    })
                    .map((sItem) => {
                      const sh = sItem.shift;
                      const tot = sItem.totals;
                      const isCl = sh.status === "closed";

                      return (
                        <div
                          key={sh.id}
                          className="cash-history-card"
                          onClick={() => setViewingPastShift(sItem)}
                        >
                          <div className="cash-history-card-header">
                            <strong>{formatDateTimeShort(sh.openedAt)}</strong>
                            <span className={`cash-status-tag ${isCl ? "closed" : "open"}`}>
                              {isCl ? "Cerrada" : "Abierta"}
                            </span>
                          </div>

                          <div style={{ fontSize: 13, color: "#624335", marginBottom: 8 }}>
                            <div>Responsable cierre: <strong>{sh.closedByName || "En curso"}</strong></div>
                            <div>Apertura por: {sh.openedByName}</div>
                          </div>

                          <div style={{ borderTop: "1px dashed #e2d7cc", paddingTop: 8, fontSize: 13 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>Total Ventas:</span>
                              <strong>{money(tot.incomes?.total || tot.totalSales || 0)}</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>Efectivo contado:</span>
                              <strong>{sh.countedCash !== null ? money(sh.countedCash) : "-"}</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                              <span>Diferencia:</span>
                              <strong style={{ color: sh.difference < 0 ? "#b91c1c" : sh.difference > 0 ? "#b45309" : "#15803d" }}>
                                {sh.difference === 0 ? "Sin diferencia ($0)" : money(sh.difference)}
                              </strong>
                            </div>
                          </div>

                          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="secondary"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadShiftPdf(sh.id);
                              }}
                            >
                              <Download size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />
                              PDF
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* 1. MODAL: ABRIR TURNO DE CAJA */}
      {showOpenModal && (
        <Modal title="🔓 Abrir Turno de Caja" onClose={() => !busy && setShowOpenModal(false)}>
          <form onSubmit={handleOpenShift}>
            <p>
              Ingresá el fondo inicial de cambio en efectivo físico para arrancar el turno.
            </p>

            <label>
              Saldo Inicial de Efectivo en Gaveta ($)
              <input
                type="number"
                min="0"
                step="any"
                value={openInitial}
                onChange={(e) => setOpenInitial(e.target.value)}
                placeholder="Ej: 10000"
                autoFocus
                required
              />
            </label>

            <div className="quick-amount-chips">
              {[5000, 10000, 15000, 20000, 30000].map((val) => (
                <button
                  type="button"
                  key={val}
                  className="quick-amount-chip"
                  onClick={() => setOpenInitial(String(val))}
                >
                  ${val.toLocaleString("es-AR")}
                </button>
              ))}
            </div>

            <label style={{ marginTop: 12 }}>
              Observación inicial (opcional)
              <input
                type="text"
                placeholder="Ej: Turno Mañana / Fondo entregado por Lucía"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                maxLength={200}
              />
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setShowOpenModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Abriendo…" : "Confirmar Apertura"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 2. MODAL: REGISTRAR MOVIMIENTO MANUAL (INGRESO O EGRESO) */}
      {showMoveModal && (
        <Modal
          title={
            moveKind === "egreso"
              ? "📤 Registrar Egreso de Dinero (Gasto / Retiro)"
              : "📥 Registrar Ingreso Extraordinario (Vuelto / Aporte)"
          }
          onClose={() => !busy && setShowMoveModal(false)}
        >
          <form onSubmit={handleAddMovement}>
            {/* Toggle Egreso / Ingreso */}
            <div className="movement-kind-selector">
              <button
                type="button"
                className={moveKind === "egreso" ? "active-egreso" : ""}
                onClick={() => {
                  setMoveKind("egreso");
                  setMoveCategory("Verdulería / Frutas");
                }}
              >
                Egreso (Gasto o Salida)
              </button>
              <button
                type="button"
                className={moveKind === "ingreso" ? "active-ingreso" : ""}
                onClick={() => {
                  setMoveKind("ingreso");
                  setMoveCategory("Vuelto de compras");
                }}
              >
                Ingreso (Entrada o Vuelto)
              </button>
            </div>

            <label>
              Importe ($)
              <input
                type="number"
                min="1"
                step="any"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value)}
                placeholder="Ej: 3500"
                autoFocus
                required
              />
            </label>

            <div className="quick-amount-chips">
              {[1000, 2000, 5000, 10000, 20000].map((val) => (
                <button
                  type="button"
                  key={val}
                  className="quick-amount-chip"
                  onClick={() => setMoveAmount(String(val))}
                >
                  ${val.toLocaleString("es-AR")}
                </button>
              ))}
            </div>

            {/* Medio de Pago del Gasto/Ingreso */}
            <label style={{ marginTop: 10 }}>
              Medio de pago / origen:
              <div className="method-selector-pills">
                <button
                  type="button"
                  className={`method-pill ${moveMethod === "efectivo" ? "active" : ""}`}
                  onClick={() => setMoveMethod("efectivo")}
                >
                  💵 Efectivo (Caja)
                </button>
                <button
                  type="button"
                  className={`method-pill ${moveMethod === "transferencia" ? "active" : ""}`}
                  onClick={() => setMoveMethod("transferencia")}
                >
                  🏦 Transferencia
                </button>
                <button
                  type="button"
                  className={`method-pill ${moveMethod === "debito" ? "active" : ""}`}
                  onClick={() => setMoveMethod("debito")}
                >
                  💳 Débito / Tarjeta
                </button>
              </div>
            </label>
            {moveMethod !== "efectivo" && (
              <small style={{ color: "#8c6e58", display: "block", marginBottom: 10 }}>
                ℹ️ Al ser {moveMethod}, no descuenta el efectivo físico de la gaveta.
              </small>
            )}

            <label>
              Categoría:
              <div className="category-chips">
                {(moveKind === "egreso" ? EGRESO_CATEGORIES : INGRESO_CATEGORIES).map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    className={`category-chip ${moveCategory === cat ? "selected" : ""}`}
                    onClick={() => setMoveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </label>

            <label style={{ marginTop: 8 }}>
              Detalle / Motivo explicativo (obligatorio):
              <input
                type="text"
                placeholder="Ej: Pago de 2 kg de tomates para ensalada"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                maxLength={250}
                required
              />
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setShowMoveModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !moveAmount || Number(moveAmount) <= 0 || !moveNotes.trim()}
              >
                {busy ? "Guardando…" : "Registrar Movimiento"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. MODAL: FINALIZAR CIERRE DE CAJA (ARQUEO Y FIRMA) */}
      {showCloseModal && (
        <Modal
          title="🔒 Finalizar Cierre de Caja"
          onClose={() => !busy && setShowCloseModal(false)}
        >
          <form onSubmit={handleCloseShift}>
            <p>
              Revisá los importes acumulados y contá físicamente el dinero de la gaveta antes de cerrar.
            </p>

            {/* Arqueo breakdown card */}
            <div className="arqueo-breakdown">
              <div className="arqueo-row">
                <span>Saldo Inicial:</span>
                <strong>{money(totals?.initialCash || 0)}</strong>
              </div>
              <div className="arqueo-row">
                <span>(+) Ingresos en Efectivo:</span>
                <strong style={{ color: "#15803d" }}>+{money(totals?.incomes?.efectivo || 0)}</strong>
              </div>
              <div className="arqueo-row">
                <span>(-) Egresos / Gastos en Efectivo:</span>
                <strong style={{ color: "#b91c1c" }}>-{money(totals?.expenses?.efectivo || 0)}</strong>
              </div>
              <div className="arqueo-row total-expected">
                <span>SALDO ESPERADO EN EFECTIVO:</span>
                <span style={{ color: "#4a2c1d" }}>{money(expectedCash)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8c6e58", marginTop: 6 }}>
                Ventas electrónicas (Transf/Débito/QR): {money((totals?.incomes?.total || 0) - (totals?.incomes?.efectivo || 0))}
              </div>
            </div>

            {/* Inputs */}
            <label>
              Nombre y Apellido de la Moza Responsable (Firma) *
              <input
                type="text"
                placeholder="Ej: Lucía Romero"
                value={closeResponsible}
                onChange={(e) => setCloseResponsible(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label style={{ marginTop: 12 }}>
              Efectivo Contado Físicamente ($) *
              <input
                type="number"
                min="0"
                step="any"
                value={closeCounted}
                onChange={(e) => setCloseCounted(e.target.value)}
                placeholder="Importe real en mano"
                required
              />
            </label>

            {/* Live difference calculation */}
            {closeCounted !== "" && (
              <div
                className={`arqueo-diff-box ${
                  Math.abs(diffCalculated) < 0.01
                    ? "exact"
                    : diffCalculated < 0
                    ? "negative"
                    : "positive"
                }`}
              >
                {Math.abs(diffCalculated) < 0.01 ? (
                  <strong>✓ La caja coincide correctamente ($0,00 de diferencia)</strong>
                ) : diffCalculated < 0 ? (
                  <>
                    <strong>⚠️ Falta efectivo en caja: {money(Math.abs(diffCalculated))}</strong>
                    <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                      Se esperaba {money(expectedCash)} y se contaron {money(countedNum)}.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>⚠️ Sobra efectivo en caja: {money(diffCalculated)}</strong>
                    <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                      Se contaron {money(countedNum)} frente al esperado {money(expectedCash)}.
                    </p>
                  </>
                )}
              </div>
            )}

            <label style={{ marginTop: 12 }}>
              Observaciones / Justificación de la diferencia (opcional):
              <input
                type="text"
                placeholder="Ej: Se entregó vuelto de $500 de más en mesa 2"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                maxLength={250}
              />
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setShowCloseModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !closeResponsible.trim() || closeCounted === ""}
                style={{ background: "#b91c1c" }}
              >
                {busy ? "Cerrando…" : "CONFIRMAR Y GUARDAR CIERRE"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 4. MODAL: VER DETALLE DE TURNO PASADO */}
      {viewingPastShift && (
        <Modal
          title={`📋 Cierre de Turno · ${formatDateTimeShort(viewingPastShift.shift.closedAt || viewingPastShift.shift.openedAt)}`}
          onClose={() => setViewingPastShift(null)}
          className="combo-modal-fullscreen"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13.5, color: "#553c30" }}>
                Responsable del cierre: <strong>{viewingPastShift.shift.closedByName || "Personal"}</strong> ·
                Apertura: {formatDateTimeShort(viewingPastShift.shift.openedAt)} ({viewingPastShift.shift.openedByName})
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8c6e58" }}>
                Fondo inicial: {money(viewingPastShift.totals.initialCash)} ·
                Esperado: {money(viewingPastShift.totals.expectedCash)} ·
                Contado: {money(viewingPastShift.shift.countedCash)} ·
                Diferencia: <strong>{viewingPastShift.shift.difference === 0 ? "Sin diferencia ($0)" : money(viewingPastShift.shift.difference)}</strong>
              </p>
            </div>
            <button
              type="button"
              className="cash-btn-pdf"
              onClick={() => downloadShiftPdf(viewingPastShift.shift.id)}
            >
              <Download size={15} />
              Descargar PDF A4
            </button>
          </div>

          <div className="cash-ledger-wrapper">
            <table className="cash-ledger-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: 100 }}>FECHA / HORA</th>
                  <th rowSpan={2} style={{ textAlign: "left" }}>DETALLE</th>
                  <th colSpan={2} style={{ width: 220 }}>INGRESOS</th>
                  <th rowSpan={2} style={{ width: 120 }}>SALDO</th>
                  <th rowSpan={2} style={{ width: 130 }}>FIRMA</th>
                </tr>
                <tr>
                  <th className="subhead" style={{ width: 105 }}>EFECTIVO</th>
                  <th className="subhead" style={{ width: 115 }}>TRANF. / DÉBITO</th>
                </tr>
              </thead>
              <tbody>
                {(viewingPastShift.entries || []).map((item, idx) => (
                  <tr key={`${item.id}-${idx}`}>
                    <td style={{ textAlign: "center", fontSize: 11.5 }}>
                      {formatDateTimeShort(item.createdAt)}
                    </td>
                    <td>{item.detail}</td>
                    <td style={{ textAlign: "right" }}>
                      {item.isExpense ? (
                        item.expenseMethod === "efectivo" ? (
                          <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)}</span>
                        ) : (
                          "-"
                        )
                      ) : item.efectivo > 0 ? (
                        money(item.efectivo)
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {item.isExpense ? (
                        item.expenseMethod !== "efectivo" ? (
                          <span style={{ color: "#b91c1c" }}>-{money(item.expenseAmount)}</span>
                        ) : (
                          "-"
                        )
                      ) : (item.transferencia + item.debito + item.qr) > 0 ? (
                        money(item.transferencia + item.debito + item.qr)
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {money(item.runningBalance)}
                    </td>
                    <td style={{ textAlign: "center" }}>{item.signature || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </main>
  );
}
