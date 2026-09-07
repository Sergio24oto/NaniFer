import React, { useState, useRef } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  ClipboardList,
  Coffee,
} from "lucide-react";
import { Badge, Items, Modal } from "../components";
import { useStore, mutate } from "../store";
import { money, activeAccount, statuses, time } from "../domain";
import Menu from "./Menu";
import Payment from "./Payment";
export function Salon({ nav }) {
  const s = useStore();
  const opened = s.accounts.filter((a) => !a.closedAt);
  const ready = s.orders.filter((o) => o.status === "listo para entregar");
  return (
    <main>
      <div className="page-heading">
        <div className="intro">
          <span className="eyebrow">ATENCIÓN</span>
          <h1>Así está el salón</h1>
          <p>Quince mesas, muchas buenas conversaciones.</p>
        </div>
        <button
          className="secondary"
          onClick={() => nav("/atencion/comandera")}
        >
          <ClipboardList size={17} /> Ver comandera
        </button>
      </div>
      <div className="stats">
        <div>
          <span>Mesas ocupadas</span>
          <strong>
            {opened.length}
            <small> / 15</small>
          </strong>
        </div>
        <div>
          <span>Listos para entregar</span>
          <strong>{ready.length}</strong>
        </div>
        <div>
          <span>Saldo pendiente</span>
          <strong>{money(opened.reduce((n, a) => n + a.balance, 0))}</strong>
        </div>
      </div>
      <div className="section-title">
        <h2>Mesas del salón</h2>
        <small>El cobro y la entrega son independientes</small>
      </div>
      <div className="table-grid">
        {Array.from({ length: 15 }, (_, i) => {
          const n = i + 1,
            a = activeAccount(s, n),
            r = ready.some((o) => o.table === n);
          return (
            <button
              className={
                "table-card " + (a ? "occupied " : "") + (r ? "ready" : "")
              }
              key={n}
              onClick={() => nav("/atencion/mesas/" + n)}
            >
              <div className="row">
                <span className="table-number">
                  {String(n).padStart(2, "0")}
                </span>
                <Badge tone={r ? "green" : a ? "amber" : ""}>
                  {r ? "Listo para entregar" : a ? "Ocupada" : "Libre"}
                </Badge>
              </div>
              <h3>Mesa {n}</h3>
              <small>{a ? a.waitress : "Lista para recibir"}</small>
              {a && (
                <small>
                  Consumos {money(a.total)} · Pagado {money(a.paid)}
                </small>
              )}
              <div className="table-bottom">
                <strong>
                  {a ? "Saldo " + money(a.balance) : "Abrir mesa"}
                </strong>
                <ArrowRight size={17} />
              </div>
            </button>
          );
        })}
      </div>
      {s.payments.length > 0 && (
        <section className="payment-log">
          <h2>Últimos cobros registrados</h2>
          {s.payments
            .slice()
            .reverse()
            .map((p) => (
              <div className="row" key={p.id}>
                <span>
                  Mesa {p.table} · {p.method} · {time(p.createdAt)}
                </span>
                <strong>{money(p.total)}</strong>
              </div>
            ))}
        </section>
      )}
    </main>
  );
}
export function Account({ table, nav }) {
  const s = useStore();
  const a = activeAccount(s, table);
  const orders = s.orders.filter((o) => o.accountId === a?.id);
  const pending = orders.some((o) => o.status !== "entregado");
  const [manual, setManual] = useState(false);
  const [pay, setPay] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
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
  return (
    <main>
      <button className="back" onClick={() => nav("/atencion")}>
        <ArrowLeft size={17} /> Volver al salón
      </button>
      <div className="page-heading">
        <div className="intro">
          <span className="eyebrow">CUENTA DE LA VISITA</span>
          <h1>Mesa {table}</h1>
          <p>
            {a
              ? "Abierta a las " + time(a.openedAt)
              : "Lista para una nueva visita."}
          </p>
        </div>
        <Badge tone={a ? "amber" : "green"}>
          {a ? "Visita abierta" : "Mesa libre"}
        </Badge>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <div className="account-layout">
        <section>
          {orders.length ? (
            orders.map((o) => (
              <article className="panel" key={o.id}>
                <div className="row">
                  <h3>
                    Pedido #{o.id.slice(0, 5)} · {time(o.createdAt)}
                  </h3>
                  <Badge>{o.status}</Badge>
                </div>
                <Items items={o.items} />
              </article>
            ))
          ) : (
            <div className="empty">
              <Coffee size={40} />
              <h2>Todavía no hay consumos</h2>
            </div>
          )}
        </section>
        <aside className="panel account-summary">
          <h2>La cuenta</h2>
          {a && (
            <label>
              Responsable
              <select
                disabled={busy || !s.connected}
                value={a.waitressId || ""}
                onChange={(e) =>
                  run(() =>
                    mutate(
                      "/visits/" + a.id + "/staff",
                      { userId: e.target.value },
                      "PUT",
                    ),
                  )
                }
              >
                <option value="" disabled>
                  Sin asignar
                </option>
                {s.staff.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="total">
            <span>Consumos</span>
            <strong>{money(a?.total)}</strong>
          </div>
          <div className="total">
            <span>Ya pagado</span>
            <strong>{money(a?.paid)}</strong>
          </div>
          <div className="total">
            <span>Saldo pendiente</span>
            <strong>{money(a?.balance)}</strong>
          </div>
          {!a ? (
            <button
              className="primary full"
              disabled={busy || !s.connected}
              onClick={() => run(() => mutate("/tables/" + table + "/open"))}
            >
              Abrir mesa
            </button>
          ) : (
            <>
              <button
                className="primary full"
                disabled={busy || !s.connected}
                onClick={() => setManual(true)}
              >
                <Plus size={17} /> Agregar pedido
              </button>
              <button
                className="secondary full"
                disabled={busy || !s.connected || a.balance <= 0}
                onClick={() => setPay(a.id)}
              >
                Cobrar saldo
              </button>
              <button
                className="secondary full"
                disabled={busy || !s.connected || pending || a.balance !== 0}
                onClick={() => setClosing(a.id)}
              >
                Cerrar visita y liberar mesa
              </button>
              {pending && <small>Hay pedidos pendientes de entrega.</small>}
            </>
          )}
          <small>
            Podés cobrar antes de entregar y agregar consumos después de cobrar.
          </small>
        </aside>
      </div>
      {manual && (
        <Modal
          title={"Pedido manual · Mesa " + table}
          onClose={() => setManual(false)}
        >
          <Menu
            table={table}
            manual
            onDone={() => {
              setManual(false);
              setMessage("Pedido guardado en el servidor.");
            }}
          />
        </Modal>
      )}
      {pay && (
        <Payment
          id={pay}
          onClose={() => setPay(false)}
          onSuccess={(result) => {
            setPay(false);
            setMessage(
              "Cobro de " +
                money(result.total) +
                " registrado. La visita continúa abierta.",
            );
          }}
        />
      )}
      {closing && a && (
        <Modal title="Cerrar visita" onClose={() => setClosing(false)}>
          <p>
            La visita quedará cerrada y la mesa libre. Los consumos se
            conservarán en el historial.
          </p>
          <button
            className="primary full"
            disabled={busy || !s.connected}
            onClick={() =>
              run(async () => {
                await mutate("/visits/" + closing + "/close");
                setClosing(false);
                setMessage("Visita cerrada. La mesa está libre.");
              })
            }
          >
            Confirmar cierre de visita
          </button>
        </Modal>
      )}
    </main>
  );
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
        expectedStatus: o.status,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }
  return (
    <main>
      <div className="intro">
        <span className="eyebrow">DE LA COCINA A LA MESA</span>
        <h1>Comandera</h1>
        <p>Los pedidos cobrados siguen acá hasta su entrega.</p>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="kanban">
        {statuses.map((status, index) => {
          const orders = s.orders.filter((o) => o.status === status);
          return (
            <section key={status}>
              <h3>
                <span className={"dot dot-" + index} />
                {status}
                <Badge>{orders.length}</Badge>
              </h3>
              {!orders.length && (
                <div className="empty-column">Sin pedidos por acá</div>
              )}
              {orders.map((o) => {
                const a = s.accounts.find((a) => a.id === o.accountId);
                return (
                  <article className="order-card" key={o.id}>
                    <div className="row">
                      <h2>Mesa {o.table}</h2>
                      <small>{time(o.createdAt)}</small>
                    </div>
                    <small>
                      {a?.waitress} · #{o.id.slice(0, 5)}
                    </small>
                    <Items items={o.items} />
                    <Badge tone={a?.balance === 0 ? "green" : "amber"}>
                      {a?.balance === 0
                        ? "Visita sin saldo pendiente"
                        : "Visita con saldo pendiente"}
                    </Badge>
                    {index < 3 && (
                      <button
                        className="primary full"
                        disabled={!!busy || !s.connected}
                        onClick={() => advance(o)}
                      >
                        {busy === o.id
                          ? "Guardando…"
                          : [
                              "Comenzar preparación",
                              "Marcar listo",
                              "Marcar entregado",
                            ][index]}
                      </button>
                    )}
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
