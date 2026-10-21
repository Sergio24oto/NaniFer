import React, { useRef, useState } from "react";
import { Modal } from "../components";
import { money, tableLabel } from "../domain";
import { useStore, submitOnce, pendingOperation, refresh } from "../store";

const METHODS = [
  { value: "efectivo", label: "💵 Efectivo" },
  { value: "qr", label: "📱 QR / Mercado Pago" },
  { value: "tarjeta", label: "💳 Tarjeta" },
  { value: "transferencia", label: "🏦 Transferencia" },
];

export default function Payment({ id, onClose, onSuccess }) {
  const s = useStore();
  const a = s.accounts.find((a) => a.id === id);
  const scope = "pay-" + id;
  const pending = pendingOperation(scope);

  const initialIsSplit = Boolean(
    pending?.body.splits && pending.body.splits.length > 1
  );
  const [isSplit, setIsSplit] = useState(initialIsSplit);

  // Single payment state
  const [method, setMethod] = useState(pending?.body.method || "efectivo");
  const [received, setReceived] = useState(pending?.body.received ?? "");
  const [quote, setQuote] = useState(
    pending?.body.expectedBalance ?? a?.balance ?? 0
  );

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
  const lock = useRef(false);
  const changed = quote !== a?.balance;

  // Single payment validation
  const singleInvalid =
    method === "efectivo" &&
    received !== "" &&
    (!Number.isFinite(Number(received)) || Number(received) < quote);

  // Split payment calculations & validation
  const splitTotalAssigned = splits.reduce((acc, row) => {
    const val = Number(row.amount);
    return acc + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);

  const remainder = Math.round((quote - splitTotalAssigned) * 100) / 100;

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

  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let payload;
      if (isSplit) {
        payload = {
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
          method,
          received:
            method === "efectivo" && received !== "" ? Number(received) : null,
          expectedBalance: quote,
        };
      }

      const result = await submitOnce(
        scope,
        "/visits/" + id + "/payments",
        payload
      );
      onSuccess(result);
    } catch (e) {
      setError(
        e.uncertain
          ? e.message
          : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message
      );
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={"Cobrar · " + (a?.table != null ? tableLabel(s, a.table) : "cerrada")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>Cobrar no entrega pedidos ni libera la mesa.</p>
      <div className="payment-total">
        Saldo a cobrar<strong>{money(quote)}</strong>
      </div>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {pending && !busy ? (
        <p className="note">
          Cobro pendiente de confirmación. Reintentá la misma operación; se
          recuperará el comprobante si ya se guardó.
        </p>
      ) : (
        !busy &&
        !pending &&
        changed && (
          <p className="note">
            El saldo cambió a {money(a?.balance)}.{" "}
            <button onClick={() => setQuote(a?.balance || 0)}>
              Revisar nuevo importe
            </button>
          </p>
        )
      )}

      <div className="payment-type-toggle">
        <button
          type="button"
          className={!isSplit ? "active" : ""}
          disabled={busy || !!pending}
          onClick={() => setIsSplit(false)}
        >
          Pago único
        </button>
        <button
          type="button"
          className={isSplit ? "active" : ""}
          disabled={busy || !!pending}
          onClick={() => setIsSplit(true)}
        >
          Pago dividido / mixto
        </button>
      </div>

      {!isSplit ? (
        <>
          <fieldset disabled={busy || !!pending}>
            <legend>Medio de pago</legend>
            {METHODS.map((m) => (
              <label className="option" key={m.value}>
                <input
                  type="radio"
                  name="method"
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
          {method === "efectivo" && (
            <>
              <label>
                Dinero recibido (opcional)
                <input
                  disabled={busy || !!pending}
                  type="number"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="Importe en pesos"
                />
              </label>
              {received !== "" && (
                <p className={singleInvalid ? "note" : "success"}>
                  {singleInvalid
                    ? "El importe no alcanza."
                    : "Vuelto: " + money(Number(received) - quote)}
                </p>
              )}
            </>
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
                        disabled={busy || !!pending}
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
                        disabled={busy || !!pending}
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
                          disabled={busy || !!pending}
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
                            disabled={busy || !!pending}
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
                          disabled={busy || !!pending}
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
                        <small className="success" style={{ display: "block", marginTop: 2 }}>
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
            disabled={busy || !!pending}
            onClick={handleAddSplit}
          >
            ＋ Agregar otro medio de pago
          </button>

          <div className="split-summary-box">
            <div className="split-summary-row">
              <span>Total cuenta:</span>
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
        disabled={
          busy ||
          !s.connected ||
          (!pending && (invalid || changed || !a || quote <= 0))
        }
        onClick={confirm}
      >
        {busy
          ? "Guardando…"
          : pending
          ? "Reintentar de forma segura"
          : "Confirmar cobro"}
      </button>
      <small>
        El pago se registra en el sistema. No procesa cobros electrónicos en línea.
      </small>
    </Modal>
  );
}
