import React, { useRef, useState } from "react";
import {useDraft} from "../useDraft";
import QuickEntry from "./QuickEntry";
import { restoreCart } from "./Staff";
import { Modal } from "../components";
import { useStore, request, submitOnce, pendingOperation } from "../store";
import { itemInput, money } from "../domain";
export default function Counter({
  nav
}) {
  const s = useStore(),
    scope = "counter-" + s.user.id,
    pending = pendingOperation(scope);
  const draft=useDraft(s.user.id,"counter",()=>restoreCart(pending,s.catalog),null);
  const {cart,setCart}=draft;
  const [discard,setDiscard]=useState(false);
  const [preparation, setPreparation] = useState(pending?.body.needsPreparation || false);
  const [quote, setQuote] = useState(pending ? Number(pending.body.expectedBalance) : null);
  const [method, setMethod] = useState(pending?.body.method || "efectivo"),
    [received, setReceived] = useState(pending?.body.received ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const invalid = method === "efectivo" && received !== "" && (!Number.isFinite(Number(received)) || Number(received) < quote);
  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return <main className="staff-entry counter-entry"><button className="back" onClick={() => nav("/atencion")}>← Volver al salón</button><div className="intro"><span className="eyebrow">VENTA SIN MESA</span><h1>Mostrador</h1><p>Cada compra se registra por separado al confirmar el cobro.</p></div>
    {message && <p className="success" role="status">{message}</p>}{error && quote === null && <p className="alert" role="alert">{error}</p>}
    {draft.storageError&&<p className="alert">{draft.storageError}</p>}
    {cart.length>0&&!pending&&<p className="note">Borrador de Mostrador sin confirmar. <button disabled={busy||quote!==null} onClick={()=>setDiscard(true)}>Descartar borrador</button></p>}
    {discard&&<Modal title="Descartar borrador" onClose={()=>setDiscard(false)}><p>¿Descartar esta compra sin guardar?</p><button className="primary" onClick={()=>{draft.clear();setDiscard(false);}}>Confirmar descarte</button></Modal>}
    <QuickEntry counter cart={cart} setCart={setCart} preparation={preparation} setPreparation={setPreparation} disabled={busy || !!pending || !s.connected || quote !== null} />
    <button className="primary full" disabled={busy || !s.connected || !pending && !cart.length} onClick={() => run(async () => {
      if (pending) {
        setQuote(Number(pending.body.expectedBalance));
        return;
      }
      const result = await request("/counter/quote", {
        method: "POST",
        body: {
          items: cart.map(itemInput)
        }
      });
      setQuote(Number(result.total));
    })}>{busy ? "Consultando total…" : pending ? "Reintentar cobro" : "Cobrar"}</button>
    {quote !== null && <Modal title="Cobrar · Mostrador" onClose={() => {
      if (!busy) setQuote(null);
    }}>
      <div className="payment-total">Total a cobrar<strong>{money(quote)}</strong></div>
      <p>{preparation ? "El pedido seguirá en mozas después de cobrar." : "La compra se registra como entregada."}</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {pending && !busy && <p className="note">Reintentá la misma compra para confirmar si se guardó. No se duplicará.</p>}
      <fieldset disabled={busy || !!pending}><legend>Medio de pago</legend>{["efectivo", "tarjeta", "transferencia"].map(m => <label key={m} className="option"><input type="radio" name="counter-method" checked={method === m} onChange={() => setMethod(m)} />{m}</label>)}</fieldset>
      {method === "efectivo" && <label>Dinero recibido (opcional)<input type="number" min="0" step="0.01" value={received} disabled={busy || !!pending} onChange={e => setReceived(e.target.value)} />{received !== "" && <span>{invalid ? "El importe no alcanza." : "Vuelto: " + money(Number(received) - quote)}</span>}</label>}
      <button className="primary full" disabled={busy || !s.connected || !pending && invalid} onClick={() => run(async () => {
        const result = await submitOnce(scope, "/counter/checkout", {
          items: cart.map(itemInput),
          needsPreparation: preparation,
          method,
          received: method === "efectivo" && received !== "" ? Number(received) : null,
          expectedBalance: quote
        });
        draft.clear();
        setPreparation(false);
        setQuote(null);
        setReceived("");
        setMethod("efectivo");
        setMessage("Compra de " + money(result.total) + " cobrada. Mostrador está listo para la próxima compra.");
      })}>{busy ? "Guardando…" : pending ? "Reintentar la misma compra" : "Confirmar cobro"}</button>
    </Modal>}
  </main>;
}
