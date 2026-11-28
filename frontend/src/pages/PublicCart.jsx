import React, { useState, useEffect, useRef } from "react";
import { request, useStore } from "../store";
import { money, itemInput, operationId, tableLabel, time } from "../domain";
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

export default function PublicCart({
  table,
  cart,
  setCart,
  sentOrders = [],
  onRefreshOrders,
  onClose,
}) {
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
  const sentTotal = sentOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  function confirmed(result, kind) {
    localStorage.removeItem(scope);
    setPending(null);
    setError("");
    if (kind === "orders") {
      setCart([]);
      setOrderSent(true);
      setMessage("");
      if (onRefreshOrders) void onRefreshOrders();
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

  const hasSentOrders = sentOrders.length > 0;
  const chronologicalSent = [...sentOrders].reverse();

  return (
    <Modal
      title={
        orderSent
          ? "¡Pedido enviado! · " + tableLabel(null, table)
          : hasSentOrders && !cart.length
          ? "🧾 Mi pedido y cuenta · " + tableLabel(null, table)
          : "Tu selección · " + tableLabel(null, table)
      }
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

      {orderSent && (
        <div
          className="order-sent-success-view"
          style={{
            textAlign: "center",
            padding: "14px 12px 12px",
            background: "#f0fdf4",
            border: "1.5px solid #86efac",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "34px", marginBottom: "6px", lineHeight: 1 }}>✨🍽️</div>
          <h3
            style={{
              fontSize: "17px",
              color: "#166534",
              margin: "0 0 4px",
              fontWeight: 800,
            }}
          >
            ¡Pedido enviado a recepción!
          </h3>
          <p
            style={{
              color: "#14532d",
              fontSize: "14px",
              lineHeight: "1.4",
              margin: 0,
            }}
          >
            Tu pedido ya fue recibido por el personal y queda registrado abajo en tu cuenta de la mesa.
          </p>
        </div>
      )}

      {!cart.length && !hasSentOrders && !orderSent ? (
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

      {cart.length > 0 && hasSentOrders && (
        <div
          style={{
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.8px",
            color: "#9a3412",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            padding: "6px 10px",
            borderRadius: "8px",
            marginBottom: "8px",
            textTransform: "uppercase",
          }}
        >
          ➕ Nuevo para agregar ahora (sin enviar aún)
        </div>
      )}

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
                  {[i.size, ...(i.flavors || []), ...(i.extras || []), i.preparation]
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
            <span>{hasSentOrders ? "Subtotal a enviar ahora" : "Total estimado"}</span>
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
            {busy
              ? "Enviando…"
              : hasSentOrders
              ? "Enviar nuevo pedido a mi mesa"
              : "Enviar pedido a recepción"}
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

      {hasSentOrders && (
        <div
          style={{
            marginTop: cart.length > 0 ? "22px" : "4px",
            paddingTop: cart.length > 0 ? "18px" : "0",
            borderTop: cart.length > 0 ? "2px dashed #e2d5c4" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.8px",
                color: "#5A3A22",
                textTransform: "uppercase",
              }}
            >
              🧾 Pedidos enviados en esta visita ({chronologicalSent.length})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
            {chronologicalSent.map((ord, idx) => (
              <div
                key={ord.id}
                style={{
                  background: "#faf6f0",
                  border: "1px solid #e6dac8",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                    paddingBottom: "5px",
                    borderBottom: "1px solid #ede4d7",
                    fontSize: "12.5px",
                  }}
                >
                  <strong style={{ color: "#3B2417" }}>
                    Pedido #{idx + 1} · {ord.createdAt ? time(ord.createdAt) : ""}
                  </strong>
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#166534",
                      fontWeight: 700,
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "999px",
                    }}
                  >
                    ✓ Recibido en salón
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {(ord.items || []).map((it) => {
                    const details = [
                      it.size,
                      ...(it.flavors || []),
                      ...(it.extras || []),
                      it.notes,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={it.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "8px",
                          fontSize: "13.5px",
                        }}
                      >
                        <div style={{ color: "#2b1b10" }}>
                          <strong>{it.quantity}x</strong> {it.name}
                          {details && (
                            <small style={{ display: "block", color: "#78583e", fontSize: "11.5px" }}>
                              {details}
                            </small>
                          )}
                        </div>
                        <strong style={{ color: "#3B2417", whiteSpace: "nowrap" }}>
                          {money((it.unitPrice || 0) * (it.quantity || 1))}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            className="total"
            style={{
              background: "#f3eadb",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1.5px solid #d9a94b",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontWeight: 700, color: "#3B2417" }}>
              Total acumulado de mi pedido
            </span>
            <strong style={{ fontSize: "18px", color: "#3B2417" }}>
              {money(sentTotal)}
            </strong>
          </div>

          {!cart.length && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                className="primary full"
                onClick={onClose}
                style={{ fontWeight: 700 }}
              >
                + Seguir pidiendo de la carta
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
          )}
        </div>
      )}
    </Modal>
  );
}
