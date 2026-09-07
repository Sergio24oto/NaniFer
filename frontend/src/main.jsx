import { Modal, Badge, Items } from "./components";
import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Coffee,
  IceCreamBowl,
  LayoutGrid,
  ClipboardList,
  ArrowLeft,
  Plus,
  Minus,
  X,
  ShoppingBag,
  Check,
  ArrowRight,
  RotateCcw,
  Receipt,
  Clock,
} from "lucide-react";
import { products, categories, flavors, staff } from "./data";
import {
  money,
  statuses,
  activeAccount,
  totalAccount,
  priceItem,
} from "./domain";
import { useStore, dispatch } from "./store";
import "./style.css";
const time = (d) =>
  new Date(d).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const s = useStore();
  const [path, setPath] = useState(location.pathname);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reset, setReset] = useState(false);
  const [pay, setPay] = useState(null);
  const [manual, setManual] = useState(null);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  function nav(p) {
    history.pushState({}, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  }
  async function act(a) {
    try {
      await dispatch(a);
      setError("");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  const publicView = path.startsWith("/mesa");
  const match = path.match(/^\/mesa\/(\d+)\/?$/);
  const table = match ? Number(match[1]) : null;
  const detail = path.match(/^\/salon\/(\d+)\/?$/);
  const tableDetail = detail ? Number(detail[1]) : null;
  const kitchen = path === "/comandera";
  const opened = s.accounts.filter((a) => !a.closedAt);
  const ready = s.orders.filter(
    (o) =>
      o.status === "listo para entregar" &&
      opened.some((a) => a.id === o.accountId),
  );
  return (
    <>
      <header>
        <a
          href="/salon"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            nav("/salon");
          }}
        >
          <span className="brand-icon">
            <IceCreamBowl size={24} />
          </span>
          <span>
            NaniFer<small>HELADERÍA & CAFÉ</small>
          </span>
        </a>
        <nav>
          {[
            ["/salon", "Salón", LayoutGrid],
            ["/comandera", "Comandera", ClipboardList],
            ["/mesa/", "Carta", Coffee],
          ].map(([p, label, Icon]) => (
            <button
              key={p}
              className={
                path.startsWith(p) || (p === "/salon" && path === "/")
                  ? "active"
                  : ""
              }
              onClick={() => nav(p)}
            >
              <Icon size={17} />
              {label}
              {p === "/comandera" && ready.length > 0 && <i>{ready.length}</i>}
            </button>
          ))}
        </nav>
        <span className="demo">● Prototipo · datos de prueba</span>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {publicView ? (
        table && table >= 1 && table <= 15 ? (
          <Menu key={table} table={table} s={s} act={act} />
        ) : (
          <main>
            <div className="intro">
              <span className="eyebrow">BIENVENIDOS A NANIFER</span>
              <h1>Algo rico te espera.</h1>
              <p>Elegí tu mesa para ver la carta y hacer tu pedido.</p>
            </div>
            <div className="table-grid">
              {Array.from({ length: 15 }, (_, i) => (
                <button
                  className="table-card"
                  key={i}
                  onClick={() => nav("/mesa/" + (i + 1))}
                >
                  <span className="table-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <strong>Mesa {i + 1}</strong>
                  <span>
                    Ver la carta <ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </main>
        )
      ) : kitchen ? (
        <main>
          <div className="intro">
            <span className="eyebrow">DE LA COCINA A LA MESA</span>
            <h1>Comandera</h1>
            <p>
              Cada pedido, en su momento. Los cambios se comparten con el salón.
            </p>
          </div>
          <div className="kanban">
            {statuses.map((status, index) => {
              const orders = s.orders.filter(
                (o) =>
                  o.status === status &&
                  opened.some((a) => a.id === o.accountId),
              );
              return (
                <section key={status}>
                  <h3>
                    <span className={"dot dot-" + index} />
                    {status}
                    <Badge>{orders.length}</Badge>
                  </h3>
                  {orders.length === 0 && (
                    <div className="empty-column">Sin pedidos por acá</div>
                  )}
                  {orders.map((o) => (
                    <article className="order-card" key={o.id}>
                      <div className="row">
                        <h2>Mesa {o.table}</h2>
                        <small>
                          <Clock size={13} />
                          {time(o.createdAt)}
                        </small>
                      </div>
                      <small>
                        {s.accounts.find((a) => a.id === o.accountId)?.waitress}{" "}
                        · #{o.id.slice(0, 5)}
                      </small>
                      <Items items={o.items} />
                      {index < 3 ? (
                        <button
                          className="primary full"
                          onClick={() =>
                            act({
                              type: "status",
                              id: o.id,
                              expectedStatus: o.status,
                            })
                          }
                        >
                          {
                            [
                              "Comenzar preparación",
                              "Marcar listo",
                              "Marcar entregado",
                            ][index]
                          }{" "}
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <Badge tone="green">
                          ✓ Entregado · pendiente de cobro
                        </Badge>
                      )}
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </main>
      ) : tableDetail && tableDetail <= 15 ? (
        <main>
          <button className="back" onClick={() => nav("/salon")}>
            <ArrowLeft size={17} /> Volver al salón
          </button>
          <Account
            table={tableDetail}
            s={s}
            act={act}
            onAdd={() => setManual(tableDetail)}
            onPay={setPay}
          />
        </main>
      ) : (
        <main>
          <div className="page-heading">
            <div className="intro">
              <span className="eyebrow">UN BUEN DÍA EMPIEZA ACÁ</span>
              <h1>Así está el salón</h1>
              <p>Quince mesas, muchas buenas conversaciones.</p>
            </div>
            <button className="secondary" onClick={() => nav("/comandera")}>
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
              <strong>
                {ready.length}
                <small> pedidos</small>
              </strong>
            </div>
            <div>
              <span>Consumos abiertos</span>
              <strong>
                {money(opened.reduce((n, a) => n + totalAccount(s, a.id), 0))}
              </strong>
            </div>
          </div>
          <div className="section-title">
            <h2>
              Mesas del salón <span>15</span>
            </h2>
            <small>
              <span className="dot dot-3" /> Libre{" "}
              <span className="dot dot-1" /> Ocupada{" "}
              <span className="dot dot-2" /> Pedido listo
            </small>
          </div>
          <div className="table-grid">
            {Array.from({ length: 15 }, (_, i) => {
              const n = i + 1,
                a = activeAccount(s, n),
                r = ready.filter((o) => o.table === n).length;
              return (
                <button
                  className={
                    "table-card " + (a ? "occupied " : "") + (r ? "ready" : "")
                  }
                  key={n}
                  onClick={() => nav("/salon/" + n)}
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
                  <div className="table-bottom">
                    <strong>
                      {a ? money(totalAccount(s, a.id)) : "Abrir mesa"}
                    </strong>
                    <ArrowRight size={17} />
                  </div>
                </button>
              );
            })}
          </div>
          {s.payments.length > 0 && (
            <section className="payment-log">
              <h2>Últimos cobros de prueba</h2>
              {s.payments
                .slice(-5)
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
      )}
      <footer>
        <span>NaniFer · Hecho para compartir momentos ricos.</span>
        <button onClick={() => setReset(true)}>
          <RotateCcw size={14} /> Restablecer demostración
        </button>
      </footer>
      {manual && (
        <Modal
          title={"Pedido manual · Mesa " + manual}
          onClose={() => setManual(null)}
        >
          <Menu
            table={manual}
            s={s}
            act={act}
            manual
            onDone={() => setManual(null)}
          />
        </Modal>
      )}
      {pay && (
        <Payment
          id={pay}
          s={s}
          act={act}
          onClose={() => setPay(null)}
          onSuccess={() => {
            setPay(null);
            nav("/salon");
            setNotice(
              "Cobro guardado. La mesa quedó libre para una nueva visita.",
            );
          }}
        />
      )}
      {reset && (
        <Modal title="Restablecer demostración" onClose={() => setReset(false)}>
          <p>
            Se eliminarán las cuentas, pedidos y cobros de prueba en todas las
            pestañas. Los carritos también se vaciarán al recargar.
          </p>
          <button
            className="primary full"
            onClick={async () => {
              if (await act({ type: "reset" })) {
                setReset(false);
                location.reload();
              }
            }}
          >
            Eliminar datos de prueba
          </button>
        </Modal>
      )}
    </>
  );
}
function Account({ table, s, act, onAdd, onPay }) {
  const a = activeAccount(s, table);
  const orders = a ? s.orders.filter((o) => o.accountId === a.id) : [];
  return (
    <>
      <div className="page-heading">
        <div className="intro">
          <span className="eyebrow">CUENTA DE LA VISITA</span>
          <h1>Mesa {table}</h1>
          <p>
            {a
              ? "Abierta a las " + time(a.openedAt)
              : "La próxima historia empieza con un pedido."}
          </p>
        </div>
        <Badge tone={a ? "amber" : "green"}>
          {a ? "Cuenta abierta" : "Mesa libre"}
        </Badge>
      </div>
      <div className="account-layout">
        <section>
          {orders.length ? (
            orders.map((o) => (
              <article className="panel" key={o.id}>
                <div className="row">
                  <h3>
                    Pedido #{o.id.slice(0, 5)} · {time(o.createdAt)}
                  </h3>
                  <Badge
                    tone={o.status === "listo para entregar" ? "green" : ""}
                  >
                    {o.status}
                  </Badge>
                </div>
                <Items items={o.items} />
              </article>
            ))
          ) : (
            <div className="empty">
              <Coffee size={40} />
              <h2>Todavía no hay consumos</h2>
              <p>Podés abrir la mesa o cargar el primer pedido.</p>
            </div>
          )}
        </section>
        <aside className="panel account-summary">
          <h2>La cuenta</h2>
          <label>
            Moza responsable
            <select
              value={a?.waitress || staff[0]}
              onChange={(e) =>
                a && act({ type: "staff", id: a.id, name: e.target.value })
              }
              disabled={!a}
            >
              {staff.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="total">
            <span>Total a cobrar</span>
            <strong>{money(a ? totalAccount(s, a.id) : 0)}</strong>
          </div>
          <button className="primary full" onClick={onAdd}>
            <Plus size={17} /> Agregar pedido
          </button>
          {!a ? (
            <button
              className="secondary full"
              onClick={() => act({ type: "open", table })}
            >
              Abrir mesa
            </button>
          ) : (
            <button
              className="secondary full"
              disabled={!orders.length}
              onClick={() => onPay(a.id)}
            >
              <Receipt size={17} /> Cobrar y cerrar
            </button>
          )}
          <small>Entregar un pedido no lo marca como pagado.</small>
        </aside>
      </div>
    </>
  );
}
function Menu({ table, s, act, manual = false, onDone }) {
  const [category, setCategory] = useState(categories[0]);
  const [product, setProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const guard = useRef(false);
  const token = useRef(crypto.randomUUID());
  const a = activeAccount(s, table);
  const accountRef = useRef(a?.id || null);
  useEffect(() => {
    if (accountRef.current !== (a?.id || null)) {
      setCart([]);
      token.current = crypto.randomUUID();
      accountRef.current = a?.id || null;
    }
  }, [a?.id]);
  async function send() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    const ok = await act({
      type: "order",
      table,
      expectedAccount: a?.id || null,
      items: cart,
      token: token.current,
    });
    if (ok) {
      setCart([]);
      token.current = crypto.randomUUID();
      setSent(true);
      onDone?.();
    }
    setBusy(false);
    guard.current = false;
  }
  return (
    <div className={manual ? "manual-menu" : "menu-page"}>
      {!manual && (
        <section className="menu-hero">
          <div>
            <Badge tone="green">ESTÁS EN LA MESA {table}</Badge>
            <h1>
              Un ratito para
              <br />
              <em>disfrutar.</em>
            </h1>
            <p>
              Helados artesanales, café recién hecho
              <br />y tus cosas favoritas.
            </p>
            <span className="hero-label">
              HECHO CON CARIÑO, SERVIDO CON UNA SONRISA
            </span>
          </div>
          <div className="hero-art">
            <span>✦</span>
            <IceCreamBowl strokeWidth={1} />
            <i>
              desde siempre,
              <br />
              bien rico.
            </i>
          </div>
        </section>
      )}
      <div className="menu-layout">
        <section>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="section-title">
            <h2>{category}</h2>
            <small>Un gusto para cada momento</small>
          </div>
          <div className="product-grid">
            {products
              .filter((p) => p.category === category)
              .map((p) => (
                <button
                  className={
                    "product-card " + (!p.available ? "unavailable" : "")
                  }
                  key={p.id}
                  disabled={!p.available}
                  onClick={() => setProduct(p)}
                >
                  <div className={"product-art art-" + p.category}>
                    {p.emoji}
                    {!p.available && <Badge>Agotado por hoy</Badge>}
                  </div>
                  <div className="product-copy">
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div className="row">
                      <strong>
                        {p.sizes ? "Desde " : ""}
                        {money(p.price)}
                      </strong>
                      <span className="add-circle">
                        <Plus size={18} />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </section>
        <aside>
          <div className="panel cart">
            <div className="row">
              <h2>
                <ShoppingBag size={20} /> Tu pedido
              </h2>
              <Badge>Mesa {table}</Badge>
            </div>
            {!cart.length ? (
              <p className="cart-empty">
                Lo rico está por venir.
                <br />
                Elegí algo de la carta para empezar.
              </p>
            ) : (
              cart.map((i, k) => (
                <div className="cart-line" key={k}>
                  <Items items={[i]} />
                  <div className="row">
                    <div className="quantity">
                      <button
                        aria-label="Disminuir cantidad"
                        onClick={() =>
                          setCart(
                            cart.flatMap((x, j) =>
                              j !== k
                                ? [x]
                                : x.quantity > 1
                                  ? [{ ...x, quantity: x.quantity - 1 }]
                                  : [],
                            ),
                          )
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        aria-label="Aumentar cantidad"
                        disabled={i.quantity >= 99}
                        onClick={() =>
                          setCart(
                            cart.map((x, j) =>
                              j === k ? { ...x, quantity: x.quantity + 1 } : x,
                            ),
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setCart(cart.filter((_, j) => j !== k))}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="total">
              <span>Total</span>
              <strong>
                {money(cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0))}
              </strong>
            </div>
            <button
              className="primary full"
              disabled={!cart.length || busy}
              onClick={send}
            >
              {busy ? "Enviando…" : "Confirmar pedido"}
              <ArrowRight size={17} />
            </button>
            <small>Lo preparamos y te lo llevamos a la mesa.</small>
            {sent && (
              <p className="success" role="status">
                ✓ Pedido confirmado. ¡Ya lo recibimos!
              </p>
            )}
          </div>
          {a && (
            <div className="panel tracking">
              <h3>Tu visita · {money(totalAccount(s, a.id))}</h3>
              {s.orders
                .filter((o) => o.accountId === a.id)
                .map((o) => (
                  <div key={o.id}>
                    <div className="row">
                      <small>
                        Pedido #{o.id.slice(0, 5)} · {time(o.createdAt)}
                      </small>
                      <Badge
                        tone={o.status === "listo para entregar" ? "green" : ""}
                      >
                        {o.status}
                      </Badge>
                    </div>
                    <p>
                      {o.items
                        .map((i) => i.quantity + "× " + i.name)
                        .join(", ")}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
      {product && (
        <Product
          product={product}
          onClose={() => setProduct(null)}
          onAdd={(i) => {
            setCart([...cart, i]);
            setProduct(null);
            setSent(false);
          }}
        />
      )}
    </div>
  );
}
function Product({ product: p, onClose, onAdd }) {
  const [size, setSize] = useState(p.sizes?.[0]?.name || "");
  const [chosen, setChosen] = useState([]);
  const [extras, setExtras] = useState([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const max = p.sizes?.find((s) => s.name === size)?.max;
  const unit =
    p.price +
    (p.sizes?.find((s) => s.name === size)?.price || 0) +
    extras.reduce((n, e) => n + p.extras.find((x) => x.name === e).price, 0);
  const toggle = (value, list, set) =>
    set(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    );
  return (
    <Modal title={p.name} onClose={onClose}>
      <p>{p.description}</p>
      {p.sizes && (
        <fieldset>
          <legend>Tamaño</legend>
          {p.sizes.map((z) => (
            <label className="option" key={z.name}>
              <input
                type="radio"
                name="size"
                checked={size === z.name}
                onChange={() => {
                  setSize(z.name);
                  setChosen([]);
                }}
              />
              {z.name}
              <span>{z.price ? "+ " + money(z.price) : "Incluido"}</span>
            </label>
          ))}
        </fieldset>
      )}
      {max && (
        <fieldset>
          <legend>Sabores · elegí de 1 a {max}</legend>
          {flavors.map((f) => (
            <label
              className={"option " + (!f.available ? "unavailable" : "")}
              key={f.name}
            >
              <input
                type="checkbox"
                checked={chosen.includes(f.name)}
                disabled={
                  !f.available ||
                  (!chosen.includes(f.name) && chosen.length >= max)
                }
                onChange={() => toggle(f.name, chosen, setChosen)}
              />
              {f.name}
              <span>{!f.available ? "Agotado" : ""}</span>
            </label>
          ))}
        </fieldset>
      )}
      {p.extras && (
        <fieldset>
          <legend>Un toque extra · opcional</legend>
          {p.extras.map((e) => (
            <label className="option" key={e.name}>
              <input
                type="checkbox"
                checked={extras.includes(e.name)}
                onChange={() => toggle(e.name, extras, setExtras)}
              />
              {e.name}
              <span>+ {money(e.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Observaciones
        <textarea
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Por ejemplo: sin azúcar, para compartir…"
        />
      </label>
      <label>
        Cantidad
        <input
          type="number"
          min="1"
          max="99"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <button
        className="primary full"
        disabled={
          (max && !chosen.length) ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 99
        }
        onClick={() =>
          onAdd(
            priceItem({
              productId: p.id,
              size,
              flavors: chosen,
              extras,
              notes,
              quantity,
            }),
          )
        }
      >
        Agregar · {money(unit * quantity)}
        <Plus size={18} />
      </button>
    </Modal>
  );
}
function Payment({ id, s, act, onClose, onSuccess }) {
  const [method, setMethod] = useState("efectivo");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const a = s.accounts.find((a) => a.id === id && !a.closedAt);
  const total = totalAccount(s, id);
  const pending = s.orders.some(
    (o) => o.accountId === id && o.status !== "entregado",
  );
  const invalid =
    method === "efectivo" &&
    received !== "" &&
    (!Number.isFinite(Number(received)) || Number(received) < total);
  return (
    <Modal title={"Cobrar · Mesa " + (a?.table || "cerrada")} onClose={onClose}>
      <p>El importe incluye todos los consumos de esta visita.</p>
      <div className="payment-total">
        Total a cobrar<strong>{money(total)}</strong>
      </div>
      <fieldset>
        <legend>Medio de pago</legend>
        {["efectivo", "tarjeta", "transferencia"].map((m) => (
          <label className="option" key={m}>
            <input
              type="radio"
              name="method"
              checked={method === m}
              onChange={() => setMethod(m)}
            />
            {m}
          </label>
        ))}
      </fieldset>
      {method === "efectivo" && (
        <>
          <label>
            Dinero recibido (opcional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="Importe en pesos"
            />
          </label>
          {received !== "" && (
            <p className={invalid ? "note" : "success"}>
              {invalid
                ? "El importe no alcanza."
                : "Vuelto: " + money(Number(received) - total)}
            </p>
          )}
        </>
      )}
      {pending && (
        <p className="note">
          Hay pedidos sin entregar. Completá la entrega en la comandera antes de
          cobrar.
        </p>
      )}
      {!a && <p>Esta cuenta ya fue cerrada en otra pestaña.</p>}
      <button
        className="primary full"
        disabled={busy || pending || invalid || !a || total <= 0}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          if (await act({ type: "pay", id, method, received })) onSuccess();
          lock.current = false;
          setBusy(false);
        }}
      >
        {busy ? "Guardando…" : "Confirmar cobro y liberar mesa"}
        <Check size={18} />
      </button>
      <small>Registro de prueba. No procesa pagos electrónicos.</small>
    </Modal>
  );
}
createRoot(document.getElementById("root")).render(<App />);
