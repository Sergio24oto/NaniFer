import React, { useState, useRef } from "react";
import { ArrowLeft, ClipboardList, Coffee } from "lucide-react";
import { Badge, Items, Modal } from "../components";
import { useStore, mutate, submitOnce, pendingOperation } from "../store";
import { money, activeAccount, statuses, time, itemInput, estimate } from "../domain";
import {useDraft} from "../useDraft";
import {readDraft} from "../drafts";
import Payment from "./Payment";
import QuickEntry from "./QuickEntry";
import Reservations from "./Reservations";
export function Salon({
  nav,
  message
}) {
  const s = useStore();
  const [reservingTable,setReservingTable] = useState(null);
  const [reservationDate, setReservationDate] = useState("");
  const date = reservationDate || s.calendarToday;
  const opened = s.accounts.filter(a => !a.closedAt && a.table != null);
  const ready = s.orders.filter(o => o.status === "listo para entregar");
  return <main className="salon-compact">
    <div className="page-heading"><div className="intro"><span className="eyebrow">ATENCIÓN</span><h1>Mesas y Mostrador</h1><p>{opened.length} de 15 mesas ocupadas · {money(opened.reduce((n, a) => n + a.balance, 0))} pendiente</p></div><button className="secondary" onClick={() => nav("/atencion/comandera")}><ClipboardList size={17} /> Comandera · {ready.length} listos</button></div>
    {message && <p className="success" role="status">{message}</p>}
    <details className="reservation-date"><summary>Ver reservas de otra fecha</summary><label>Fecha de reservas<input type="date" value={date || ""} onInput={e => setReservationDate(e.currentTarget.value)} /></label><button className="text-button" onClick={() => setReservationDate("")}>Volver a hoy</button><small>La ocupación y los saldos siempre son los actuales.</small></details>
    <div className="table-grid"><button className="table-card counter-card" onClick={() => nav("/atencion/mostrador")}><div className="row"><h2>Mostrador</h2><Coffee size={24} /></div><strong>Nueva compra</strong><small>Sin mesa · seleccionar y cobrar</small>{readDraft(s.user.id,"counter")?.cart.length>0&&<small className="draft-hint">Consumos sin confirmar</small>}</button>
      {Array.from({
        length: 15
      }, (_, i) => {
        const n = i + 1,
          a = activeAccount(s, n),
          r = ready.some(o => o.table === n);
        const all = (s.reservations || []).filter(x => x.table === n);
        const reservation = all.find(x => x.date === date) || (!reservationDate ? all.find(x => x.date > s.calendarToday) || all[0] : null);
        const tableOrders = s.orders.filter(o => o.accountId === a?.id);
        const hasOrders = a && tableOrders.length > 0;
        return <article key={n} className={"table-card table-card-actions " + (a ? "occupied " : "") + (hasOrders ? "has-orders " : "") + (r ? "ready" : "") + (reservation ? " has-reservation" : "")}><button className="table-open" onClick={() => nav("/atencion/mesas/" + n)}>
          <div className="row">
            <h2>Mesa {n}</h2>
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
    a = activeAccount(s, table);
  const scope = "consumptions-" + table,
    pendingSave = pendingOperation(scope);
  const draft=useDraft(s.user.id,"table-"+table,()=>restoreCart(pendingSave,s.catalog),pendingSave?.body.expectedAccount ?? a?.id ?? null);
  const {cart,setCart}=draft;
  const [discard,setDiscard]=useState(false);
  const [preparation, setPreparation] = useState(pendingSave?.body.needsPreparation || false);
  // Keep the visit visible when entry began: a concurrent table reuse must not redirect this draft.
  const expectedAccount=draft.account, setExpectedAccount=draft.setAccount;
  const pendingPay=a&&pendingOperation("pay-"+a.id);
  const [ack, setAck] = useState(null);
  const [pay, setPay] = useState(false),
    [reserving, setReserving] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const orders = s.orders.filter(o => o.accountId === a?.id),
    undelivered = orders.some(o => o.status !== "entregado");
  const reservation = (s.reservations || []).find(r => r.table === table && r.date === s.calendarToday);
  const changed = expectedAccount !== (a?.id || null);
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
    await submitOnce(scope, "/tables/" + table + "/consumptions", {
      expectedAccount,
      items: cart.map(itemInput),
      needsPreparation: preparation,
      reservationAcknowledgment: ack
    });
    draft.clear();
    nav("/atencion", "Guardado correctamente. Consumos registrados en la mesa " + table + ". Quedan pendientes de cobro.");
  }
  return <main className="staff-entry"><button className="back" onClick={() => nav("/atencion")}><ArrowLeft size={17} />Volver al salón</button>
    <div className="page-heading"><div className="intro"><h1>Mesa {table}</h1><p>{a ? "Visita abierta · " + a.waitress : "Elegí productos para iniciar la visita al guardar."}</p></div><div className="row"><Badge tone={a ? "amber" : "green"}>{a ? "Ocupada" : "Libre"}</Badge>{s.user?.permissions?.includes("reservations.manage") && <button className="secondary" onClick={() => setReserving(true)}>Reservas</button>}</div></div>
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
    <div className="table-detail-container">
      {/* 1. SECCIÓN PRINCIPAL: PEDIDOS DE LA MESA Y ESTADO DE CUENTA */}
      <section className="panel primary-orders-panel">
        <div className="panel-header-row">
          <div>
            <span className="section-eyebrow">PEDIDOS DE LA MESA</span>
            <h2>{orders.length > 0 ? `Comandas realizadas (${orders.length})` : "Comandas de la mesa"}</h2>
            <p className="section-sub">
              {a ? `Visita activa ${a.waitress ? "· Responsable: " + a.waitress : ""}` : "Mesa libre · Sin visita activa"}
            </p>
          </div>
          {a && (
            <div className="balance-badge-card">
              <div className="balance-item">
                <span>Consumos</span>
                <strong>{money(a?.total || 0)}</strong>
              </div>
              <div className="balance-item">
                <span>Pagado</span>
                <strong>{money(a?.paid || 0)}</strong>
              </div>
              <div className="balance-item highlight">
                <span>Pendiente</span>
                <strong className={a?.balance > 0 ? "balance-due" : "balance-paid"}>
                  {money(a?.balance || 0)}
                </strong>
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
                      <Badge tone="red">📱 Pedido QR del cliente</Badge>
                    ) : (
                      <Badge tone="amber">📝 Comanda de salón{o.createdByName ? " · " + o.createdByName : ""}</Badge>
                    )}
                  </div>
                  <Badge tone={o.status === "entregado" ? "green" : o.status === "listo para entregar" ? "amber" : "red"}>
                    {o.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="staff-order-items">
                  <Items items={o.items} />
                </div>

                <div className="staff-order-footer">
                  <span className="order-subtotal">
                    Subtotal comanda: <strong>{money(o.items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))}</strong>
                  </span>
                  {o.status !== "entregado" && (
                    <button
                      type="button"
                      className="primary deliver-order-btn"
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
          <h2>+ Sumar consumos a la mesa {table}</h2>
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

  </main>;
}
export function Kitchen() {
  const s = useStore();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
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
  return <main>
      <div className="intro">
        <span className="eyebrow">DE LA COCINA A LA MESA</span>
        <h1>Preparación</h1>
        <p>Los pedidos cobrados siguen acá hasta su entrega.</p>
      </div>
      {error && <p role="alert" className="alert">
          {error}
        </p>}
      {!s.orders.some(o=>o.status!=="entregado")&&<p className="panel">No hay pedidos pendientes de preparación.</p>}
      <div className="kanban">
        {statuses.slice(0, 3).map((status, index) => {
        const orders = s.orders.filter(o => o.status === status);
        return <section key={status}>
              <h3>
                <span className={"dot dot-" + index} />
                {status}
                <Badge>{orders.length}</Badge>
              </h3>
              {!orders.length && <div className="empty-column">Sin pedidos por acá</div>}
              {orders.map(o => {
            const a = s.accounts.find(a => a.id === o.accountId);
            return <article className="order-card" key={o.id}>
                    <div className="row">
                      <h2>{o.table == null ? "Mostrador" : "Mesa " + o.table}</h2>
                      <small>{time(o.createdAt)}</small>
                    </div>
                    <small>
                      {a?.waitress} · #{o.id.slice(0, 5)}
                    </small>
                    <Items items={o.items} />
                    <Badge tone={a?.balance === 0 ? "green" : "amber"}>
                      {a?.balance === 0 ? "Visita sin saldo pendiente" : "Visita con saldo pendiente"}
                    </Badge>
                    {index < 3 && <button className="primary full" disabled={!!busy || !s.connected} onClick={() => advance(o)}>
                        {busy === o.id ? "Guardando…" : ["Comenzar preparación", "Marcar listo", "Marcar entregado"][index]}
                      </button>}
                  </article>;
          })}
            </section>;
      })}
      </div>
    </main>;
}
