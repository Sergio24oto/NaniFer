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
  FileText,
  Search,
  Receipt,
  Eye,
  FileSpreadsheet
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

const SHIFT_TYPES = ["T. Mañana", "T. Siesta", "T. Tarde", "T. Noche"];
const DEFAULT_MOZAS = ["Ivana", "Sofía", "Johana", "Candela", "Milagros"];

function loadSavedMozas() {
  try {
    const raw = localStorage.getItem("nanifer_mozas_team");
    if (!raw) return DEFAULT_MOZAS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const set = new Set([...DEFAULT_MOZAS, ...parsed]);
      return Array.from(set);
    }
  } catch {}
  return DEFAULT_MOZAS;
}

function MozaSelector({ mozasList, selected, onSelect, onAddMoza }) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");

  function submitAdd() {
    const trimmed = name.trim();
    if (trimmed) {
      const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      onAddMoza(formatted);
      setName("");
      setIsAdding(false);
    } else {
      setIsAdding(false);
    }
  }

  return (
    <div className="moza-selector-chips">
      {mozasList.map((mName) => (
        <button
          type="button"
          key={mName}
          className={`moza-chip ${selected === mName ? "active" : ""}`}
          onClick={() => onSelect(mName)}
        >
          👤 {mName}
        </button>
      ))}
      {!isAdding ? (
        <button
          type="button"
          className="moza-chip add-moza-chip"
          onClick={() => setIsAdding(true)}
          title="Sumar una nueva moza al equipo"
        >
          ➕ Agregar moza
        </button>
      ) : (
        <div className="add-moza-inline-form">
          <input
            type="text"
            className="add-moza-input"
            placeholder="Nombre de moza..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAdd();
              } else if (e.key === "Escape") {
                setIsAdding(false);
              }
            }}
          />
          <button type="button" className="btn-save-moza" onClick={submitAdd}>
            ✓ Sumar
          </button>
          <button
            type="button"
            className="btn-cancel-moza"
            onClick={() => {
              setIsAdding(false);
              setName("");
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function getDefaultShiftType() {
  const hr = new Date().getHours();
  if (hr >= 6 && hr < 13) return "T. Mañana";
  if (hr >= 13 && hr < 17) return "T. Siesta";
  if (hr >= 17 && hr < 21) return "T. Tarde";
  return "T. Noche";
}

function formatShiftTitle(rawType) {
  if (!rawType) return "TURNO MAÑANA";
  const u = String(rawType).toUpperCase().trim();
  if (u.includes("MAÑANA")) return "TURNO MAÑANA";
  if (u.includes("SIESTA")) return "TURNO SIESTA";
  if (u.includes("TARDE")) return "TURNO TARDE";
  if (u.includes("NOCHE")) return "TURNO NOCHE";
  return u.startsWith("TURNO") ? u : `TURNO ${u}`;
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
  const [activeTab, setActiveTab] = useState("today"); // "today" | "days" | "monthly"

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
  const [inspectingShift, setInspectingShift] = useState(null);
  const [loadingShiftDetail, setLoadingShiftDetail] = useState(false);

  // Open shift form
  const [mozasList, setMozasList] = useState(loadSavedMozas);
  const [openInitial, setOpenInitial] = useState("10000");
  const [openShiftType, setOpenShiftType] = useState(getDefaultShiftType());
  const [openResponsible, setOpenResponsible] = useState(DEFAULT_MOZAS[0]);
  const [openNotes, setOpenNotes] = useState("");

  function handleAddMozaToList(name) {
    if (!name) return;
    const formatted = name.charAt(0).toUpperCase() + name.slice(1);
    if (!mozasList.includes(formatted)) {
      const nextList = [...mozasList, formatted];
      setMozasList(nextList);
      try {
        localStorage.setItem("nanifer_mozas_team", JSON.stringify(nextList));
      } catch {}
    }
    setOpenResponsible(formatted);
    setCloseResponsible(formatted);
  }

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

  // Tab 2: Days List & Selected Day
  const [daysList, setDaysList] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [loadingDayDetail, setLoadingDayDetail] = useState(false);
  const [daysSearch, setDaysSearch] = useState("");

  // Tab 3: Monthly Sheet State
  const currentDate = new Date();
  const [selMonth, setSelMonth] = useState(currentDate.getMonth() + 1);
  const [selYear, setSelYear] = useState(currentDate.getFullYear());
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

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

  async function loadDays() {
    try {
      setLoadingDays(true);
      const res = await request("/cash-drawer/days?limit=40");
      setDaysList(res || []);
      if (res && res.length > 0 && !selectedDayDate) {
        setSelectedDayDate(res[0].date);
        setSelectedDayData(res[0]);
      }
    } catch (e) {
      console.error("Error al cargar días", e);
    } finally {
      setLoadingDays(false);
    }
  }

  async function selectDay(dateStr) {
    setSelectedDayDate(dateStr);
    try {
      setLoadingDayDetail(true);
      const res = await request(`/cash-drawer/days/${dateStr}`);
      setSelectedDayData(res);
    } catch (e) {
      alert("Error al cargar detalle del día: " + e.message);
    } finally {
      setLoadingDayDetail(false);
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

  async function inspectShiftTickets(shiftId) {
    try {
      setLoadingShiftDetail(true);
      const res = await request(`/cash-drawer/shifts/${shiftId}`);
      setInspectingShift(res);
    } catch (e) {
      alert("Error al consultar ventas del turno: " + e.message);
    } finally {
      setLoadingShiftDetail(false);
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
    if (activeTab === "days") {
      loadDays();
    } else if (activeTab === "monthly") {
      loadMonthly();
    }
  }, [activeTab, selMonth, selYear]);

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
          shiftType: openShiftType || "T. Mañana",
          responsibleName: openResponsible.trim() || s.user?.name || "Personal",
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
      a.download = `NaniFer-cierre-turno-${shiftId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("No se pudo generar el PDF: " + err.message);
    }
  }

  async function downloadDayPdf(dateStr) {
    if (!dateStr) return;
    try {
      const blob = await request(`/cash-drawer/days/${dateStr}/export.pdf`, { asBlob: true });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NaniFer-planilla-diaria-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("No se pudo generar la planilla diaria en PDF: " + err.message);
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
  const todaySummary = data?.todaySummary;

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
            <p>Control de turnos, arqueo físico y rendición de ingresos por medios de pago.</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`cash-status-tag ${isOpen ? "open" : "closed"}`}>
            <span className="cash-status-dot" />
            {isOpen ? `Caja Abierta · ${shift?.shiftType || "Turno"}` : "Caja Cerrada"}
          </span>
        </div>
      </div>

      {/* Main 3 Navigation Tabs */}
      <div className="cash-nav-tabs">
        <button
          type="button"
          className={`cash-tab-btn ${activeTab === "today" ? "active" : ""}`}
          onClick={() => setActiveTab("today")}
        >
          <Receipt size={18} />
          Caja del Día (Turno en Curso)
        </button>

        <button
          type="button"
          className={`cash-tab-btn ${activeTab === "days" ? "active" : ""}`}
          onClick={() => setActiveTab("days")}
        >
          <Calendar size={18} />
          Historial de Jornadas por Días
        </button>

        <button
          type="button"
          className={`cash-tab-btn ${activeTab === "monthly" ? "active" : ""}`}
          onClick={() => setActiveTab("monthly")}
        >
          <FileSpreadsheet size={18} />
          Planilla Mensual Completa
        </button>
      </div>

      {error && (
        <div className="alert" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* =========================================================================
          TAB 1: CAJA DEL DÍA (TURNO EN CURSO)
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
                  Turno: <strong>{closedReceipt.shift?.shiftType || "Turno"}</strong> ·
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
                    setOpenShiftType(getDefaultShiftType());
                    setShowOpenModal(true);
                  }}
                >
                  <Unlock size={16} />
                  Abrir siguiente turno (Pase de moza)
                </button>
              </div>
            </div>
          )}

          {!isOpen ? (
            <div className="cash-banner-closed">
              <h2>No hay ninguna caja abierta en este momento</h2>
              <p>
                Al abrir el turno, las ventas y cobros en el salón y mostrador se registrarán automáticamente.
                El sistema calculará el saldo físico exacto discriminando efectivo de transferencias, débito y QR.
              </p>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setOpenInitial(String(data?.lastShift?.shift?.countedCash || "10000"));
                  setOpenShiftType(getDefaultShiftType());
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
                    Último cierre: <strong>{data.lastShift.shift.shiftType || "Turno"}</strong> ({formatDateTimeShort(data.lastShift.shift.closedAt)}) por <strong>{data.lastShift.shift.closedByName || "Personal"}</strong> · Efectivo: {money(data.lastShift.shift.countedCash)}
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
                  Descargar Comprobante Turno (PDF)
                </button>

                <button
                  type="button"
                  className="cash-btn-close"
                  onClick={() => {
                    setCloseCounted(String(totals?.expectedCash || ""));
                    setCloseResponsible(shift?.openedByName || s.user?.name || "Sofía");
                    setShowCloseModal(true);
                  }}
                >
                  <Lock size={18} />
                  FINALIZAR CIERRE DE TURNO
                </button>
              </div>

              {/* 3-Part Summary Block for current shift */}
              <div className="cash-summary-triad">
                {/* 1. INGRESOS */}
                <div className="cash-summary-card incomes">
                  <div className="cash-summary-header">
                    <span>📥 Ingresos del {shift?.shiftType || "Turno"}</span>
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

              {/* The Daily 4-Shift Table for TODAY */}
              {todaySummary && (
                <div className="cash-sheet-container">
                  <div className="cash-sheet-titlebar">
                    <div>
                      <h2>CAFETERÍA NANIFER · PLANILLA DEL DÍA (HOY)</h2>
                      <span className="cash-sheet-sub">
                        Jornada: <strong>{todaySummary.dateFormatted}</strong> · Rendición acumulada de los turnos de hoy
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        className="cash-btn-pdf"
                        onClick={() => downloadDayPdf(todaySummary.date)}
                      >
                        <Download size={14} />
                        Descargar Planilla del Día (PDF)
                      </button>
                    </div>
                  </div>

                  <div className="cash-ledger-wrapper">
                    <table className="cash-ledger-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: 120 }}>FECHA</th>
                          <th rowSpan={2} style={{ textAlign: "left" }}>DETALLE (TURNO)</th>
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
                        {todaySummary.shifts.map((tItem, idx) => {
                          const isCurrent = tItem.shiftId === shift?.id;
                          return (
                            <tr key={tItem.shiftId} className={`cash-shift-row ${isCurrent ? "entry-current-shift" : ""}`}>
                              {idx === 0 && (
                                <td
                                  rowSpan={todaySummary.shifts.length}
                                  className="cash-date-spanned-cell"
                                >
                                  <div className="cash-date-badge-box">
                                    <span className="cash-date-today-pill">HOY</span>
                                    <span className="cash-date-main-text">{todaySummary.dateFormatted}</span>
                                    <span style={{ fontSize: 11, color: "#8c6e58", fontWeight: 600 }}>
                                      {todaySummary.shifts.length} {todaySummary.shifts.length === 1 ? "turno" : "turnos"}
                                    </span>
                                  </div>
                                </td>
                              )}
                              <td className="cash-shift-detail-cell">
                                <div className="shift-cell-content">
                                  <div className="shift-title-line">
                                    <span className="shift-name-prominent">
                                      {formatShiftTitle(tItem.shiftType)}
                                    </span>
                                    {isCurrent && (
                                      <span className="shift-live-pill">
                                        ● En curso ahora
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-view-sales"
                                      onClick={() => inspectShiftTickets(tItem.shiftId)}
                                      title="Ver detalle de tickets y ventas de este turno"
                                    >
                                      Ver ventas 🔍
                                    </button>
                                  </div>
                                  <div className="shift-time-sub">
                                    <span>Apertura: {formatDateTimeShort(tItem.openedAt)}</span>
                                    {tItem.closedAt && <span> · Cierre: {formatDateTimeShort(tItem.closedAt)}</span>}
                                    {tItem.salesCount > 0 && <span> · {tItem.salesCount} venta{tItem.salesCount === 1 ? "" : "s"}</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="cash-num-cell cash-val">
                                {money(tItem.efectivo)}
                              </td>
                              <td className="cash-num-cell electronic-val">
                                {money(tItem.electronicTotal)}
                              </td>
                              <td className="cash-num-cell saldo-val">
                                {money(tItem.saldo)}
                              </td>
                              <td className="cash-signature-cell">
                                <span className="moza-signature-tag">
                                  ✍️ {tItem.signature || "-"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Totals row */}
                        <tr className="cash-totals-row">
                          <td colSpan={2} className="cash-totals-label">
                            TOTAL HOY · Rendición Consolidada de la Jornada
                          </td>
                          <td className="cash-num-cell cash-val totals">
                            {money(todaySummary.totals?.totalEfectivo || 0)}
                          </td>
                          <td className="cash-num-cell electronic-val totals">
                            {money(todaySummary.totals?.totalElectronic || 0)}
                          </td>
                          <td className="cash-num-cell saldo-val totals">
                            {money(todaySummary.totals?.totalDay || todaySummary.totals?.finalBalance || 0)}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 800, color: "#624335" }}>
                            NaniFer
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Facturación box for today */}
                  {todaySummary.facturacion && (
                    <div className="facturacion-box">
                      <div className="facturacion-header">
                        <strong style={{ color: "#43281c", fontSize: 14 }}>
                          🧾 Desglose para Facturación (Hoy)
                        </strong>
                        <span style={{ fontSize: 12, color: "#8c6e58" }}>
                          Valores discriminados por medio electrónico
                        </span>
                      </div>
                      <div className="facturacion-grid">
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">QR / Mercado Pago</span>
                          <div className="facturacion-card-val">{money(todaySummary.facturacion.qr)}</div>
                          <span className="facturacion-card-sub">Facturación digital</span>
                        </div>
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">Débito / Tarjetas</span>
                          <div className="facturacion-card-val">{money(todaySummary.facturacion.debito)}</div>
                          <span className="facturacion-card-sub">Comprobantes posnet</span>
                        </div>
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">Transferencias</span>
                          <div className="facturacion-card-val">{money(todaySummary.facturacion.transferencia)}</div>
                          <span className="facturacion-card-sub">Cuentas bancarias</span>
                        </div>
                        <div className="facturacion-card cash-card">
                          <span className="facturacion-card-label cash">Efectivo Físico</span>
                          <div className="facturacion-card-val cash">{money(todaySummary.facturacion.efectivo)}</div>
                          <span className="facturacion-card-sub" style={{ color: "#166534" }}>Recaudado en gaveta</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* =========================================================================
          TAB 2: HISTORIAL DE JORNADAS POR DÍAS (NEW CARDS VIEW)
          ========================================================================= */}
      {activeTab === "days" && (
        <div>
          {/* Toolbar */}
          <div className="cash-history-toolbar">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#553c30", fontSize: 14 }}>
                  Seleccioná una Jornada para ver su Planilla Diaria:
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Search size={15} color="#8c6e58" />
                <input
                  type="text"
                  placeholder="Buscar fecha o moza…"
                  value={daysSearch}
                  onChange={(e) => setDaysSearch(e.target.value)}
                  style={{ width: 220 }}
                />
              </div>
            </div>
          </div>

          {loadingDays ? (
            <p style={{ textAlign: "center", padding: "40px", color: "#8c6e58" }}>
              Cargando jornadas…
            </p>
          ) : daysList.length === 0 ? (
            <div className="cash-banner-closed">
              <h3>No hay jornadas registradas</h3>
              <p>Las jornadas aparecerán automáticamente a medida que se abran y cierren turnos de caja.</p>
            </div>
          ) : (
            <>
              {/* Day Cards Grid */}
              <div className="day-cards-grid">
                {daysList
                  .filter((dItem) => {
                    if (!daysSearch.trim()) return true;
                    const q = daysSearch.toLowerCase();
                    const dFmt = (dItem.dateFormatted || "").toLowerCase();
                    const dRaw = (dItem.date || "").toLowerCase();
                    const mozas = (dItem.shifts || []).map((s) => s.signature || "").join(" ").toLowerCase();
                    return dFmt.includes(q) || dRaw.includes(q) || mozas.includes(q);
                  })
                  .map((dItem) => {
                    const isSel = selectedDayDate === dItem.date;
                    const isComp = dItem.isComplete;
                    return (
                      <div
                        key={dItem.date}
                        className={`day-card ${isSel ? "selected" : ""}`}
                        onClick={() => selectDay(dItem.date)}
                      >
                        <div className="day-card-header">
                          <div>
                            <span style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: isSel ? "#b45309" : "#8c6e58" }}>
                              {isSel ? "JORNADA SELECCIONADA" : "DÍA REGISTRADO"}
                            </span>
                            <h3 className="day-card-title">{dItem.dateFormatted}</h3>
                          </div>
                          <span className={`day-card-badge ${isComp ? "complete" : "in-progress"}`}>
                            {isComp ? `✓ ${dItem.shiftsCount} Turnos Cerrados` : `${dItem.shiftsCount} Turno(s)`}
                          </span>
                        </div>

                        <div style={{ borderTop: "1px dashed #e2d7cc", paddingTop: 8, marginTop: 6, fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "#6b4d3c" }}>Efectivo:</span>
                            <strong style={{ color: "#15803d" }}>{money(dItem.totals.totalEfectivo)}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "#6b4d3c" }}>Transf / Déb / QR:</span>
                            <strong style={{ color: "#0369a1" }}>{money(dItem.totals.totalElectronic)}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f0e6dc", paddingTop: 4, marginTop: 4 }}>
                            <span style={{ fontWeight: 800, color: "#3d2314" }}>TOTAL DÍA:</span>
                            <strong style={{ fontSize: 14.5, color: "#3d2314" }}>{money(dItem.totals.totalDay)}</strong>
                          </div>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 11.5, color: "#8c6e58", textAlign: "right" }}>
                          Mozas: {(dItem.shifts || []).map((s) => s.signature).filter(Boolean).join(", ") || "-"}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* The Selected Day Planilla (4 Shifts Table) */}
              {loadingDayDetail ? (
                <p style={{ textAlign: "center", padding: "30px", color: "#8c6e58" }}>
                  Cargando detalle del día…
                </p>
              ) : selectedDayData ? (
                <div className="cash-sheet-container">
                  <div className="cash-sheet-titlebar">
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#b45309", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        PLANILLA DE RENDICIÓN DIARIA
                      </span>
                      <h2>{selectedDayData.dateFormatted} ({selectedDayData.shiftsCount} Turnos)</h2>
                      <span className="cash-sheet-sub">
                        Cafetería NaniFer · Rendición cerrada y firmada por cada moza
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        className="cash-btn-pdf"
                        onClick={() => downloadDayPdf(selectedDayData.date)}
                      >
                        <Download size={15} />
                        Descargar Planilla del Día (PDF A4)
                      </button>
                    </div>
                  </div>

                  <div className="cash-ledger-wrapper">
                    <table className="cash-ledger-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: 120 }}>FECHA</th>
                          <th rowSpan={2} style={{ textAlign: "left" }}>DETALLE (TURNO)</th>
                          <th colSpan={2} style={{ width: 230 }}>INGRESOS</th>
                          <th rowSpan={2} style={{ width: 120 }}>SALDO</th>
                          <th rowSpan={2} style={{ width: 130 }}>FIRMA</th>
                        </tr>
                        <tr>
                          <th className="subhead" style={{ width: 110 }}>EFECTIVO</th>
                          <th className="subhead" style={{ width: 120 }}>TRANF. / DÉBITO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDayData.shifts.map((tItem, idx) => (
                          <tr key={tItem.shiftId} className="cash-shift-row">
                            {idx === 0 && (
                              <td
                                rowSpan={selectedDayData.shifts.length}
                                className="cash-date-spanned-cell"
                              >
                                <div className="cash-date-badge-box">
                                  <span className="cash-date-main-text">{selectedDayData.dateFormatted}</span>
                                  <span style={{ fontSize: 11, color: "#8c6e58", fontWeight: 600 }}>
                                    {selectedDayData.shiftsCount} {selectedDayData.shiftsCount === 1 ? "turno" : "turnos"}
                                  </span>
                                </div>
                              </td>
                            )}
                            <td className="cash-shift-detail-cell">
                              <div className="shift-cell-content">
                                <div className="shift-title-line">
                                  <span className="shift-name-prominent">
                                    {formatShiftTitle(tItem.shiftType)}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-view-sales"
                                    onClick={() => inspectShiftTickets(tItem.shiftId)}
                                    title="Ver detalle de tickets y ventas de este turno"
                                  >
                                    Ver ventas 🔍
                                  </button>
                                </div>
                                <div className="shift-time-sub">
                                  <span>Apertura: {formatDateTimeShort(tItem.openedAt)}</span>
                                  {tItem.closedAt && <span> · Cierre: {formatDateTimeShort(tItem.closedAt)}</span>}
                                  {tItem.salesCount > 0 && <span> · {tItem.salesCount} venta{tItem.salesCount === 1 ? "" : "s"}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="cash-num-cell cash-val">
                              {money(tItem.efectivo)}
                            </td>
                            <td className="cash-num-cell electronic-val">
                              {money(tItem.electronicTotal)}
                            </td>
                            <td className="cash-num-cell saldo-val">
                              {money(tItem.saldo)}
                            </td>
                            <td className="cash-signature-cell">
                              <span className="moza-signature-tag">
                                ✍️ {tItem.signature || "-"}
                              </span>
                            </td>
                          </tr>
                        ))}

                        {/* Totals row */}
                        <tr className="cash-totals-row">
                          <td colSpan={2} className="cash-totals-label">
                            TOTAL DÍA · {selectedDayData.shiftsCount} Turnos Completados
                          </td>
                          <td className="cash-num-cell cash-val totals">
                            {money(selectedDayData.totals.totalEfectivo)}
                          </td>
                          <td className="cash-num-cell electronic-val totals">
                            {money(selectedDayData.totals.totalElectronic)}
                          </td>
                          <td className="cash-num-cell saldo-val totals">
                            {money(selectedDayData.totals.totalDay || selectedDayData.totals.finalBalance || 0)}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 800, color: "#624335" }}>
                            NaniFer
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Facturación box for selected day */}
                  {selectedDayData.facturacion && (
                    <div className="facturacion-box">
                      <div className="facturacion-header">
                        <strong style={{ color: "#43281c", fontSize: 14.5 }}>
                          🧾 Desglose para Facturación de la Dueña ({selectedDayData.dateFormatted})
                        </strong>
                        <span style={{ fontSize: 12, color: "#8c6e58" }}>
                          Valores discriminados listos para emitir comprobantes fiscales
                        </span>
                      </div>
                      <div className="facturacion-grid">
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">QR / Mercado Pago</span>
                          <div className="facturacion-card-val">{money(selectedDayData.facturacion.qr)}</div>
                          <span className="facturacion-card-sub">Facturación directa digital</span>
                        </div>
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">Débito / Tarjetas</span>
                          <div className="facturacion-card-val">{money(selectedDayData.facturacion.debito)}</div>
                          <span className="facturacion-card-sub">Comprobantes posnet</span>
                        </div>
                        <div className="facturacion-card">
                          <span className="facturacion-card-label">Transferencias</span>
                          <div className="facturacion-card-val">{money(selectedDayData.facturacion.transferencia)}</div>
                          <span className="facturacion-card-sub">Acreditaciones bancarias</span>
                        </div>
                        <div className="facturacion-card cash-card">
                          <span className="facturacion-card-label cash">Efectivo Físico</span>
                          <div className="facturacion-card-val cash">{money(selectedDayData.facturacion.efectivo)}</div>
                          <span className="facturacion-card-sub" style={{ color: "#166534" }}>Recaudado en gaveta</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: PLANILLA MENSUAL COMPLETA
          ========================================================================= */}
      {activeTab === "monthly" && (
        <div>
          <div className="cash-history-toolbar">
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
          </div>

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
                    {monthlyData.entries.length} turnos registrados · {monthlyData.salesCount} ventas
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
                    {monthlyData.entries.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`} className="cash-shift-row">
                        <td style={{ textAlign: "center", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, color: "#4a3429" }}>
                          {item.dateStr}
                        </td>
                        <td className="cash-shift-detail-cell">
                          <div className="shift-cell-content">
                            <div className="shift-title-line">
                              <span className="shift-name-prominent">
                                {formatShiftTitle(item.detail)}
                              </span>
                              {item.shiftId && (
                                <button
                                  type="button"
                                  className="btn-view-sales"
                                  onClick={() => inspectShiftTickets(item.shiftId)}
                                  title="Ver detalle de ventas y tickets de este turno"
                                >
                                  Ver ventas 🔍
                                </button>
                              )}
                            </div>
                            {item.salesCount > 0 && (
                              <div className="shift-time-sub">
                                <span>{item.salesCount} ventas registradas</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="cash-num-cell cash-val">
                          {money(item.efectivo)}
                        </td>
                        <td className="cash-num-cell electronic-val">
                          {money(item.electronicTotal)}
                        </td>
                        <td className="cash-num-cell saldo-val">
                          {money(item.runningBalance)}
                        </td>
                        <td className="cash-signature-cell">
                          <span className="moza-signature-tag">
                            ✍️ {item.signature || "-"}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Totals Row */}
                    <tr style={{ background: "#dfcfc2", fontWeight: 800 }}>
                      <td style={{ textAlign: "center" }}>TOTALES</td>
                      <td>Resumen mensual del período</td>
                      <td style={{ textAlign: "right", color: "#15803d" }}>
                        {money(monthlyData.totals?.incomes?.efectivo || 0)}
                      </td>
                      <td style={{ textAlign: "right", color: "#0369a1" }}>
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

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* 1. MODAL: ABRIR TURNO DE CAJA */}
      {showOpenModal && (
        <Modal title="🔓 Abrir Turno de Caja" onClose={() => !busy && setShowOpenModal(false)}>
          <form onSubmit={handleOpenShift}>
            <p>
              Seleccioná qué turno abrís e ingresá el fondo inicial de cambio en efectivo físico.
            </p>

            <label>
              Turno que abrís:
              <div className="shift-selector-pills">
                {SHIFT_TYPES.map((tName) => (
                  <button
                    type="button"
                    key={tName}
                    className={`shift-pill ${openShiftType === tName ? "active" : ""}`}
                    onClick={() => setOpenShiftType(tName)}
                  >
                    {tName}
                  </button>
                ))}
              </div>
            </label>

            <label style={{ marginTop: 8 }}>
              Moza / Responsable que abre la caja:
              <MozaSelector
                mozasList={mozasList}
                selected={openResponsible}
                onSelect={setOpenResponsible}
                onAddMoza={handleAddMozaToList}
              />
              <input
                type="text"
                placeholder="O escribí el nombre si es otra persona..."
                value={openResponsible}
                onChange={(e) => setOpenResponsible(e.target.value)}
                required
              />
            </label>

            <label style={{ marginTop: 8 }}>
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
                placeholder="Ej: Fondo entregado por Lucía / Turno sin novedades"
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

      {/* 3. MODAL: FINALIZAR CIERRE DE TURNO (ARQUEO Y FIRMA) */}
      {showCloseModal && (
        <Modal
          title={`🔒 Finalizar Cierre de ${shift?.shiftType || "Turno"}`}
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
              Nombre de la Moza Responsable (Firma) *
              <MozaSelector
                mozasList={mozasList}
                selected={closeResponsible}
                onSelect={setCloseResponsible}
                onAddMoza={handleAddMozaToList}
              />
              <input
                type="text"
                placeholder="O escribí el nombre si es otra persona..."
                value={closeResponsible}
                onChange={(e) => setCloseResponsible(e.target.value)}
                required
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

      {/* 4. MODAL: AUDITORÍA DE TICKETS Y VENTAS DE UN TURNO */}
      {inspectingShift && (
        <Modal
          title={`🔍 Auditoría de Ventas · ${inspectingShift.shift?.shiftType || "Turno"} (${formatDateTimeShort(inspectingShift.shift?.openedAt)})`}
          onClose={() => setInspectingShift(null)}
          className="combo-modal-fullscreen"
        >
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "#553c30" }}>
              Responsable: <strong>{inspectingShift.shift?.closedByName || inspectingShift.shift?.openedByName || "Personal"}</strong> ·
              Total Ventas: <strong>{money(inspectingShift.totals?.incomes?.total || inspectingShift.totals?.totalSales || 0)}</strong> ·
              Efectivo: <strong>{money(inspectingShift.totals?.incomes?.efectivo || 0)}</strong> ·
              Electrónico: <strong>{money((inspectingShift.totals?.incomes?.total || 0) - (inspectingShift.totals?.incomes?.efectivo || 0))}</strong>
            </p>
          </div>

          <div className="cash-ledger-wrapper" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="cash-ledger-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>HORA</th>
                  <th style={{ textAlign: "left" }}>DETALLE VENTA / MOVIMIENTO</th>
                  <th style={{ width: 110 }}>EFECTIVO</th>
                  <th style={{ width: 130 }}>TRANF. / DÉBITO</th>
                  <th style={{ width: 110 }}>SALDO</th>
                </tr>
              </thead>
              <tbody>
                {(inspectingShift.entries || []).map((it, idx) => (
                  <tr key={`${it.id}-${idx}`}>
                    <td style={{ textAlign: "center", fontSize: 11.5 }}>
                      {formatDateTimeShort(it.createdAt)}
                    </td>
                    <td>{it.detail}</td>
                    <td style={{ textAlign: "right", color: it.efectivo > 0 ? "#15803d" : "#2b221b" }}>
                      {it.isExpense ? (
                        it.expenseMethod === "efectivo" ? `-${money(it.expenseAmount)}` : "-"
                      ) : it.efectivo > 0 ? money(it.efectivo) : "-"}
                    </td>
                    <td style={{ textAlign: "right", color: "#0369a1" }}>
                      {it.isExpense ? (
                        it.expenseMethod !== "efectivo" ? `-${money(it.expenseAmount)}` : "-"
                      ) : (it.transferencia + it.debito + it.qr) > 0 ? money(it.transferencia + it.debito + it.qr) : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {money(it.runningBalance)}
                    </td>
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
