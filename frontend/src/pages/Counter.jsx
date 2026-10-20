import React, { useRef, useState } from "react";
import { useDraft } from "../useDraft";
import QuickEntry from "./QuickEntry";
import { restoreCart } from "./Staff";
import { Modal } from "../components";
import { useStore, request, submitOnce, pendingOperation } from "../store";
import { itemInput, money } from "../domain";

const METHODS = [
  { value: "efectivo", label: "💵 Efectivo" },
  { value: "qr", label: "📱 QR / Mercado Pago" },
  { value: "tarjeta", label: "💳 Tarjeta" },
  { value: "transferencia", label: "🏦 Transferencia" },
];

export default function Counter({ nav }) {
  const s = useStore(),
    scope = "counter-" + s.user.id,
    pending = pendingOperation(scope);
  const draft = useDraft(s.user.id, "counter", () => restoreCart(pending, s.catalog), null);
  const { cart, setCart } = draft;
  const [discard, setDiscard] = useState(false);
  const [preparation, setPreparation] = useState(pending?.body.needsPreparation || false);
  const [quote, setQuote] = useState(pending ? Number(pending.body.expectedBalance) : null);

  const initialIsSplit = Boolean(
    pending?.body.splits && pending.body.splits.length > 1
  );
  const [isSplit, setIsSplit] = useState(initialIsSplit);

  // Single payment state
  const [method, setMethod] = useState(pending?.body.method || "efectivo");
  const [received, setReceived] = useState(pending?.body.received ?? "");

  // Split payment state
  const [splits, setSplits] = useState(() => {
    if (pending?.body.splits && pending.body.splits.length > 0) {
      return pending.body.splits.map((sp, idx) => ({
        id: idx + 1,
        method: sp.method || "efectivo",
        amount: sp.amount !== undefined ? String(sp.amount) : "",
        received:
          sp.received !== undefined && sp.received !== null
            ? String(sp.received)
            : "",
      }));
    }
    return [
      { id: 1, method: "efectivo", amount: "", received: "" },
      { id: 2, method: "qr", amount: "", received: "" },
    ];
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  // Single validation
  const singleInvalid =
    method === "efectivo" &&
    received !== "" &&
    (!Number.isFinite(Number(received)) || Number(received) < (quote || 0));

  // Split validation & remainder
  const splitTotalAssigned = splits.reduce((acc, row) => {
    const val = Number(row.amount);
    return acc + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);

  const remainder = Math.round(((quote || 0) - splitTotalAssigned) * 100) / 100;

  const splitInvalid =
    isSplit &&
    (splits.length < 2 ||
      splits.some(
        (sp) => !Number.isFinite(Number(sp.amount)) || Number(sp.amount) <= 0
      ) ||
      Math.abs(remainder) > 0.01 ||
      splits.some(
        (sp) =>
          sp.method === "efectivo" &&
          sp.received !== "" &&
          (!Number.isFinite(Number(sp.received)) ||
            Number(sp.received) < Number(sp.amount))
      ));

  const totalSplitChange = splits.reduce((acc, sp) => {
    if (
      sp.method === "efectivo" &&
      sp.received !== "" &&
      Number(sp.received) >= Number(sp.amount)
    ) {
      return acc + (Number(sp.received) - Number(sp.amount));
    }
    return acc;
  }, 0);

  const invalid = isSplit ? splitInvalid : singleInvalid;

  function handleSplitChange(index, field, value) {
    setSplits((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function handleAssignRemaining(index) {
    if (remainder <= 0) return;
    setSplits((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const curr = Number(row.amount) || 0;
        const nextVal = Math.round((curr + remainder) * 100) / 100;
        return { ...row, amount: String(nextVal) };
      })
    );
  }

  function handleAddSplit() {
    setSplits((prev) => [
      ...prev,
      {
        id: Date.now(),
        method: "tarjeta",
        amount: remainder > 0 ? String(remainder) : "",
        received: "",
      },
    ]);
  }

  function handleRemoveSplit(index) {
    if (splits.length <= 2) return;
    setSplits((prev) => prev.filter((_, i) => i !== index));
  }

  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e.uncertain
          ? e.message
          : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <main className="staff-entry counter-entry">
      <button className="back" onClick={() => nav("/atencion")}>
        ← Volver al salón
      </button>
      <div className="intro">
        <span className="eyebrow">VENTA SIN MESA</span>
        <h1>Mostrador</h1>
        <p>Cada compra se registra por separado al confirmar el cobro.</p>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && quote === null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {draft.storageError && <p className="alert">{draft.storageError}</p>}
      {cart.length > 0 && !pending && (
        <p className="note">
          Borrador de Mostrador sin confirmar.{" "}
          <button
            disabled={busy || quote !== null}
            onClick={() => setDiscard(true)}
          >
            Descartar borrador
          </button>
        </p>
      )}
      {discard && (
        <Modal title="Descartar borrador" onClose={() => setDiscard(false)}>
          <p>¿Descartar esta compra sin guardar?</p>
          <button
            className="primary"
            onClick={() => {
              draft.clear();
              setDiscard(false);
            }}
          >
            Confirmar descarte
          </button>
        </Modal>
      )}
      <QuickEntry
        counter
        cart={cart}
        setCart={setCart}
        preparation={preparation}
        setPreparation={setPreparation}
        disabled={busy || !pending || !s.connected || quote !== null}
      />
      <button
        className="primary full"
        disabled={busy || !s.connected || (!pending && !cart.length)}
        onClick={() =>
          run(async () => {
            if (pending) {
              setQuote(Number(pending.body.expectedBalance));
              return;
            }
            const result = await request("/counter/quote", {
              method: "POST",
              body: {
                items: cart.map(itemInput),
              },
            });
            setQuote(Number(result.total));
          })
        }
      >
        {busy ? "Consultando total…" : pending ? "Reintentar cobro" : "Cobrar"}
      </button>

      {quote !== null && (
        <Modal
          title="Cobrar · Mostrador"
          onClose={() => {
            if (!busy) setQuote(null);
          }}
        >
          <div className="payment-total">
            Total a cobrar<strong>{money(quote)}</strong>
          </div>
          <p>
            {preparation
              ? "El pedido seguirá en mozas después de cobrar."
              : "La compra se registra como entregada."}
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {pending && !busy && (
            <p className="note">
              Reintentá la misma compra para confirmar si se guardó. No se duplicará.
            </p>
          )}

          <div className="payment-type-toggle">
            <button
              type="button"
              className={!isSplit ? "active" : ""}
              disabled={busy || !pending}
              onClick={() => setIsSplit(false)}
            >
              Pago único
            </button>
            <button
              type="button"
              className={isSplit ? "active" : ""}
              disabled={busy || !pending}
              onClick={() => setIsSplit(true)}
            >
              Pago dividido / mixto
            </button>
          </div>

          {!isSplit ? (
            <>
              <fieldset disabled={busy || !pending}>
                <legend>Medio de pago</legend>
                {METHODS.map((m) => (
                  <label key={m.value} className="option">
                    <input
                      type="radio"
                      name="counter-method"
                      checked={method === m.value}
                      onChange={() => setMethod(m.value)}
                    />
                    {m.label}
                  </label>
                ))}
              </fieldset>
              {method === "efectivo" && (
                <label>
                  Dinero recibido (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={received}
                    disabled={busy || !pending}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="Importe en pesos"
                  />
                  {received !== "" && (
                    <span style={{ display: "block", marginTop: 4 }}>
                      {singleInvalid
                        ? "El importe no alcanza."
                        : "Vuelto: " + money(Number(received) - quote)}
                    </span>
                  )}
                </label>
              )}
            </>
          ) : (
            <>
              <div className="split-list">
                {splits.map((row, index) => {
                  const rowReceivedDiff =
                    row.method === "efectivo" &&
                    row.received !== "" &&
                    Number(row.received) >= Number(row.amount)
                      ? Number(row.received) - Number(row.amount)
                      : null;
                  return (
                    <div className="split-item" key={row.id}>
                      <div className="split-header">
                        <strong>Medio {index + 1}</strong>
                        {splits.length > 2 && (
                          <button
                            type="button"
                            className="split-remove"
                            title="Eliminar este medio"
                            disabled={busy || !pending}
                            onClick={() => handleRemoveSplit(index)}
                          >
                            ✕ Quitar
                          </button>
                        )}
                      </div>
                      <div className="split-fields">
                        <label>
                          Forma de pago
                          <select
                            disabled={busy || !pending}
                            value={row.method}
                            onChange={(e) =>
                              handleSplitChange(index, "method", e.target.value)
                            }
                          >
                            {METHODS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Importe
                          <div className="split-amount-wrap">
                            <input
                              disabled={busy || !pending}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="$0.00"
                              value={row.amount}
                              onChange={(e) =>
                                handleSplitChange(index, "amount", e.target.value)
                              }
                            />
                            {remainder > 0 && (
                              <button
                                type="button"
                                className="split-remainder-btn"
                                disabled={busy || !pending}
                                onClick={() => handleAssignRemaining(index)}
                                title="Asignar el saldo restante a este medio"
                              >
                                +Restante
                              </button>
                            )}
                          </div>
                        </label>
                      </div>
                      {row.method === "efectivo" && (
                        <div style={{ marginTop: 6 }}>
                          <label>
                            Recibido en efectivo (opcional)
                            <input
                              disabled={busy || !pending}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Monto entregado"
                              value={row.received}
                              onChange={(e) =>
                                handleSplitChange(index, "received", e.target.value)
                              }
                            />
                          </label>
                          {rowReceivedDiff !== null && (
                            <small
                              className="success"
                              style={{ display: "block", marginTop: 2 }}
                            >
                              Vuelto de esta parte: {money(rowReceivedDiff)}
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="add-split-btn"
                disabled={busy || !pending}
                onClick={handleAddSplit}
              >
                ＋ Agregar otro medio de pago
              </button>

              <div className="split-summary-box">
                <div className="split-summary-row">
                  <span>Total compra:</span>
                  <strong>{money(quote)}</strong>
                </div>
                <div className="split-summary-row">
                  <span>Total asignado:</span>
                  <strong>{money(splitTotalAssigned)}</strong>
                </div>
                <div className="split-summary-row">
                  <span>Diferencia restante:</span>
                  <span
                    className={
                      Math.abs(remainder) <= 0.01 ? "split-exact" : "split-diff"
                    }
                  >
                    {Math.abs(remainder) <= 0.01
                      ? "✓ Cuenta cubierta exacta"
                      : remainder > 0
                      ? "Falta asignar " + money(remainder)
                      : "Supera el total por " + money(Math.abs(remainder))}
                  </span>
                </div>
                {totalSplitChange > 0 && (
                  <div className="split-summary-row" style={{ marginTop: 4 }}>
                    <span>Vuelto total efectivo:</span>
                    <strong className="success">{money(totalSplitChange)}</strong>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            className="primary full"
            disabled={busy || !s.connected || (!pending && invalid)}
            onClick={() =>
              run(async () => {
                let payload;
                if (isSplit) {
                  payload = {
                    items: cart.map(itemInput),
                    needsPreparation: preparation,
                    method: "mixto",
                    expectedBalance: quote,
                    splits: splits.map((sp) => ({
                      method: sp.method,
                      amount: Number(sp.amount),
                      received:
                        sp.method === "efectivo" && sp.received !== ""
                          ? Number(sp.received)
                          : null,
                    })),
                  };
                } else {
                  payload = {
                    items: cart.map(itemInput),
                    needsPreparation: preparation,
                    method,
                    received:
                      method === "efectivo" && received !== ""
                        ? Number(received)
                        : null,
                    expectedBalance: quote,
                  };
                }

                const result = await submitOnce(
                  scope,
                  "/counter/checkout",
                  payload
                );
                draft.clear();
                setPreparation(false);
                setQuote(null);
                setReceived("");
                setMethod("efectivo");
                setMessage(
                  "Compra de " +
                    money(result.total) +
                    " cobrada. Mostrador está listo para la próxima compra."
                );
              })
            }
          >
            {busy
              ? "Guardando…"
              : pending
              ? "Reintentar la misma compra"
              : "Confirmar cobro"}
          </button>
        </Modal>
      )}
    </main>
  );
}
