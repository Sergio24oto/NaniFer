import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, ClipboardList, Coffee, ChefHat, Volume2, VolumeX, Maximize2, Minimize2, Clock, CheckCircle2 } from "lucide-react";
import { Badge, Items, Modal } from "../components";
import { useStore, mutate, submitOnce, pendingOperation, refresh, request } from "../store";
import { money, activeAccount, statuses, time, itemInput, estimate, tableLabel, tableSector, orderHasStation, getProductStation } from "../domain";
import {useDraft} from "../useDraft";
import {readDraft} from "../drafts";
import Payment from "./Payment";
import QuickEntry from "./QuickEntry";
import Reservations from "./Reservations";
export function getTables(s) {
  return (s.tables && s.tables.length > 0)
    ? s.tables
    : Array.from({ length: 15 }, (_, i) => ({
        number: i + 1,
        sector: "salon",
        displayNumber: i + 1,
        name: `Mesa ${i + 1}`
      }));
}

function ManageTablesModal({ tables, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const salonTables = tables.filter(t => t.sector === "salon");
  const afueraTables = tables.filter(t => t.sector === "afuera");

  async function addTable(sector) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await request("/tables", {
        method: "POST",
        body: { sector }
      });
      await onChanged();
      setMsg(`Mesa agregada: ${res.name}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTable(num, name) {
    if (!window.confirm(`¿Eliminar ${name}?`)) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await request("/tables/" + num, { method: "DELETE" });
      await onChanged();
      setMsg(`${name} eliminada.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Gestionar mesas del local" onClose={() => !busy && onClose()}>
      <p style={{ color: "#624335", marginBottom: 14 }}>
        Administrá las mesas de los sectores Salón y Afuera. Podés sumar nuevas mesas en cualquier momento.
      </p>

      {error && <p className="alert" role="alert">{error}</p>}
      {msg && <p className="success" role="status">{msg}</p>}

      <div className="manage-tables-sector-block">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong>🏠 Sector Salón (Adentro) · {salonTables.length} mesas</strong>
          <button
            type="button"
            className="primary"
            disabled={busy}
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => addTable("salon")}
          >
            + Agregar mesa en Salón
          </button>
        </div>
        <div className="manage-tables-list">
          {salonTables.map(t => (
            <div key={t.number} className="manage-table-pill">
              <span><strong>Mesa {t.displayNumber}</strong></span>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                style={{ padding: 0, color: "#a64b3a", marginLeft: 4 }}
                title="Eliminar mesa"
                onClick={() => deleteTable(t.number, t.name)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="manage-tables-sector-block" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong>☀️ Sector Afuera (Exterior) · {afueraTables.length} mesas</strong>
          <button
            type="button"
            className="primary"
            disabled={busy}
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => addTable("afuera")}
          >
            + Agregar mesa en Afuera
          </button>
        </div>
        <div className="manage-tables-list">
          {afueraTables.map(t => (
            <div key={t.number} className="manage-table-pill afuera">
              <span><strong>Mesa {t.displayNumber}</strong></span>
              <small style={{ color: "#92400e" }}>Afuera</small>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                style={{ padding: 0, color: "#a64b3a", marginLeft: 4 }}
                title="Eliminar mesa"
                onClick={() => deleteTable(t.number, t.name)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function Salon({
  nav,
  message
}) {
  const s = useStore();
  const [reservingTable, setReservingTable] = useState(null);
  const [reservationDate, setReservationDate] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [managingTables, setManagingTables] = useState(false);
  const date = reservationDate || s.calendarToday;
  const opened = s.accounts.filter(a => !a.closedAt && a.table != null);
  const ready = s.orders.filter(o => o.status === "listo para entregar");
  const pendingCalls = (s.calls || []).filter(c => c.status === "pending" || c.pending_table != null);
  const allTables = getTables(s);
  const visibleTables = sectorFilter === "all"
    ? allTables
    : allTables.filter(t => t.sector === sectorFilter);
  return <main className="salon-compact">
    <div className="page-heading"><div className="intro"><span className="eyebrow">ATENCIÓN</span><h1>Mesas y Mostrador</h1><p>{opened.length} de {allTables.length} mesas ocupadas · {money(opened.reduce((n, a) => n + a.balance, 0))} pendiente</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><button className="secondary" onClick={() => nav("/atencion/comandera")}><ClipboardList size={17} /> Mozas · {ready.length} listos</button>{s.user?.role === "admin" && <button className="secondary" onClick={() => setManagingTables(true)}>⚙️ Gestionar mesas</button>}</div></div>
    {message && <p className="success" role="status">{message}</p>}
    {pendingCalls.length > 0 && (
      <div className="calls-alert-banner" role="alert">
        <div className="calls-alert-content">
          <span className="calls-alert-icon">🛎️</span>
          <div>
            <strong>¡Llamado de atención en salón!</strong>
            <p>
              {pendingCalls.length === 1
                ? `La ${tableLabel(s, pendingCalls[0].table)} está llamando a la moza.`
                : `Mesas llamando a la moza: ${pendingCalls.map(c => tableLabel(s, c.table)).join(", ")}.`}
            </p>
          </div>
        </div>
        <div className="calls-alert-actions">
          {pendingCalls.map(c => (
            <button
              key={c.id}
              type="button"
              className="call-quick-attend-btn"
              onClick={(e) => {
                e.stopPropagation();
                mutate('/calls/' + c.id + '/attend', {});
              }}
            >
              ✓ Atender {tableLabel(s, c.table)}
            </button>
          ))}
        </div>
      </div>
    )}
    <details className="reservation-date"><summary>Ver reservas de otra fecha</summary><label>Fecha de reservas<input type="date" value={date || ""} onInput={e => setReservationDate(e.currentTarget.value)} /></label><button className="text-button" onClick={() => setReservationDate("")}>Volver a hoy</button><small>La ocupación y los saldos siempre son los actuales.</small></details>
    <div className="catalog-actions" style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
      {[
        ["all", `Todas (${allTables.length})`],
        ["salon", `🏠 Salón (${allTables.filter(t => t.sector === "salon").length})`],
        ["afuera", `☀️ Afuera (${allTables.filter(t => t.sector === "afuera").length})`]
      ].map(([sec, label]) => (
        <button
          key={sec}
          className={sectorFilter === sec ? "primary" : "secondary"}
          onClick={() => setSectorFilter(sec)}
        >
          {label}
        </button>
      ))}
    </div>
    <div className="table-grid">
      {sectorFilter !== "afuera" && (
        <button className="table-card counter-card" onClick={() => nav("/atencion/mostrador")}>
          <div className="row"><h2>Mostrador</h2><Coffee size={24} /></div>
          <strong>Nueva compra</strong>
          <small>Sin mesa · seleccionar y cobrar</small>
          {readDraft(s.user.id,"counter")?.cart.length>0&&<small className="draft-hint">Consumos sin confirmar</small>}
        </button>
      )}
      {visibleTables.map((t) => {
        const n = t.number,
          directAcc = activeAccount(s, n),
          parentAcc = s.accounts.find(acc => !acc.closedAt && acc.joinedTables?.includes(n)),
          a = directAcc || parentAcc,
          targetTable = parentAcc ? parentAcc.table : n,
          isJoinedChild = !!parentAcc,
          joinedChildren = directAcc?.joinedTables || [],
          isJoinedParent = joinedChildren.length > 0,
          r = ready.some(o => o.table === targetTable),
          call = pendingCalls.find(c => c.table === n);
        const all = (s.reservations || []).filter(x => x.table === n);
        const reservation = all.find(x => x.date === date) || (!reservationDate ? all.find(x => x.date > s.calendarToday) || all[0] : null);
        const tableOrders = s.orders.filter(o => o.accountId === a?.id);
        const hasOrders = a && tableOrders.length > 0;
        return <article key={n} className={"table-card table-card-actions " + (t.sector === "afuera" ? "card-sector-afuera " : "") + (a ? "occupied " : "") + (hasOrders ? "has-orders " : "") + (r ? "ready" : "") + (reservation ? " has-reservation" : "") + (call ? " calling" : "")}>
          {call && (
            <div className="call-badge">
              <div className="call-badge-title">
                <span>🛎️ <strong>¡Llaman a la moza!</strong></span>
                <small>{time(call.createdAt)}</small>
              </div>
              <button
                type="button"
                className="attend-call-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  mutate('/calls/' + call.id + '/attend', {});
                }}
              >
                ✓ Marcar atendido
              </button>
            </div>
          )}
          <button className="table-open" onClick={() => nav("/atencion/mesas/" + targetTable)}>
          <div className="row">
            <div>
              <span className={`sector-tag ${t.sector === "afuera" ? "sector-afuera" : "sector-salon"}`}>
                {t.sector === "afuera" ? "☀️ Afuera" : "🏠 Salón"}
              </span>
              <h2>Mesa {t.displayNumber}</h2>
              {isJoinedChild && <span className="joined-tag">🔗 Junta con {tableLabel(s, parentAcc.table)}</span>}
              {isJoinedParent && <span className="joined-tag">🔗 Junta con {joinedChildren.map(jt => tableLabel(s, jt)).join(", ")}</span>}
            </div>
            {hasOrders ? (
              <Badge tone="red">Pedido ya realizado</Badge>
            ) : (
              <Badge tone={a ? "amber" : "green"}>{a ? "Ocupada" : "Libre"}</Badge>
            )}
          </div>
          <div className="table-balance">
            <small>Pendiente de cobro</small>
            <strong className={hasOrders ? "balance-due-text" : ""}>{money(a?.balance || 0)}</strong>
          </div>
          {hasOrders && (
            <div className="table-orders-badge">
              <span>🔔 {tableOrders.length} {tableOrders.length === 1 ? "pedido recibido" : "pedidos recibidos"}</span>
              {r && <small className="ready-hint">✓ ¡Listo!</small>}
            </div>
          )}
          {!hasOrders && r && <small className="ready-hint">Productos listos para entregar</small>}
          {reservation && <small className="reservation-hint">Mesa reservada para {reservation.name} a las {reservation.time}{reservation.date !== s.calendarToday ? " · " + reservation.date.split("-").reverse().join("/") : ""}{reservation.date < s.calendarToday ? " · pendiente" : ""}</small>}
          {readDraft(s.user.id,"table-"+n)?.cart.length>0&&<small className="draft-hint">Consumos sin confirmar · continuar</small>}
        </button>{s.user?.permissions?.includes("reservations.manage")&&<button className="secondary reserve-table" onClick={()=>setReservingTable(n)}>Reservar</button>}</article>;
      })}

    </div>
    {reservingTable&&<Reservations table={reservingTable} account={activeAccount(s,reservingTable)} onClose={()=>setReservingTable(null)}/>}
    {managingTables && <ManageTablesModal tables={allTables} onClose={() => setManagingTables(false)} onChanged={async () => { await refresh(); }} />}
  </main>;
}
export function restoreCart(pending, catalog) {
  return (pending?.body.items || []).map(i => {
    const p = catalog.products.find(p => p.id === i.productId);
    return {
      ...i,
      name: p?.name || "Producto",
      unitPrice: p ? estimate(p, i.size, i.extras) : 0
    };
  });
}
export function Account({
  table,
  nav
}) {
  const s = useStore(),
    allTables = getTables(s),
    parentAcc = s.accounts.find(acc => !acc.closedAt && acc.joinedTables?.includes(table)),
    effectiveTable = parentAcc ? parentAcc.table : table,
    a = parentAcc || activeAccount(s, table);
  const scope = "consumptions-" + effectiveTable,
    pendingSave = pendingOperation(scope);
  const draft=useDraft(s.user.id,"table-"+effectiveTable,()=>restoreCart(pendingSave,s.catalog),pendingSave?.body.expectedAccount ?? a?.id ?? null);
  const {cart,setCart}=draft;
  const [discard,setDiscard]=useState(false);
  const [preparation, setPreparation] = useState(pendingSave?.body.needsPreparation || false);
  // Keep the visit visible when entry began: a concurrent table reuse must not redirect this draft.
  const expectedAccount=draft.account, setExpectedAccount=draft.setAccount;
  const pendingPay=a&&pendingOperation("pay-"+a.id);
  const [ack, setAck] = useState(null);
  const [pay, setPay] = useState(false),
    [reserving, setReserving] = useState(false),
    [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const orders = s.orders.filter(o => o.accountId === a?.id),
    undelivered = orders.some(o => o.status !== "entregado");
  const reservation = (s.reservations || []).find(r => r.table === effectiveTable && r.date === s.calendarToday);
  const changed = expectedAccount !== (a?.id || null);
  const tableCalls = (s.calls || []).filter(c => c.table === effectiveTable && (c.status === "pending" || c.pending_table != null));
  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    await submitOnce(scope, "/tables/" + effectiveTable + "/consumptions", {
      expectedAccount,
      items: cart.map(itemInput),
      needsPreparation: preparation,
      reservationAcknowledgment: ack
    });
    draft.clear();
    nav("/atencion", "Guardado correctamente. Consumos registrados en la mesa " + effectiveTable + ". Quedan pendientes de cobro.");
  }
  return <main className="staff-entry"><button className="back" onClick={() => nav("/atencion")}><ArrowLeft size={17} />Volver al salón</button>
    <div className="page-heading">
      <div className="intro">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1>{tableLabel(s, table)}</h1>
          <span className={`sector-tag ${tableSector(s, table) === "afuera" ? "sector-afuera" : "sector-salon"}`} style={{ fontSize: 13, padding: "3px 8px", marginBottom: 0 }}>
            {tableSector(s, table) === "afuera" ? "☀️ Sector Afuera" : "🏠 Sector Salón"}
          </span>
          {a?.joinedTables?.length > 0 && (
            <span className="joined-tag" style={{ fontSize: 13, padding: "4px 8px" }}>
              🔗 Junta con {a.joinedTables.map(jt => tableLabel(s, jt)).join(", ")}
            </span>
          )}
          {parentAcc && (
            <span className="joined-tag" style={{ fontSize: 13, padding: "4px 8px" }}>
              🔗 Junta con {tableLabel(s, parentAcc.table)}
            </span>
          )}
        </div>
        <p>{a ? "Visita abierta · " + a.waitress : "Elegí productos para iniciar la visita al guardar."}</p>
      </div>
      <div className="row">
        <Badge tone={a ? "amber" : "green"}>{a ? "Ocupada" : "Libre"}</Badge>
        {s.user?.permissions?.includes("reservations.manage") && <button className="secondary" onClick={() => setReserving(true)}>Reservas</button>}
        <button className="secondary" onClick={() => setJoining(true)}>🔗 Juntar mesas</button>
      </div>
    </div>
    {error && <p className="alert" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    {pendingSave && !busy && <p className="note">Hay consumos sin confirmación. Reintentá para recuperar la misma operación; no se duplicará.</p>}
    {draft.storageError&&<p className="alert">{draft.storageError}</p>}
    {cart.length>0&&!pendingSave&&<p className="note">Borrador de esta mesa: todavía no se registró. <button disabled={busy} onClick={()=>setDiscard(true)}>Descartar borrador</button></p>}
    {discard&&<Modal title="Descartar borrador" onClose={()=>setDiscard(false)}><p>¿Descartar los consumos sin guardar de esta mesa?</p><button className="primary" onClick={()=>{draft.clear();setDiscard(false);setExpectedAccount(a?.id||null);}}>Confirmar descarte</button></Modal>}
    {changed && !pendingSave && <p className="note">La visita de la mesa cambió desde que abriste esta pantalla. <button onClick={() => {
        setExpectedAccount(a?.id || null);
        setAck(null);
      }}>Revisé la mesa: usar la visita actual</button></p>}
    {!a && reservation && <div className="note"><p>Mesa reservada para {reservation.name} a las {reservation.time}.</p><label className="option"><input type="checkbox" checked={ack === reservation.acknowledgment} onChange={e => setAck(e.target.checked ? reservation.acknowledgment : null)} />Continuar con esta mesa teniendo en cuenta la reserva</label></div>}
    {tableCalls.map(c => (
      <div className="call-banner-detail" key={c.id}>
        <div className="call-banner-info">
          <span className="call-banner-icon">🛎️</span>
          <div>
            <strong>¡Esta mesa está llamando a la moza!</strong>
            <p>Llamado registrado a las {time(c.createdAt)}. Acercate a la mesa para asistirlos.</p>
          </div>
        </div>
        <button
          type="button"
          className="attend-detail-btn"
          disabled={busy || !s.connected}
          onClick={() => run(() => mutate('/calls/' + c.id + '/attend', {}))}
        >
          ✓ Marcar llamado como atendido
        </button>
      </div>
    ))}
    <div className="table-detail-container">
      {/* 1. SECCIÓN PRINCIPAL: PEDIDOS DE LA MESA Y ESTADO DE CUENTA */}
      <section className="panel primary-orders-panel">
        <div className="panel-header-row">
          <div>
            <span className="section-eyebrow">PEDIDOS DE LA MESA</span>
            <h2>{orders.length > 0 ? `Mozas (${orders.length})` : "Mozas de la mesa"}</h2>
            <p className="section-sub">
              {a ? `Visita activa ${a.waitress ? "· Responsable: " + a.waitress : ""}` : "Mesa libre · Sin visita activa"}
            </p>
          </div>
          {a && (
            <div className="balance-badge-card">
              <div className="balance-row">
                <span className="balance-lbl">Consumos</span>
                <span className="balance-val">{money(a?.total || 0)}</span>
              </div>
              <div className="balance-row">
                <span className="balance-lbl">Pagado</span>
                <span className="balance-val">{money(a?.paid || 0)}</span>
              </div>
              <div className="balance-row highlight">
                <span className="balance-lbl">Pendiente</span>
                <span className={a?.balance > 0 ? "balance-val balance-due" : "balance-val balance-paid"}>
                  {money(a?.balance || 0)}
                </span>
              </div>
            </div>
          )}
        </div>

        {a && (
          <div className="table-quick-actions">
            <button
              className="primary action-btn-pay"
              disabled={busy || !s.connected || !a || (!pendingPay && a.balance <= 0) || cart.length > 0 || !!pendingSave}
              onClick={() => setPay(a.id)}
            >
              {pendingPay ? "Comprobar cobro" : `Cobrar cuenta (${money(a.balance || 0)})`}
            </button>
            {cart.length > 0 && <small className="cart-warning-hint">Guardá los consumos agregados abajo antes de cobrar.</small>}

            <div className="release-table-inline">
              {undelivered && a.balance === 0 ? (
                <button
                  className="primary deliver-all-btn"
                  disabled={busy || !!pay || !!pendingPay || !s.connected || changed || cart.length > 0 || !!pendingSave}
                  onClick={() => run(async () => {
                    await mutate("/visits/" + a.id + "/deliver-all", {});
                    await mutate("/visits/" + a.id + "/close");
                    nav("/atencion", "Mesa " + table + " libre. Visita guardada en el historial.");
                  })}
                >
                  ✓ Marcar pedidos como entregados y liberar mesa
                </button>
              ) : (
                <button
                  className="secondary release-btn"
                  disabled={busy || !!pay || !!pendingPay || !s.connected || changed || undelivered || a.balance !== 0 || cart.length > 0 || !!pendingSave}
                  onClick={() => run(async () => {
                    await mutate("/visits/" + a.id + "/close");
                    nav("/atencion", "Mesa " + table + " libre. Visita guardada en el historial.");
                  })}
                >
                  Liberar mesa
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lista destacada de comandas realizadas */}
        <div className="orders-list-container">
          {!orders.length ? (
            <div className="empty-orders-banner">
              <span className="empty-icon">🍽️</span>
              <div>
                <strong>Esta mesa aún no tiene pedidos confirmados.</strong>
                <p>Abajo tenés la sección para seleccionar productos y registrar el primer pedido.</p>
              </div>
            </div>
          ) : (
            orders.map(o => (
              <article className={"staff-order-card " + (o.status !== "entregado" ? "pending-delivery" : "delivered")} key={o.id}>
                <div className="staff-order-header">
                  <div className="order-meta">
                    <span className="order-time">🕒 {time(o.createdAt)}</span>
                    {o.origin === "qr" ? (
                      <span className="badge-qr-origin">📱 Pedido QR</span>
                    ) : (
                      <span className="badge-salon-origin">📝 Salón{o.createdByName ? " · " + o.createdByName : ""}</span>
                    )}
                  </div>
                  <Badge tone={o.status === "entregado" ? "green" : o.status === "listo para entregar" ? "green" : "amber"}>
                    {o.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="staff-order-items">
                  <Items items={o.items} />
                </div>

                <div className="staff-order-footer">
                  <span className="order-subtotal">
                    Subtotal: <strong>{money(o.items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))}</strong>
                  </span>
                  {o.status !== "entregado" && (
                    <button
                      type="button"
                      className="deliver-order-btn"
                      disabled={busy || !s.connected}
                      onClick={() => run(() => mutate("/orders/" + o.id + "/deliver", {}))}
                    >
                      ✓ Marcar como entregado
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <details className="account-secondary">
          <summary>Responsable de la mesa y opciones avanzadas</summary>
          {a && (
            <label>
              Responsable
              <select
                disabled={busy || !s.connected}
                value={a.waitressId || ""}
                onChange={e => {
                  const userId = e.target.value;
                  run(() => mutate("/visits/" + a.id + "/staff", { userId }, "PUT"));
                }}
              >
                <option value="" disabled>Sin asignar</option>
                {s.staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
          {!a && (
            <button
              className="secondary"
              disabled={busy || !s.connected || changed || !!pendingSave || (reservation && ack !== reservation.acknowledgment)}
              onClick={() => run(async () => {
                const result = await mutate("/tables/" + table + "/open", { reservationAcknowledgment: ack });
                setExpectedAccount(result.id);
              })}
            >
              Abrir mesa sin consumos
            </button>
          )}
          <small>Cobrar, entregar y cerrar la visita son acciones independientes.</small>
        </details>
      </section>

      {/* 2. SECCIÓN SECUNDARIA (ABAJO): AGREGAR MÁS PRODUCTOS */}
      <section className="panel add-products-panel">
        <div className="add-products-header">
          <span className="section-eyebrow">AGREGAR MÁS PRODUCTOS</span>
          <h2>+ Sumar consumos a {tableLabel(s, table)}</h2>
          <p>Elegí productos de la carta para agregar a esta visita.</p>
        </div>

        <QuickEntry
          cart={cart}
          setCart={setCart}
          preparation={preparation}
          setPreparation={setPreparation}
          disabled={busy || !!pendingSave || !s.connected}
        />

        <button
          className="primary full save-consumptions-btn"
          disabled={busy || !s.connected || (!pendingSave && (!cart.length || changed || (!a && reservation && ack !== reservation.acknowledgment)))}
          onClick={() => run(save)}
        >
          {busy ? "Guardando…" : pendingSave ? "Reintentar guardar consumos" : "Guardar consumos"}
        </button>
      </section>
    </div>
    {reserving && <Reservations table={table} account={a} onClose={() => setReserving(false)} />}
    {pay && <Payment id={pay} onClose={() => setPay(false)} onSuccess={result => {
      setPay(false);
      setMessage("Cobro de " + money(result.total) + " registrado. La visita sigue abierta.");
    }} />}
    {joining && (
      <Modal title="Juntar mesas" onClose={() => setJoining(false)}>
        <p style={{ margin: "0 0 14px 0", color: "#624335" }}>
          Elegí con qué mesa querés juntar <strong>{tableLabel(s, effectiveTable)}</strong>:
        </p>

        {a?.joinedTables?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <strong style={{ fontSize: 13, color: "#8c6e58", textTransform: "uppercase" }}>Mesas actualmente juntas:</strong>
            <div className="join-modal-list">
              {a.joinedTables.map(jt => (
                <div key={jt} className="join-modal-item joined">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`sector-tag ${tableSector(s, jt) === "afuera" ? "sector-afuera" : "sector-salon"}`} style={{ fontSize: 10, padding: "1px 5px", marginBottom: 0 }}>
                        {tableSector(s, jt) === "afuera" ? "☀️ Afuera" : "🏠 Salón"}
                      </span>
                      <strong>{tableLabel(s, jt)}</strong>
                    </div>
                    <small>Junta con esta mesa</small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => run(async () => {
                      await mutate(`/tables/${effectiveTable}/separate`, {
                        targetTable: jt
                      });
                      await refresh();
                      setMessage(`${tableLabel(s, jt)} separada de ${tableLabel(s, effectiveTable)}.`);
                    })}
                  >
                    Separar mesa
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <strong style={{ fontSize: 13, color: "#8c6e58", textTransform: "uppercase" }}>Juntar con otra mesa:</strong>
        <div className="join-modal-list">
          {allTables
            .filter(t => t.number !== effectiveTable && !a?.joinedTables?.includes(t.number))
            .map(t => {
              const num = t.number;
              const targetAcc = activeAccount(s, num);
              const targetIsJoinedChild = s.accounts.find(acc => !acc.closedAt && acc.joinedTables?.includes(num));
              if (targetIsJoinedChild) return null;
              const isOccupied = !!targetAcc;
              return (
                <div key={num} className="join-modal-item">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`sector-tag ${t.sector === "afuera" ? "sector-afuera" : "sector-salon"}`} style={{ fontSize: 10, padding: "1px 5px", marginBottom: 0 }}>
                        {t.sector === "afuera" ? "☀️ Afuera" : "🏠 Salón"}
                      </span>
                      <strong>{tableLabel(s, num)}</strong>
                    </div>
                    <small>
                      {isOccupied
                        ? `Ocupada (${money(targetAcc.balance)}) · Se sumarán consumos a esta cuenta`
                        : "Libre"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => run(async () => {
                      await mutate(`/tables/${effectiveTable}/join`, {
                        targetTable: num
                      });
                      await refresh();
                      setJoining(false);
                      setMessage(`${tableLabel(s, effectiveTable)} junta con ${tableLabel(s, num)}.`);
                    })}
                  >
                    Juntar con {tableLabel(s, num)}
                  </button>
                </div>
              );
            })}
        </div>
      </Modal>
    )}

  </main>;
}
function playKitchenChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.75);
  } catch (e) {}
}

export function Kitchen() {
  const s = useStore();
  const [stationFilter, setStationFilter] = useState("cocina");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("nf.kds.sound") !== "false");
  const [isFullScreen, setIsFullScreen] = useState(Boolean(document.fullscreenElement));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
  const prevOrderIdsRef = useRef(new Set());

  useEffect(() => {
    const handleFs = () => setIsFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFs);
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

  useEffect(() => {
    const currentPending = s.orders.filter(o => o.status === "pendiente" && orderHasStation(o, stationFilter, s.catalog));
    const currentIds = new Set(currentPending.map(o => o.id));
    const isInitial = prevOrderIdsRef.current.size === 0;

    let hasNew = false;
    for (const id of currentIds) {
      if (!prevOrderIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }

    if (!isInitial && hasNew && soundEnabled) {
      playKitchenChime();
    }
    prevOrderIdsRef.current = currentIds;
  }, [s.orders, stationFilter, soundEnabled, s.catalog]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("nf.kds.sound", String(next));
    if (next) playKitchenChime();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  async function advance(o) {
    if (lock.current) return;
    lock.current = true;
    setBusy(o.id);
    setError("");
    try {
      await mutate("/orders/" + o.id + "/advance", {
        expectedStatus: o.status
      });
    } catch (e) {
      setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  function elapsedMinutes(createdAt) {
    if (!createdAt) return 0;
    const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
    return Math.floor(diff / 60000);
  }

  const stationOrders = s.orders.filter(o => orderHasStation(o, stationFilter, s.catalog));
  const activeStationOrders = stationOrders.filter(o => o.status !== "entregado");

  return (
    <main className={`kitchen-kds-container ${isFullScreen ? "kds-fullscreen" : ""}`}>
      <div className="kitchen-kds-header">
        <div className="intro">
          <span className="eyebrow">SISTEMA DE PANTALLA · KDS</span>
          <h1>Pantalla de Cocina y Despacho</h1>
          <p>
            {stationFilter === "cocina"
              ? "Mostrando únicamente platos y alimentos que requieren cocina / elaboración."
              : stationFilter === "cafeteria"
              ? "Mostrando pedidos de cafetería, infusiones y barra."
              : "Mostrando todos los pedidos del local."}
          </p>
        </div>

        <div className="kds-header-controls">
          <div className="kds-station-tabs">
            <button
              type="button"
              className={stationFilter === "cocina" ? "primary kds-tab-btn" : "secondary kds-tab-btn"}
              onClick={() => setStationFilter("cocina")}
            >
              🍳 Cocina ({s.orders.filter(o => o.status !== "entregado" && orderHasStation(o, "cocina", s.catalog)).length})
            </button>
            <button
              type="button"
              className={stationFilter === "cafeteria" ? "primary kds-tab-btn" : "secondary kds-tab-btn"}
              onClick={() => setStationFilter("cafeteria")}
            >
              ☕ Barra ({s.orders.filter(o => o.status !== "entregado" && orderHasStation(o, "cafeteria", s.catalog)).length})
            </button>
            <button
              type="button"
              className={stationFilter === "all" ? "primary kds-tab-btn" : "secondary kds-tab-btn"}
              onClick={() => setStationFilter("all")}
            >
              📋 Todo ({s.orders.filter(o => o.status !== "entregado").length})
            </button>
          </div>

          <div className="kds-action-tools">
            <button
              type="button"
              className={`kds-tool-btn ${soundEnabled ? "sound-active" : ""}`}
              onClick={toggleSound}
              title={soundEnabled ? "Silenciar avisos de cocina" : "Activar sonido de comanda"}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              <span>{soundEnabled ? "Sonido ON" : "Sonido OFF"}</span>
            </button>

            <button
              type="button"
              className="kds-tool-btn"
              onClick={toggleFullscreen}
              title={isFullScreen ? "Salir de pantalla completa" : "Modo Tablet / Pantalla Completa"}
            >
              {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              <span>{isFullScreen ? "Ventana" : "Pantalla Completa"}</span>
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="alert">{error}</p>}

      {!activeStationOrders.length && (
        <div className="panel empty-kds-banner">
          <span style={{ fontSize: 36 }}>✨</span>
          <div>
            <h3>No hay comandas pendientes en {stationFilter === "cocina" ? "Cocina" : stationFilter === "cafeteria" ? "Barra" : "el local"}</h3>
            <p>Apenas una moza o cliente cargue un pedido elaborado, sonará la campana y aparecerá aquí al instante.</p>
          </div>
        </div>
      )}

      <div className="kanban kds-kanban">
        {statuses.slice(0, 3).map((status, index) => {
          const orders = stationOrders.filter(o => o.status === status);
          return (
            <section key={status} className={`kds-column kds-column-${index}`}>
              <div className="kds-column-header">
                <h3>
                  <span className={"dot dot-" + index} />
                  {status === "pendiente" ? "1. Pendientes" : status === "en preparación" ? "2. En Preparación" : "3. Listos para entregar"}
                  <Badge>{orders.length}</Badge>
                </h3>
              </div>

              {!orders.length && (
                <div className="empty-column">
                  {index === 0 ? "Sin pedidos en cola" : index === 1 ? "Nada preparándose ahora" : "Sin pedidos esperando retiro"}
                </div>
              )}

              {orders.map(o => {
                const a = s.accounts.find(a => a.id === o.accountId);
                const elapsed = elapsedMinutes(o.createdAt);
                const delayTone = elapsed >= 20 ? "delay-urgent" : elapsed >= 10 ? "delay-warning" : "delay-normal";

                const targetStationItems = stationFilter === "all"
                  ? o.items
                  : o.items.filter(i => {
                      const p = (s.catalog?.products || []).find(prod => prod.id === i.productId);
                      return getProductStation(p || { name: i.name, category: "" }) === stationFilter;
                    });
                const otherItems = stationFilter === "all"
                  ? []
                  : o.items.filter(i => {
                      const p = (s.catalog?.products || []).find(prod => prod.id === i.productId);
                      return getProductStation(p || { name: i.name, category: "" }) !== stationFilter;
                    });

                return (
                  <article className={`order-card kds-order-card ${delayTone}`} key={o.id}>
                    <div className="kds-card-top-row">
                      <div className="kds-card-table-block">
                        <span className="kds-card-order-num">#{o.number || o.id.slice(0, 5)}</span>
                        <h2>{o.table == null ? "Mostrador" : tableLabel(s, o.table)}</h2>
                        {o.table != null && (
                          <span className={`sector-tag ${tableSector(s, o.table) === "afuera" ? "sector-afuera" : "sector-salon"}`} style={{ fontSize: 11, padding: "2px 6px", marginBottom: 0 }}>
                            {tableSector(s, o.table) === "afuera" ? "☀️ Afuera" : "🏠 Salón"}
                          </span>
                        )}
                      </div>

                      <div className={`kds-card-timer-badge ${delayTone}`}>
                        <Clock size={13} />
                        <span>{elapsed === 0 ? "Recién" : `${elapsed} min`}</span>
                      </div>
                    </div>

                    <div className="kds-card-meta">
                      <span>Responsable: <strong>{a?.waitress || "Sin asignar"}</strong></span>
                      <small>{time(o.createdAt)}</small>
                    </div>

                    <div className="kds-card-items-block">
                      {targetStationItems.map((item, idx) => (
                        <div key={idx} className="kds-item-row">
                          <span className="kds-item-qty">{item.quantity}x</span>
                          <div className="kds-item-detail">
                            <strong className="kds-item-name">{item.name}</strong>
                            {(item.size || item.flavors?.length > 0 || item.extras?.length > 0) && (
                              <small className="kds-item-options">
                                {[item.size, ...(item.flavors || []), ...(item.extras || [])].filter(Boolean).join(" · ")}
                              </small>
                            )}
                            {item.notes && (
                              <div className="kds-item-note">
                                ⚠️ <em>{item.notes}</em>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {otherItems.length > 0 && (
                      <div className="kds-other-items-box">
                        <small>🥤 Acompaña de mostrador/barra:</small>
                        <span>{otherItems.map(oi => `${oi.quantity}x ${oi.name}`).join(", ")}</span>
                      </div>
                    )}

                    <div className="kds-card-footer">
                      {index === 0 && (
                        <button
                          type="button"
                          className="primary full kds-btn-action kds-btn-start"
                          disabled={!!busy || !s.connected}
                          onClick={() => advance(o)}
                        >
                          {busy === o.id ? "Guardando…" : "▶ Comenzar preparación"}
                        </button>
                      )}
                      {index === 1 && (
                        <button
                          type="button"
                          className="primary full kds-btn-action kds-btn-ready"
                          disabled={!!busy || !s.connected}
                          onClick={() => advance(o)}
                        >
                          {busy === o.id ? "Guardando…" : "✓ ¡MARCAR LISTO!"}
                        </button>
                      )}
                      {index === 2 && (
                        <button
                          type="button"
                          className="secondary full kds-btn-action kds-btn-delivered"
                          disabled={!!busy || !s.connected}
                          onClick={() => advance(o)}
                        >
                          {busy === o.id ? "Guardando…" : "✓ Marcar entregado"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
