import React, { useState, useRef } from "react";
import { ArrowLeft, ClipboardList, Coffee } from "lucide-react";
import { Badge, Items } from "../components";
import { useStore, mutate, submitOnce, pendingOperation } from "../store";
import { money, activeAccount, statuses, time, itemInput, estimate } from "../domain";
import Payment from "./Payment";
import QuickEntry from "./QuickEntry";
import Reservations from "./Reservations";
export function Salon({
  nav,
  message
}) {
  const s = useStore();
  const [reservationDate, setReservationDate] = useState("");
  const date = reservationDate || s.calendarToday;
  const opened = s.accounts.filter(a => !a.closedAt && a.table != null);
  const ready = s.orders.filter(o => o.status === "listo para entregar");
  return <main className="salon-compact">
    <div className="page-heading"><div className="intro"><span className="eyebrow">ATENCIÓN</span><h1>Mesas y Mostrador</h1><p>{opened.length} de 15 mesas ocupadas · {money(opened.reduce((n, a) => n + a.balance, 0))} pendiente</p></div><button className="secondary" onClick={() => nav("/atencion/comandera")}><ClipboardList size={17} /> Comandera · {ready.length} listos</button></div>
    {message && <p className="success" role="status">{message}</p>}
    <details className="reservation-date"><summary>Ver reservas de otra fecha</summary><label>Fecha de reservas<input type="date" value={date || ""} onInput={e => setReservationDate(e.currentTarget.value)} /></label><button className="text-button" onClick={() => setReservationDate("")}>Volver a hoy</button><small>La ocupación y los saldos siempre son los actuales.</small></details>
    <div className="table-grid">
      {Array.from({
        length: 15
      }, (_, i) => {
        const n = i + 1,
          a = activeAccount(s, n),
          r = ready.some(o => o.table === n);
        const all = (s.reservations || []).filter(x => x.table === n);
        const reservation = all.find(x => x.date === date) || (!reservationDate ? all.find(x => x.date > s.calendarToday) || all[0] : null);
        return <button key={n} className={"table-card " + (a ? "occupied " : "") + (r ? "ready" : "")} onClick={() => nav("/atencion/mesas/" + n)}>
          <div className="row"><h2>Mesa {n}</h2><Badge tone={a ? "amber" : "green"}>{a ? "Ocupada" : "Libre"}</Badge></div>
          <div className="table-balance"><small>Pendiente de cobro</small><strong>{money(a?.balance || 0)}</strong></div>
          {r && <small className="ready-hint">Productos listos para entregar</small>}
          {reservation && <small className="reservation-hint">Reservada para {reservation.name} a las {reservation.time}{reservation.date !== s.calendarToday ? " · " + reservation.date.split("-").reverse().join("/") : ""}{reservation.date < s.calendarToday ? " · pendiente" : ""}</small>}
        </button>;
      })}
      <button className="table-card counter-card" onClick={() => nav("/atencion/mostrador")}><div className="row"><h2>Mostrador</h2><Coffee size={24} /></div><strong>Nueva compra</strong><small>Sin mesa · seleccionar y cobrar</small></button>
    </div>
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
  const [cart, setCart] = useState(() => restoreCart(pendingSave, s.catalog));
  const [preparation, setPreparation] = useState(pendingSave?.body.needsPreparation || false);
  // Keep the visit visible when entry began: a concurrent table reuse must not redirect this draft.
  const [expectedAccount, setExpectedAccount] = useState(a?.id || null);
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
      setError(e.message);
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
    nav("/atencion", "Consumos registrados en la mesa " + table + ". Quedan pendientes de cobro.");
  }
  return <main className="staff-entry"><button className="back" onClick={() => nav("/atencion")}><ArrowLeft size={17} />Volver al salón</button>
    <div className="page-heading"><div className="intro"><h1>Mesa {table}</h1><p>{a ? "Visita abierta · " + a.waitress : "Elegí productos para iniciar la visita al guardar."}</p></div><div className="row"><Badge tone={a ? "amber" : "green"}>{a ? "Ocupada" : "Libre"}</Badge>{s.user?.permissions?.includes("reservations.manage") && <button className="secondary" onClick={() => setReserving(true)}>Reservas</button>}</div></div>
    {error && <p className="alert" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    {pendingSave && <p className="note">Hay consumos sin confirmación. Reintentá para recuperar la misma operación; no se duplicará.</p>}
    {changed && !pendingSave && <p className="note">La visita de la mesa cambió desde que abriste esta pantalla. <button onClick={() => {
        setExpectedAccount(a?.id || null);
        setAck(null);
      }}>Revisé la mesa: usar la visita actual</button></p>}
    {!a && reservation && <div className="note"><p>Reservada para {reservation.name} a las {reservation.time}.</p><label className="option"><input type="checkbox" checked={ack === reservation.acknowledgment} onChange={e => setAck(e.target.checked ? reservation.acknowledgment : null)} />Continuar con esta mesa teniendo en cuenta la reserva</label></div>}
    <div className="entry-layout"><div><QuickEntry cart={cart} setCart={setCart} preparation={preparation} setPreparation={setPreparation} disabled={busy || !!pendingSave || !s.connected} />
      <button className="primary full" disabled={busy || !s.connected || !pendingSave && (!cart.length || changed || !a && reservation && ack !== reservation.acknowledgment)} onClick={() => run(save)}>{busy ? "Guardando…" : pendingSave ? "Reintentar guardar consumos" : "Guardar consumos"}</button>
    </div><aside className="panel account-summary"><h2>Cuenta de esta visita</h2><div className="total"><span>Consumos guardados</span><strong>{money(a?.total || 0)}</strong></div><div className="total"><span>Ya pagado</span><strong>{money(a?.paid || 0)}</strong></div><div className="total"><span>Pendiente</span><strong>{money(a?.balance || 0)}</strong></div>
      <button className="primary full" disabled={busy || !s.connected || !a || a.balance <= 0 || cart.length > 0 || !!pendingSave} onClick={() => setPay(a.id)}>Cobrar</button>
      {cart.length > 0 && <small>Guardá los consumos antes de cobrar.</small>}
      {a && <div className="release-table"><button className="secondary full" disabled={busy || !s.connected || changed || undelivered || a.balance !== 0 || cart.length > 0 || !!pendingSave} onClick={() => run(async () => {
        await mutate("/visits/" + a.id + "/close");
        nav("/atencion", "Mesa " + table + " libre. Visita guardada en el historial.");
      })}>Liberar mesa</button><small>{!s.connected ? "Sin conexión." : changed ? "Revisá la visita actual." : cart.length || pendingSave ? "Primero guardá los consumos pendientes." : a.balance !== 0 ? "Primero cobrá el saldo pendiente." : undelivered ? "Primero marcá los pedidos como entregados." : "Todo cobrado y entregado. Un clic cierra esta visita."}</small></div>}
      <details className="account-secondary"><summary>Responsable y otras opciones</summary>
        {a && <label>Responsable<select disabled={busy || !s.connected} value={a.waitressId || ""} onChange={e => {
              const userId = e.target.value;
              run(() => mutate("/visits/" + a.id + "/staff", {
                userId
              }, "PUT"));
            }}><option value="" disabled>Sin asignar</option>{s.staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        {!a && <button className="secondary" disabled={busy || !s.connected || changed || !!pendingSave || reservation && ack !== reservation.acknowledgment} onClick={() => run(async () => {
            const result = await mutate("/tables/" + table + "/open", {
              reservationAcknowledgment: ack
            });
            setExpectedAccount(result.id);
          })}>Abrir mesa sin consumos</button>}
        <small>Cobrar, entregar y cerrar la visita son acciones independientes.</small>
      </details>
      <h3>Consumos guardados</h3>{!orders.length && <p>Todavía no hay consumos.</p>}{orders.map(o => <article className="saved-order" key={o.id}><div className="row"><strong>{time(o.createdAt)}</strong><Badge>{o.status}</Badge></div><small>{o.origin === "manual" ? "Carga manual" : o.origin === "qr" ? "Pedido QR" : "Pedido"}{o.createdByName ? " · " + o.createdByName : ""}</small><Items items={o.items} /></article>)}
    </aside></div>
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
      setError(e.message);
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }
  return <main>
      <div className="intro">
        <span className="eyebrow">DE LA COCINA A LA MESA</span>
        <h1>Comandera</h1>
        <p>Los pedidos cobrados siguen acá hasta su entrega.</p>
      </div>
      {error && <p role="alert" className="alert">
          {error}
        </p>}
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
