import React, { useRef, useState } from "react";
import { Modal } from "../components";
import { money } from "../domain";
import { useStore, submitOnce, pendingOperation, refresh } from "../store";
export default function Payment({ id, onClose, onSuccess }) {
  const s = useStore();
  const a = s.accounts.find((a) => a.id === id);
  const scope = "pay-" + id;
  const pending = pendingOperation(scope);
  const [method, setMethod] = useState(pending?.body.method || "efectivo");
  const [received, setReceived] = useState(pending?.body.received ?? "");
  const [quote, setQuote] = useState(
    pending?.body.expectedBalance ?? a?.balance ?? 0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const changed = quote !== a?.balance;
  const invalid =
    method === "efectivo" &&
    received !== "" &&
    (!Number.isFinite(Number(received)) || Number(received) < quote);
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitOnce(scope, "/visits/" + id + "/payments", {
        method,
        received:
          method === "efectivo" && received !== "" ? Number(received) : null,
        expectedBalance: quote,
      });
      onSuccess(result);
    } catch (e) {
      setError(e.message);
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title={"Cobrar · Mesa " + (a?.table || "cerrada")} onClose={onClose}>
      <p>Cobrar no entrega pedidos ni libera la mesa.</p>
      <div className="payment-total">
        Saldo a cobrar<strong>{money(quote)}</strong>
      </div>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {pending ? (
        <p className="note">
          Cobro pendiente de confirmación. Reintentá la misma operación; se
          recuperará el comprobante si ya se guardó.
        </p>
      ) : (
        changed && (
          <p className="note">
            El saldo cambió a {money(a?.balance)}.{" "}
            <button onClick={() => setQuote(a?.balance || 0)}>
              Revisar nuevo importe
            </button>
          </p>
        )
      )}
      <fieldset disabled={busy || !!pending}>
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
            <p className={invalid ? "note" : "success"}>
              {invalid
                ? "El importe no alcanza."
                : "Vuelto: " + money(Number(received) - quote)}
            </p>
          )}
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
          ? "Confirmando…"
          : pending
            ? "Reintentar cobro"
            : "Confirmar cobro"}
      </button>
      <small>
        El pago se registra en MySQL. No procesa pagos electrónicos.
      </small>
    </Modal>
  );
}
