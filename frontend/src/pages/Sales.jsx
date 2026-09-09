import React, { useEffect, useRef, useState } from "react";
import { Download, ReceiptText, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal, Badge } from "../components";
import { money } from "../domain";
import { salesQuery, salesPdfPath, hasCorrections } from "../salesView";
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
