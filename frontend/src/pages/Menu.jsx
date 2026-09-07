import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  Plus,
  Minus,
  ArrowRight,
} from "lucide-react";
import { Badge, Items } from "../components";
import { activeAccount, money, itemInput, time } from "../domain";
import {
  useStore,
  mutate,
  submitOnce,
  pendingOperation,
  refresh,
} from "../store";
import Product from "./Product";
export default function Menu({ table, manual = false, onDone }) {
  const s = useStore();
  const { products, categories } = s.catalog;
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const guard = useRef(false);
  const a = activeAccount(s, table);
  const scope = (manual ? "staff" : "public") + "-order-" + table;
  const pending = pendingOperation(scope);
  const selected = categories.includes(category) ? category : categories[0];
  const previous = useRef(a?.id);
  useEffect(() => {
    if (previous.current && previous.current !== a?.id) {
      setCart([]);
      setSent("La visita cambió. Revisá la mesa antes de iniciar otro pedido.");
    }
    previous.current = a?.id;
  }, [a?.id]);
  async function run(fn) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function send() {
    await run(async () => {
      const path = manual
        ? "/visits/" + a.id + "/orders"
        : "/public/mesa/" + table + "/orders";
      const result = await submitOnce(scope, path, {
        expectedAccount: a.id,
        items: cart.map(itemInput),
      });
      setCart([]);
      setSent(
        "Pedido #" + result.id.slice(0, 5) + " confirmado por el servidor.",
      );
      onDone?.();
    });
  }
  return (
    <div className={manual ? "manual-menu" : "menu-page"}>
      {!manual && (
        <section className="menu-hero brand-hero">
          <div>
            <Badge tone="green">MESA {table}</Badge>
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
              HECHO PARA DISFRUTAR, ACÁ EN NANIFER
            </span>
          </div>
          <div className="hero-photo">
            <img src="/brand/interior.jpg" alt="Nuestro local NaniFer: un espacio cálido para disfrutar helados y café" fetchPriority="high" />
            <span>Tu lugar para algo rico.</span>
          </div>
        </section>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {sent && (
        <p className="success" role="status">
          {sent}
        </p>
      )}
      {!a && !s.loading && (
        <div className="panel">
          <h2>{manual ? "Abrir mesa" : "Empezar en esta mesa"}</h2>
          <p>Se abrirá una visita o te unirás a la que está en curso.</p>
          <button
            className="primary"
            disabled={busy || !s.connected}
            onClick={() =>
              run(() =>
                mutate(
                  manual
                    ? "/tables/" + table + "/open"
                    : "/public/mesa/" + table + "/join",
                ),
              )
            }
          >
            Iniciar visita · Mesa {table}
          </button>
        </div>
      )}
      <div className="menu-layout">
        <section>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                className={selected === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="section-title">
            <h2>{selected || "Carta"}</h2>
            <small>Un gusto para cada momento</small>
          </div>
          {!products.length && (
            <p>La carta todavía no tiene productos cargados.</p>
          )}
          <div className="product-grid">
            {products
              .filter((p) => p.category === selected)
              .map((p) => (
                <button
                  className={
                    "product-card " + (!p.available ? "unavailable" : "")
                  }
                  key={p.id}
                  disabled={!p.available || !!pending || busy}
                  onClick={() => setProduct(p)}
                >
                  <div className={"product-art art-" + p.category}>
                    {p.image ? <img src={p.image} alt={p.name} /> : p.emoji}
                    {!p.available && <Badge>Agotado</Badge>}
                  </div>
                  <div className="product-copy">
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div className="row">
                      <strong>
                        {p.sizes?.length ? "Desde " : ""}
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
            <h2>
              <ShoppingBag size={20} /> Tu pedido · Mesa {table}
            </h2>
            {pending && (
              <p className="note">
                Hay un envío sin confirmar. Reintentá el mismo pedido; no se
                duplicará.
              </p>
            )}
            {!cart.length && !pending && (
              <p className="cart-empty">Elegí algo de la carta para empezar.</p>
            )}
            {cart.map((i, k) => (
              <div className="cart-line" key={k}>
                <Items items={[i]} />
                <div className="row">
                  <div className="quantity">
                    <button
                      aria-label="Disminuir cantidad"
                      disabled={busy || !!pending}
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
                      disabled={busy || !!pending || i.quantity >= 99}
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
                    disabled={busy || !!pending}
                    onClick={() => setCart(cart.filter((_, j) => j !== k))}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <div className="total">
              <span>Total estimado</span>
              <strong>
                {money(cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0))}
              </strong>
            </div>
            <button
              className="primary full"
              disabled={
                busy || !s.connected || (!pending && (!a || !cart.length))
              }
              onClick={
                pending
                  ? () =>
                      run(async () => {
                        const result = await submitOnce(
                          scope,
                          pending.path,
                          pending.body,
                        );
                        setCart([]);
                        setSent(
                          "Pedido #" + result.id.slice(0, 5) + " confirmado.",
                        );
                        onDone?.();
                      })
                  : send
              }
            >
              {busy
                ? "Confirmando…"
                : pending
                  ? "Reintentar pedido"
                  : "Confirmar pedido"}
              <ArrowRight size={17} />
            </button>
            <small>Precios y disponibilidad se validan al confirmar.</small>
          </div>
          {a && (
            <div className="panel tracking">
              <h3>Tu visita · {money(a.total)}</h3>
              <p>
                Pagado: {money(a.paid)} · Pendiente: {money(a.balance)}
              </p>
              {s.orders
                .filter((o) => o.accountId === a.id)
                .map((o) => (
                  <div key={o.id}>
                    <div className="row">
                      <small>
                        #{o.id.slice(0, 5)} · {time(o.createdAt)}
                      </small>
                      <Badge
                        tone={o.status === "listo para entregar" ? "green" : ""}
                      >
                        {o.status}
                      </Badge>
                    </div>
                    <Items items={o.items} />
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
            setSent("");
          }}
        />
      )}
    </div>
  );
}
