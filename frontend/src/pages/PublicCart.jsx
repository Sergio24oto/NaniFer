import React, { useState, useEffect, useRef } from "react";
import { request } from "../store";
import { money, itemInput, operationId, tableLabel } from "../domain";
import { Modal } from "../components";

export function publicDevice() {
  let id = localStorage.getItem("nf.public.device");
  if (!id) {
    id = operationId();
    localStorage.setItem("nf.public.device", id);
  }
  return id;
}

export default function PublicCart({ table, cart, setCart, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orderSent, setOrderSent] = useState(false);
  const [alternative, setAlternative] = useState(false);

  const scope = "nf.public.pending." + table;
  const [pending, setPending] = useState(() =>
    JSON.parse(localStorage.getItem(scope) || "null")
  );
  const lock = useRef(false);
  const total = cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0);

  function confirmed(result, kind) {
    localStorage.removeItem(scope);
    setPending(null);
    setError("");
    if (kind === "orders") {
      setCart([]);
      setOrderSent(true);
      setMessage("");
    } else {
      setMessage(
        "La moza fue avisada. En breve se acercará a la " +
          tableLabel(null, table) +
          ". Tu selección no fue enviada."
      );
    }
  }

  useEffect(() => {
    if (!pending || busy) return;
    let live = true;
    const check = async () => {
      try {
        const r = await request(
          "/public/qr/" + table + "/operations/" + pending.key,
          { device: publicDevice() }
        );
        if (live && r.confirmed) confirmed(r.result, pending.kind);
      } catch {}
    };
    void check();
    const t = setInterval(check, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pending, busy]);

  async function send(kind) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = pending || {
        kind,
        key: operationId(),
        body: kind === "orders" ? { items: cart.map(itemInput) } : {},
      };
      localStorage.setItem(scope, JSON.stringify(p));
      setPending(p);
      const r = await request("/public/qr/" + table + "/" + p.kind, {
        method: "POST",
        key: p.key,
        body: p.body,
        device: publicDevice(),
      });
      confirmed(r, p.kind);
    } catch (e) {
      setError(e.message);
      if (!e.uncertain) {
        localStorage.removeItem(scope);
        setPending(null);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={orderSent ? "¡Pedido enviado! · " + tableLabel(null, table) : "Tu selección · " + tableLabel(null, table)}
      onClose={() => !busy && onClose()}
    >
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {pending && !busy && (
        <p role="status" className="note">
          Estamos comprobando si{" "}
          {pending.kind === "orders"
            ? "el pedido fue recibido"
            : "la moza fue avisada"}
          .{" "}
          <button onClick={() => send(pending.kind)}>
            Reintentar de forma segura
          </button>
        </p>
      )}

      {orderSent ? (
        <div
          className="order-sent-success-view"
          style={{ textAlign: "center", padding: "18px 12px 10px" }}
        >
          <div style={{ fontSize: "44px", marginBottom: "12px", lineHeight: 1 }}>✨🍽️</div>
          <h3
            style={{
              fontSize: "19px",
              color: "var(--brand-wood-dark, #3B2417)",
              marginBottom: "8px",
              fontWeight: 800,
            }}
          >
            ¡Pedido enviado con éxito!
          </h3>
          <p
            style={{
              color: "#5A3A22",
              fontSize: "15px",
              lineHeight: "1.45",
              marginBottom: "24px",
            }}
          >
            Tu pedido ya fue recibido por el personal.<br />
            <strong>Pronto se trae el pedido a tu mesa.</strong><br />
            <small style={{ color: "#78583e", fontSize: "12.5px" }}>¡Muchas gracias por tu visita!</small>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              className="primary full"
              onClick={onClose}
              style={{ fontWeight: 700, padding: "12px" }}
            >
              Seguir explorando la carta
            </button>
            <button
              type="button"
              className="secondary full"
              disabled={busy || !!pending}
              onClick={() => send("call")}
            >
              🛎️ Llamar a la moza a la {tableLabel(null, table)}
            </button>
          </div>
        </div>
      ) : !cart.length ? (
        <div
          className="empty-cart-view"
          style={{ textAlign: "center", padding: "14px 0" }}
        >
          <p
            style={{
              marginBottom: "16px",
              color: "var(--brand-text-muted,#777)",
            }}
          >
            Tu selección está vacía.
          </p>
          <button
            type="button"
            className="secondary full empty-call-btn"
            disabled={busy || !!pending}
            onClick={() => send("call")}
          >
            🛎️ Llamar a la moza a la {tableLabel(null, table)}
          </button>
        </div>
      ) : null}

      {cart.map((i, n) => (
        <div className="quick-line" key={n}>
          <div>
            <strong>{i.name}</strong>
            <small>
              {[i.size, ...(i.flavors || []), ...(i.extras || [])]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <small>{money(i.unitPrice * i.quantity)}</small>
          </div>
          <label>
            Cantidad
            <input
              aria-label={"Cantidad de " + i.name}
              type="number"
              min="1"
              max="99"
              disabled={busy || !!pending}
              value={i.quantity}
              onChange={(e) => {
                const q = Number(e.target.value);
                if (Number.isInteger(q) && q > 0 && q <= 99)
                  setCart(
                    cart.map((x, j) => (j === n ? { ...x, quantity: q } : x))
                  );
              }}
            />
          </label>
          <button
            disabled={busy || !!pending}
            onClick={() => setCart(cart.filter((_, j) => j !== n))}
          >
            Quitar
          </button>
        </div>
      ))}

      {!!cart.length && (
        <>
          <div className="total">
            <span>Total estimado</span>
            <strong>{money(total)}</strong>
          </div>
          <small>
            El servidor confirma los precios y la disponibilidad al enviar.
          </small>
          <p>Tu pedido se enviará directamente al personal.</p>
          <button
            className="primary full"
            disabled={busy || !!pending}
            onClick={() => send("orders")}
          >
            {busy ? "Enviando…" : "Enviar pedido a recepción"}
          </button>
          <button
            className="secondary full"
            disabled={busy || !!pending}
            onClick={() => setAlternative(true)}
          >
            Prefiero pedirle a la moza
          </button>
          {alternative && (
            <div className="note">
              <p>
                Avisaremos a la moza para que se acerque a tu mesa. Tu selección
                no se enviará.
              </p>
              <button
                className="primary"
                disabled={busy || !!pending}
                onClick={() => send("call")}
              >
                Llamar a la moza
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
