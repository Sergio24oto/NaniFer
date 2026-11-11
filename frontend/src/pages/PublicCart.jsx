import React, { useState, useEffect, useRef } from "react";
import { request, useStore } from "../store";
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

function getProductForCartItem(item, catalogProducts = []) {
  if (!catalogProducts?.length || !item) return null;
  const targetId = item.productId || item.product;
  return (
    catalogProducts.find((p) => p.id === targetId) ||
    catalogProducts.find(
      (p) =>
        (p.name || "").trim().toLowerCase() ===
        (item.name || "").trim().toLowerCase()
    ) ||
    null
  );
}

function getAvailableVarieties(product) {
  if (!product) return [];
  if (Array.isArray(product.flavorOptions) && product.flavorOptions.length > 0) {
    return product.flavorOptions;
  }
  if (Array.isArray(product.sizes) && product.sizes.length > 1) {
    return product.sizes.map((s) => s.name);
  }
  return [];
}

export default function PublicCart({ table, cart, setCart, onClose }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orderSent, setOrderSent] = useState(false);
  const [alternative, setAlternative] = useState(false);
  const [editingVarietyIndex, setEditingVarietyIndex] = useState(null);

  const scope = "nf.public.pending." + table;
  const [pending, setPending] = useState(() =>
    JSON.parse(localStorage.getItem(scope) || "null")
  );
  const lock = useRef(false);
  const total = cart.reduce(
    (n, i) => n + (i.unitPrice || 0) * (Number(i.quantity) || 1),
    0
  );

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
      const sanitizedCart = cart.map((item) => ({
        ...item,
        quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
      }));
      const p = pending || {
        kind,
        key: operationId(),
        body: kind === "orders" ? { items: sanitizedCart.map(itemInput) } : {},
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

  function handleSelectVariety(itemIndex, newVariety, origProduct) {
    const item = cart[itemIndex];
    if (!item) return;

    const isFlavor = (origProduct?.flavorOptions || []).includes(newVariety);
    const isSize = (origProduct?.sizes || []).some((sz) => sz.name === newVariety);

    let updatedItem = { ...item };
    if (isFlavor) {
      updatedItem.flavors = [newVariety];
      updatedItem.notes = newVariety;
    } else if (isSize) {
      const sizeObj = origProduct.sizes.find((sz) => sz.name === newVariety);
      updatedItem.size = newVariety;
      if (sizeObj && sizeObj.salePrice != null) {
        updatedItem.unitPrice = Number(sizeObj.salePrice);
      } else if (sizeObj && sizeObj.price != null) {
        updatedItem.unitPrice = Number(sizeObj.price);
      }
    } else {
      updatedItem.flavors = [newVariety];
      updatedItem.notes = newVariety;
    }

    // Comprobar si ya existe otro renglón idéntico en el carrito con esta nueva variedad
    const duplicateIndex = cart.findIndex(
      (x, idx) =>
        idx !== itemIndex &&
        (x.productId === updatedItem.productId || x.product === updatedItem.productId) &&
        (x.size || "") === (updatedItem.size || "") &&
        JSON.stringify(x.flavors || []) === JSON.stringify(updatedItem.flavors || []) &&
        JSON.stringify(x.extras || []) === JSON.stringify(updatedItem.extras || [])
    );

    if (duplicateIndex >= 0) {
      const mergedQty =
        (Number(cart[duplicateIndex].quantity) || 1) +
        (Number(updatedItem.quantity) || 1);
      setCart(
        cart
          .map((x, idx) =>
            idx === duplicateIndex
              ? { ...x, quantity: Math.min(99, mergedQty) }
              : x
          )
          .filter((_, idx) => idx !== itemIndex)
      );
    } else {
      setCart(cart.map((x, idx) => (idx === itemIndex ? updatedItem : x)));
    }

    setEditingVarietyIndex(null);
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

      {cart.map((i, n) => {
        const origProduct = getProductForCartItem(i, s.catalog?.products);
        const availableVarieties = getAvailableVarieties(origProduct);
        const hasVarieties = availableVarieties.length > 0;
        const currentQty = i.quantity;
        const safeQty = Number(i.quantity) || 1;
        const isEditingThis = editingVarietyIndex === n;

        return (
          <div className="cart-item-row-wrapper" key={n}>
            <div className="quick-line">
              <div className="cart-item-info">
                <strong className="cart-item-name">{i.name}</strong>
                <small className="cart-item-sub">
                  {[i.size, ...(i.flavors || []), ...(i.extras || [])]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                <small className="cart-item-price">
                  {money((i.unitPrice || 0) * safeQty)}
                </small>
                {hasVarieties && (
                  <button
                    type="button"
                    className="cart-change-variety-btn"
                    disabled={busy || !!pending}
                    onClick={() =>
                      setEditingVarietyIndex(isEditingThis ? null : n)
                    }
                    title="Cambiar variedad o presentación"
                  >
                    ✏️ {isEditingThis ? "Cerrar opciones" : "Cambiar variedad"}
                  </button>
                )}
              </div>

              <div className="cart-item-stepper-wrap">
                <span className="cart-item-stepper-label">Cantidad</span>
                <div className="cart-item-stepper">
                  <button
                    type="button"
                    className="cart-stepper-btn cart-stepper-minus"
                    aria-label={"Restar una unidad de " + i.name}
                    disabled={busy || !!pending || safeQty <= 1}
                    onClick={() => {
                      if (safeQty > 1) {
                        setCart(
                          cart.map((x, j) =>
                            j === n ? { ...x, quantity: safeQty - 1 } : x
                          )
                        );
                      }
                    }}
                  >
                    −
                  </button>
                  <input
                    aria-label={"Cantidad de " + i.name}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="cart-stepper-input"
                    disabled={busy || !!pending}
                    value={currentQty ?? 1}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      if (val === "") {
                        setCart(
                          cart.map((x, j) =>
                            j === n ? { ...x, quantity: "" } : x
                          )
                        );
                        return;
                      }
                      const parsed = parseInt(val, 10);
                      if (!isNaN(parsed)) {
                        setCart(
                          cart.map((x, j) =>
                            j === n
                              ? {
                                  ...x,
                                  quantity: Math.min(99, Math.max(1, parsed)),
                                }
                              : x
                          )
                        );
                      }
                    }}
                    onBlur={(e) => {
                      const cur = Number(e.target.value);
                      const valid =
                        !isNaN(cur) && cur >= 1 ? Math.min(99, cur) : 1;
                      setCart(
                        cart.map((x, j) =>
                          j === n ? { ...x, quantity: valid } : x
                        )
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="cart-stepper-btn cart-stepper-plus"
                    aria-label={"Sumar una unidad de " + i.name}
                    disabled={busy || !!pending || safeQty >= 99}
                    onClick={() => {
                      if (safeQty < 99) {
                        setCart(
                          cart.map((x, j) =>
                            j === n ? { ...x, quantity: safeQty + 1 } : x
                          )
                        );
                      }
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="cart-remove-item-btn"
                disabled={busy || !!pending}
                onClick={() => {
                  setCart(cart.filter((_, j) => j !== n));
                  if (editingVarietyIndex === n) setEditingVarietyIndex(null);
                }}
              >
                Quitar
              </button>
            </div>

            {isEditingThis && (
              <div className="cart-variety-picker-box">
                <div className="cart-variety-picker-header">
                  <span className="cart-variety-picker-title">
                    Elegí otra variedad para <strong>{i.name}</strong>:
                  </span>
                  <button
                    type="button"
                    className="cart-variety-picker-close"
                    onClick={() => setEditingVarietyIndex(null)}
                    aria-label="Cerrar selector de variedad"
                  >
                    ✕
                  </button>
                </div>
                <div className="cart-variety-chips">
                  {availableVarieties.map((v) => {
                    const isCurrent =
                      (i.flavors || []).includes(v) || i.size === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`cart-variety-chip ${
                          isCurrent ? "is-current" : ""
                        }`}
                        onClick={() => handleSelectVariety(n, v, origProduct)}
                      >
                        {isCurrent ? `✓ ${v} (elegida)` : v}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

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
