import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Download,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Trophy,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
} from "lucide-react";
import { Modal, Badge } from "../components";
import { money } from "../domain";
import {
  salesQuery,
  salesPdfPath,
  hasCorrections,
  calculateProductPerformance,
  sortAndFilterProducts,
} from "../salesView";
import { useStore, request, submitOnce, pendingOperation } from "../store";

const dateTime = (value) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  }).format(new Date(value));
const day = (value) => value?.split("-").reverse().join("/");

function Lines({ items }) {
  return (
    <div className="sales-table-scroll">
      <table className="sales-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio unitario</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <strong>{i.name}</strong>
                {i.options && <small>{i.options}</small>}
                {i.notes && <small>{i.notes}</small>}
              </td>
              <td>{i.quantity}</td>
              <td>{money(i.unitPrice)}</td>
              <td>{money(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Correction({ sale, onClose, onSaved }) {
  const state = useStore();
  const scope = "correction-" + sale.id;
  const pending = pendingOperation(scope);
  const [body, setBody] = useState(
    () =>
      pending?.body || {
        expectedVersion: sale.version,
        reason: "",
        items: sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          size: i.size || "",
          returnToStock: null,
        })),
      },
  );
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  function updateLine(index, patch) {
    setPreview(null);
    setBody((b) => ({
      ...b,
      items: b.items.map((i, n) => (n === index ? { ...i, ...patch } : i)),
    }));
  }
  async function run(confirm) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (confirm) {
        await submitOnce(scope, `/sales/${sale.id}/corrections`, body);
        onSaved();
      } else
        setPreview(
          await request(`/sales/${sale.id}/preview`, { method: "POST", body }),
        );
    } catch (e) {
      setError(e.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="correction-form">
      <h3>Corregir esta venta</h3>
      <p>
        Modifica el informe de ventas. No cambia el catálogo, el dinero cobrado
        ni el saldo de la cuenta.
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {preview?.stockChanges?.length > 0 && <div className="note"><strong>Efecto sobre existencias</strong>{preview.stockChanges.map((x,i)=><p key={i}>{x.name}: {x.change > 0 ? "+" : ""}{x.change} unidades{x.kind === "correction_no_return" ? " · no se reponen "+x.units+" unidades retiradas" : ""}</p>)}</div>}
      {pending ? (
        <div className="note">
          <p>
            Hay una corrección pendiente de confirmación. Reintentá para
            recuperar el resultado sin duplicarla.
          </p>
          <p>Motivo: {pending.body.reason}</p>
          <button
            className="primary"
            disabled={busy || !state.connected}
            onClick={() => run(true)}
          >
            Reintentar la misma corrección
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(false);
          }}
        >
          <fieldset disabled={busy || !!preview}>
            <legend>Valores corregidos</legend>
            {body.items.map((i, n) => (
              <div className="correction-row" key={i.id}>
                <label>
                  Producto
                  <select
                    value={i.productId}
                    onChange={(e) =>
                      updateLine(n, { productId: e.target.value, size: "", returnToStock: null })
                    }
                  >
                    {state.catalog.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {!p.available ? " (no disponible en carta)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad
                  <input
                    type="number"
                    required
                    min="0"
                    max="999"
                    step="1"
                    value={i.quantity}
                    onChange={(e) =>
                      updateLine(n, { quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Precio unitario ($)
                  <input
                    type="number"
                    required
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    value={i.unitPrice}
                    onChange={(e) =>
                      updateLine(n, { unitPrice: e.target.value })
                    }
                  />
                </label>
                {i.productId !== sale.items[n].productId && state.catalog.products.find(p=>p.id===i.productId)?.sizes?.length > 0 && <label>Presentación<select required value={i.size || ""} onChange={e=>updateLine(n,{size:e.target.value})}><option value="">Elegir presentación</option>{state.catalog.products.find(p=>p.id===i.productId).sizes.map(z=><option key={z.name} value={z.name}>{z.name}{z.available===false?" · sin stock":""}</option>)}</select></label>}
                {(i.productId !== sale.items[n].productId || i.quantity < sale.items[n].quantity) && <label>Unidades retiradas de esta venta<select required value={i.returnToStock==null?"":String(i.returnToStock)} onChange={e=>updateLine(n,{returnToStock:e.target.value==="true"})}><option value="">Indicar qué ocurrió físicamente</option><option value="false">No vuelven al stock (ya entregadas o no recuperables)</option><option value="true">Vuelven a estar disponibles físicamente</option></select><small>Solo se reponen unidades con un descuento de stock registrado. Cantidad 0 anula el renglón del informe, sin devolver dinero.</small></label>}
              </div>
            ))}
            <p className="note">
              El precio unitario es el importe final, incluyendo opciones. Si
              cambiás de producto, las opciones anteriores se quitan de la venta
              corregida.
            </p>
            <label>
              Motivo obligatorio
              <textarea
                required
                minLength="3"
                maxLength="500"
                value={body.reason}
                onChange={(e) =>
                  setBody((b) => ({ ...b, reason: e.target.value }))
                }
                placeholder="Explicá qué se registró mal"
              />
            </label>
          </fieldset>
          {!preview && (
            <button className="primary" disabled={busy || !state.connected}>
              Revisar antes y después
            </button>
          )}
        </form>
      )}
      {preview && !pending && (
        <div className="correction-preview">
          <h3>Antes · {money(preview.before.total)}</h3>
          <Lines items={preview.before.items} />
          <h3>Después · {money(preview.after.total)}</h3>
          <Lines items={preview.after.items} />
          <p>
            <strong>Motivo:</strong> {preview.reason}
          </p>
          <p>
            Cobros registrados: {money(sale.paid)}. Diferencia informativa:{" "}
            {money(Number(preview.after.total) - Number(sale.paid))}.
          </p>
          <div className="sales-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Volver a editar
            </button>
            <button
              className="primary"
              disabled={busy || !state.connected}
              onClick={() => run(true)}
            >
              {busy ? "Guardando…" : "Confirmar corrección"}
            </button>
          </div>
        </div>
      )}
      <button className="text-button" disabled={busy} onClick={onClose}>
        Cerrar edición
      </button>
    </section>
  );
}

function SaleDetail({ sale, onClose, onSaved }) {
  const state = useStore();
  const [editing, setEditing] = useState(
    !!pendingOperation("correction-" + sale.id),
  );
  return (
    <Modal title={`Venta #${sale.number}`} onClose={onClose}>
      <div className="sale-detail">
        <div className="sale-metadata">
          <span>{sale.table == null ? "Mostrador" : "Mesa " + sale.table}</span>
          <span>{dateTime(sale.createdAt)}</span>
          <span>Jornada {day(sale.day)}</span>
          <span>
            {sale.method} · {sale.cashier}
          </span>
        </div>
        <div className="sales-detail-total">
          <strong>{money(sale.total)}</strong>
          <span>
            Total {sale.version > 0 && <Badge>Incluye correcciones</Badge>}
          </span>
        </div>
        <Lines items={sale.items} />
        <p>
          Cobros registrados: <strong>{money(sale.paid)}</strong>
        </p>
        {sale.version > 0 && (
          <p className="note">
            Diferencia informativa: {money(sale.difference)} (total menos cobros
            registrados). No genera automáticamente cobros ni devoluciones.
          </p>
        )}
        <details>
          <summary>Venta original · {money(sale.originalTotal)}</summary>
          <Lines items={sale.originalItems} />
        </details>
        {sale.corrections.length > 0 && (
          <section className="sales-history">
            <h3>Historial de correcciones</h3>
            {sale.corrections.map((c) => (
              <details key={c.id}>
                <summary>
                  Versión {c.version} · {dateTime(c.createdAt)} ·{" "}
                  {c.administrator}
                </summary>
                <p>
                  <strong>Motivo:</strong> {c.reason}
                </p>
                <h4>Antes · {money(c.before.total)}</h4>
                <Lines items={c.before.items} />
                <h4>Después · {money(c.after.total)}</h4>
                <Lines items={c.after.items} />
              </details>
            ))}
          </section>
        )}
        {state.user?.role === "admin" &&
          (editing ? (
            <Correction
              sale={sale}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                onSaved();
              }}
            />
          ) : (
            <button className="secondary" onClick={() => setEditing(true)}>
              Corregir venta
            </button>
          ))}
      </div>
    </Modal>
  );
}

export default function Sales() {
  const state = useStore();
  const admin = state.user?.role === "admin";
  const [range, setRange] = useState(null);
  const [inputs, setInputs] = useState({ start: "", end: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [reload, setReload] = useState(0);
  const seq = useRef(0);
  const inputsDirty = useRef(false);
  const query = salesQuery(range);
  const [view, setView] = useState("operations"); // "operations" | "products"
  const [productSort, setProductSort] = useState("units"); // "units" | "revenue"
  const [productCategory, setProductCategory] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const productPerf = useMemo(
    () => calculateProductPerformance(data?.sales || [], state.catalog?.products || []),
    [data?.sales, state.catalog?.products],
  );

  const displayedProducts = useMemo(
    () =>
      sortAndFilterProducts(productPerf.soldProducts, {
        sortBy: productSort,
        category: productCategory,
        search: productSearch,
      }),
    [productPerf.soldProducts, productSort, productCategory, productSearch],
  );
  function chooseRange(next) {
    inputsDirty.current = !!(next && !next.last);
    setRange(next);
    setData(null);
    setSelected(null);
    setPage(0);
    setNotice("");
    setError("");
    setExportError("");
    setRefreshing(true);
    setReload((n) => n + 1);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      const ticket = ++seq.current;
      setRefreshing(true);
      try {
        const next = await request("/sales" + query);
        if (active && ticket === seq.current) {
          setData(next);
          setError("");
          if ((!range || range.last) && !inputsDirty.current)
            setInputs({ start: next.start, end: next.end });
        }
      } catch (e) {
        if (active && ticket === seq.current) setError(e.message);
      } finally {
        if (active && ticket === seq.current) setRefreshing(false);
      }
    }
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [query, reload]);
  const detail = data?.sales.find((s) => s.id === selected);
  const pages = Math.max(1, Math.ceil((data?.sales.length || 0) / 20));
  const visiblePage = Math.min(page, pages - 1);
  async function exportPdf() {
    if (exporting || !data) return;
    setExporting(true);
    setExportError("");
    try {
      const blob = await request(salesPdfPath(data), { asBlob: true });
      if (!blob.type.includes("application/pdf"))
        throw new Error("El servidor no devolvió un PDF válido.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NaniFer-ventas-${data.start}-${data.end}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="sales-page">
      <div className="sales-heading">
        <div>
          <span className="eyebrow">NANIFER · ATENCIÓN</span>
          <h1>Ventas</h1>
          <p>Operaciones cobradas, con su historial.</p>
        </div>
        {admin && (
          <button
            className="secondary"
            onClick={exportPdf}
            disabled={!data || !!error || exporting || !state.connected}
          >
            <Download size={17} />
            {exporting ? "Generando…" : "Descargar PDF"}
          </button>
        )}
      </div>
      <div className="panel sales-filters">
        <div
          className="sales-quick-filters"
          role="group"
          aria-label="Filtros rápidos"
        >
          {(admin ? [1, 7, 31] : [1]).map((days) => (
            <button
              key={days}
              className="secondary"
              type="button"
              aria-pressed={days === 1 ? !range : range?.last === days}
              disabled={refreshing || state.connected === false}
              onClick={() => chooseRange(days === 1 ? null : { last: days })}
            >
              {days === 1 ? "Jornada actual" : `Últimas ${days} jornadas`}
            </button>
          ))}
        </div>
        {admin ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              chooseRange({ ...inputs });
            }}
          >
            <label>
              Desde (jornada)
              <input
                type="date"
                required
                value={inputs.start}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  inputsDirty.current = true;
                  setInputs((v) => ({ ...v, start: value }));
                }}
              />
            </label>
            <label>
              Hasta (jornada)
              <input
                type="date"
                required
                value={inputs.end}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  inputsDirty.current = true;
                  setInputs((v) => ({ ...v, end: value }));
                }}
              />
            </label>
            <button
              className="primary"
              disabled={refreshing || state.connected === false}
            >
              Consultar
            </button>
          </form>
        ) : (
          <strong>Podés consultar las ventas de la jornada actual.</strong>
        )}
        <p>
          De 04:00 a 04:00 del día siguiente · Buenos Aires
          {admin
            ? " · Hasta 31 jornadas inclusive"
            : " · Historial disponible para el administrador"}
        </p>
      </div>
      {data &&
        inputsDirty.current &&
        (inputs.start !== data.start || inputs.end !== data.end) && (
          <p className="sales-draft-note">
            Fechas editadas: pulsá Consultar para aplicarlas. El listado y el
            PDF siguen correspondiendo al período consultado.
          </p>
        )}
      <p
        className={`sales-connection ${state.connected === false || error ? "unavailable" : ""}`}
        role="status"
      >
        {state.connected === false
          ? "Sin conexión. No se pudo actualizar el informe."
          : error
            ? "No se pudo consultar el período."
            : refreshing
              ? "Actualizando ventas…"
              : "Datos actualizados · actualización automática"}
      </p>
      {exportError && (
        <p className="alert" role="alert">
          {exportError}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}{" "}
          {data &&
            "Los datos visibles corresponden a la última consulta exitosa."}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Consultando ventas…</p>}
      {data && (
        <>
          <div className="sales-period">
            <h2>{data.periodTitle}</h2>
            <p>{data.periodNote} · Buenos Aires</p>
          </div>
          <div
            className={`sales-summary ${hasCorrections(data) ? "" : "without-corrections"}`}
          >
            <div className="sales-highlight">
              <ReceiptText size={22} />
              <span>Total vendido</span>
              <strong>{money(data.total)}</strong>
              <small>{data.count} operaciones cobradas</small>
              {hasCorrections(data) && (
                <small>Incluye las correcciones de este período.</small>
              )}
            </div>
            <div className="panel">
              <span>Cobros registrados</span>
              <strong>{money(data.paid)}</strong>
              <small>Importes originales de los cobros</small>
            </div>
            {hasCorrections(data) && (
              <div className="panel sales-corrections-card">
                <span>Diferencia por correcciones</span>
                <strong>{money(data.difference)}</strong>
                <small>
                  {data.correctedCount}{" "}
                  {data.correctedCount === 1
                    ? "venta corregida"
                    : "ventas corregidas"}
                  . No genera automáticamente cobros ni devoluciones.
                </small>
              </div>
            )}
          </div>
          {!hasCorrections(data) && (
            <p className="sales-no-corrections">
              Sin correcciones en este período
            </p>
          )}

          <div className="sales-tabs" role="tablist" aria-label="Secciones del informe de ventas">
            <button
              type="button"
              role="tab"
              aria-selected={view === "operations"}
              className={`sales-tab-btn ${view === "operations" ? "active" : ""}`}
              onClick={() => setView("operations")}
            >
              <ReceiptText size={18} />
              <span>Operaciones y Cobros</span>
              <span className="tab-pill">{data.count}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "products"}
              className={`sales-tab-btn ${view === "products" ? "active" : ""}`}
              onClick={() => setView("products")}
            >
              <TrendingUp size={18} />
              <span>Rendimiento de Productos (Más y menos vendidos)</span>
              <span className="tab-pill">{productPerf.soldProducts.length}</span>
            </button>
          </div>

          {view === "operations" ? (
            <>
              <details className="panel">
                <summary>Totales por jornada</summary>
                <div className="sales-table-scroll">
                  <table className="sales-table">
                    <thead>
                      <tr>
                        <th>Jornada</th>
                        <th>Operaciones</th>
                        <th>Total</th>
                        <th>Cobros registrados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map((d) => (
                        <tr key={d.day}>
                          <td>{day(d.day)}</td>
                          <td>{d.count}</td>
                          <td>{money(d.total)}</td>
                          <td>{money(d.paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <section className="panel sales-list">
                <h2>Ventas cobradas</h2>
                {!data.count ? (
                  <div className="sales-empty">
                    <ReceiptText size={32} />
                    <h3>No hay ventas cobradas en este período</h3>
                    <p>Las cuentas con saldo sin cobrar no se incluyen.</p>
                  </div>
                ) : (
                  <>
                    <div className="sales-table-scroll">
                      <table className="sales-table">
                        <thead>
                          <tr>
                            <th>Venta / origen</th>
                            <th>Fecha y hora</th>
                            <th>Responsable del cobro</th>
                            <th>Medio</th>
                            <th>Total</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sales
                            .slice(visiblePage * 20, visiblePage * 20 + 20)
                            .map((s) => (
                              <tr key={s.id}>
                                <td>
                                  <span>Venta #{s.number}</span>
                                  <small>
                                    {s.table == null ? "Mostrador" : "Mesa " + s.table}
                                    {s.version > 0 && " · Corregida"}
                                  </small>
                                </td>
                                <td>
                                  {dateTime(s.createdAt)}
                                  <small>Jornada {day(s.day)}</small>
                                </td>
                                <td>{s.cashier}</td>
                                <td>{s.method}</td>
                                <td>
                                  <strong>{money(s.total)}</strong>
                                </td>
                                <td>
                                  <button
                                    className="secondary"
                                    disabled={!!error || !state.connected}
                                    onClick={() => setSelected(s.id)}
                                  >
                                    Ver detalle
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sales-pagination">
                      <button
                        className="secondary"
                        aria-label="Página anterior"
                        disabled={!visiblePage}
                        onClick={() => setPage(visiblePage - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        Página {visiblePage + 1} de {pages} · {data.count} ventas
                      </span>
                      <button
                        className="secondary"
                        aria-label="Página siguiente"
                        disabled={visiblePage >= pages - 1}
                        onClick={() => setPage(visiblePage + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}
              </section>
            </>
          ) : (
            <div className="sales-products-view">
              {/* KPIs de Rendimiento */}
              <div className="product-perf-kpis">
                <div className="perf-kpi-card highlight">
                  <div className="perf-kpi-header">
                    <span className="perf-kpi-title">Más vendido (Unidades)</span>
                    <Trophy size={18} color="#d4af37" />
                  </div>
                  {productPerf.kpis.topByUnits ? (
                    <>
                      <strong className="perf-kpi-name" title={productPerf.kpis.topByUnits.name}>
                        {productPerf.kpis.topByUnits.name}
                      </strong>
                      <div className="perf-kpi-value">{productPerf.kpis.topByUnits.unitsSold} u.</div>
                      <small className="perf-kpi-subtitle">
                        {money(productPerf.kpis.topByUnits.revenue)} recaudados ({productPerf.kpis.topByUnits.shareUnits.toFixed(1)}% del volumen)
                      </small>
                    </>
                  ) : (
                    <small className="perf-kpi-subtitle">Sin ventas registradas</small>
                  )}
                </div>

                <div className="perf-kpi-card highlight">
                  <div className="perf-kpi-header">
                    <span className="perf-kpi-title">Mayor recaudación ($)</span>
                    <DollarSign size={18} color="#27ae60" />
                  </div>
                  {productPerf.kpis.topByRevenue ? (
                    <>
                      <strong className="perf-kpi-name" title={productPerf.kpis.topByRevenue.name}>
                        {productPerf.kpis.topByRevenue.name}
                      </strong>
                      <div className="perf-kpi-value">{money(productPerf.kpis.topByRevenue.revenue)}</div>
                      <small className="perf-kpi-subtitle">
                        {productPerf.kpis.topByRevenue.unitsSold} u. vendidas ({productPerf.kpis.topByRevenue.shareRevenue.toFixed(1)}% de la facturación)
                      </small>
                    </>
                  ) : (
                    <small className="perf-kpi-subtitle">Sin ventas registradas</small>
                  )}
                </div>

                <div className="perf-kpi-card">
                  <div className="perf-kpi-header">
                    <span className="perf-kpi-title">Variedad con ventas</span>
                    <Package size={18} color="#8c7e75" />
                  </div>
                  <strong className="perf-kpi-name">{productPerf.kpis.distinctSold} productos</strong>
                  <div className="perf-kpi-value">{productPerf.kpis.totalUnitsSold} u.</div>
                  <small className="perf-kpi-subtitle">Unidades totales despachadas en el período</small>
                </div>

                <div className="perf-kpi-card">
                  <div className="perf-kpi-header">
                    <span className="perf-kpi-title">Sin salida en el período</span>
                    <AlertTriangle size={18} color="#e17055" />
                  </div>
                  <strong className="perf-kpi-name">{productPerf.kpis.distinctUnsold} productos</strong>
                  <div className="perf-kpi-value" style={{ color: productPerf.kpis.distinctUnsold > 0 ? "#c0392b" : "#27ae60" }}>
                    {productPerf.kpis.distinctUnsold} ítems
                  </div>
                  <small className="perf-kpi-subtitle">Productos en carta con 0 pedidos en estas fechas</small>
                </div>
              </div>

              {/* Filtros y herramientas de productos */}
              <div className="product-perf-toolbar">
                <div className="perf-toolbar-group">
                  <span className="perf-toolbar-label">
                    <ArrowUpDown size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Ordenar por:
                  </span>
                  <button
                    type="button"
                    className={`perf-sort-btn ${productSort === "units" ? "active" : ""}`}
                    onClick={() => setProductSort("units")}
                  >
                    🥇 Más vendidos (Unidades)
                  </button>
                  <button
                    type="button"
                    className={`perf-sort-btn ${productSort === "revenue" ? "active" : ""}`}
                    onClick={() => setProductSort("revenue")}
                  >
                    💰 Mayor recaudación ($)
                  </button>
                </div>

                <div className="perf-toolbar-group">
                  {productPerf.categories.length > 0 && (
                    <select
                      className="perf-category-select"
                      value={productCategory}
                      onChange={(e) => setProductCategory(e.target.value)}
                      aria-label="Filtrar por categoría"
                    >
                      <option value="">Todas las categorías</option>
                      {productPerf.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="search"
                    className="perf-search-input"
                    placeholder="Buscar producto…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    aria-label="Buscar producto por nombre"
                  />
                </div>
              </div>

              {/* Tabla de Ranking de Productos */}
              <section className="panel sales-list">
                <div className="panel-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Ranking de Productos</h2>
                    <small style={{ color: "#70645d" }}>
                      {displayedProducts.length} {displayedProducts.length === 1 ? "producto mostrado" : "productos mostrados"}
                      {productCategory ? ` en ${productCategory}` : ""}
                      {productSort === "units" ? " · Ordenado por cantidad de pedidos" : " · Ordenado por dinero recaudado"}
                    </small>
                  </div>
                </div>

                {!displayedProducts.length ? (
                  <div className="sales-empty">
                    <BarChart3 size={32} />
                    <h3>No hay productos que coincidan con la búsqueda</h3>
                    <p>Probá cambiando el término o seleccionando otra categoría.</p>
                  </div>
                ) : (
                  <div className="sales-table-scroll">
                    <table className="sales-table ranking-table">
                      <thead>
                        <tr>
                          <th style={{ width: 50, textAlign: "center" }}>#</th>
                          <th>Producto</th>
                          <th style={{ minWidth: 160 }}>Rotación relativa</th>
                          <th style={{ textAlign: "right" }}>Unidades</th>
                          <th style={{ textAlign: "right" }}>Recaudación</th>
                          <th style={{ textAlign: "right" }}>% del total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedProducts.map((p, idx) => {
                          const rank = idx + 1;
                          const maxVal =
                            productSort === "revenue"
                              ? productPerf.kpis.topByRevenue?.revenue || 1
                              : productPerf.kpis.topByUnits?.unitsSold || 1;
                          const currVal = productSort === "revenue" ? p.revenue : p.unitsSold;
                          const progressPct = Math.min(
                            100,
                            Math.max(4, Math.round((currVal / maxVal) * 100)),
                          );

                          return (
                            <tr key={p.id}>
                              <td className="ranking-pos-cell" style={{ textAlign: "center", verticalAlign: "middle" }}>
                                {rank === 1 ? (
                                  <span className="ranking-badge medal-1" title="Primer puesto">🥇</span>
                                ) : rank === 2 ? (
                                  <span className="ranking-badge medal-2" title="Segundo puesto">🥈</span>
                                ) : rank === 3 ? (
                                  <span className="ranking-badge medal-3" title="Tercer puesto">🥉</span>
                                ) : (
                                  <span className="ranking-num">#{rank}</span>
                                )}
                              </td>
                              <td>
                                <strong>{p.name}</strong>
                                <div>
                                  <span className="category-pill">{p.category}</span>
                                </div>
                              </td>
                              <td style={{ verticalAlign: "middle" }}>
                                <div className="perf-progress-container">
                                  <div className="perf-progress-track">
                                    <div
                                      className={`perf-progress-bar ${rank <= 3 ? "top-three" : ""}`}
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <span className="perf-progress-text">
                                    {productSort === "revenue"
                                      ? money(p.revenue)
                                      : `${p.unitsSold} u.`}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: "right", verticalAlign: "middle", fontWeight: 700 }}>
                                {p.unitsSold} u.
                              </td>
                              <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                                <strong>{money(p.revenue)}</strong>
                              </td>
                              <td style={{ textAlign: "right", verticalAlign: "middle", color: "#70645d", fontWeight: 600 }}>
                                {productSort === "revenue"
                                  ? `${p.shareRevenue.toFixed(1)}%`
                                  : `${p.shareUnits.toFixed(1)}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Sección de Productos Sin Salida en el Período */}
              {productPerf.unsoldProducts.length > 0 && (
                <details className="panel unsold-products-panel">
                  <summary>
                    <div className="unsold-summary-title">
                      <AlertTriangle size={18} className="unsold-icon" />
                      <span>Productos sin ventas en este período ({productPerf.unsoldProducts.length})</span>
                    </div>
                    <small>Hacé clic aquí para ver qué ítems del menú no registraron ninguna salida</small>
                  </summary>
                  <div className="unsold-intro-hint">
                    <p>
                      Estos productos están dados de alta en la carta de NaniFer pero no tuvieron ventas en las fechas seleccionadas.
                      Te sirve para evaluar si conviene sacarlos de la carta, promocionarlos o si no conviene reponer ingredientes que puedan echarse a perder.
                    </p>
                  </div>
                  <div className="sales-table-scroll">
                    <table className="sales-table unsold-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Categoría</th>
                          <th>Precio de lista</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productPerf.unsoldProducts.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                            </td>
                            <td>
                              <span className="category-pill">{p.category}</span>
                            </td>
                            <td>{money(p.price)}</td>
                            <td>
                              <Badge tone={p.available ? "amber" : "neutral"}>
                                {p.available ? "Activo (0 ventas)" : "Pausado"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
      {detail && (
        <SaleDetail
          key={detail.id}
          sale={detail}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setNotice(
              "Corrección guardada. El dinero cobrado permanece sin cambios.",
            );
            setReload((n) => n + 1);
          }}
        />
      )}
    </main>
  );
}
