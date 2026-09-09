import React, { useState, useRef } from "react";
import { Modal } from "../components";
import { useStore, submitOnce, pendingOperation } from "../store";
export default function Reservations({
  table,
  account,
  onClose
}) {
  const s = useStore();
  const [date, setDate] = useState(s.calendarToday);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [hour, setHour] = useState("18:00");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const scope = "reservations-" + table;
  const pending = pendingOperation(scope);
  const reservations = (s.reservations || []).filter(r => r.table === table);
  const selected = reservations.find(r => r.date === date && r.id !== editing?.id);
  async function run(path, body) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await submitOnce(scope, path, body);
      setEditing(null);
      setConfirm(null);
      setName("");
      setNote("");
      setMessage("Reserva guardada.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function edit(r) {
    setEditing(r);
    setDate(r.date);
    setName(r.name);
    setHour(r.time);
    setNote(r.note);
    setConfirm(null);
    setMessage("");
  }
  return <Modal title={"Reservas · Mesa " + table} onClose={onClose}>
    <p>Una reserva pendiente por mesa y fecha. La reserva no cambia la ocupación ni abre una cuenta.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {pending && <p className="note">Hay una operación sin confirmar. <button disabled={busy || !s.connected} onClick={() => run(pending.path, pending.body)}>Reintentar la misma operación</button></p>}
    <fieldset disabled={busy || !!pending || !s.connected}>
      <legend>{editing ? "Editar reserva" : "Nueva reserva"}</legend>
      <form onSubmit={e => {
        e.preventDefault();
        run(editing ? "/reservations/" + editing.id + "/edit" : "/tables/" + table + "/reservations", {
          name,
          date,
          time: hour,
          note,
          expectedVersion: editing?.version ?? null
        });
      }}>
        <label>Fecha de la reserva<input type="date" required value={date || ""} onInput={e => setDate(e.currentTarget.value)} /></label>
        <label>Nombre de la reserva<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Hora de Argentina<input type="time" required value={hour} onInput={e => setHour(e.currentTarget.value)} /></label>
        <details><summary>Nota opcional</summary><textarea aria-label="Nota de la reserva" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></details>
        {selected && <p className="note">Ya hay una reserva pendiente para esa fecha: {selected.name}, {selected.time}. Podés editarla abajo.</p>}
        <button className="primary" disabled={!name.trim() || !date || !hour || !!selected}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear reserva"}</button>
        {editing && <button type="button" className="secondary" onClick={() => {
          setEditing(null);
          setName("");
          setNote("");
        }}>Salir de la edición</button>}
      </form>
    </fieldset>
    <h3>Reservas pendientes de esta mesa</h3>
    {!reservations.length && <p>No hay reservas pendientes.</p>}
    {reservations.map(r => <article className="reservation-row" key={r.id}>
      <strong>{r.name} · {r.date.split("-").reverse().join("/")} · {r.time}</strong>
      {r.date < s.calendarToday && <small>Pendiente de una fecha anterior</small>}
      {r.note && <p>{r.note}</p>}
      <div className="row"><button className="secondary" disabled={busy || !!pending || !s.connected} onClick={() => setConfirm({
          r,
          action: "arrive",
          visit: account?.id || null
        })}>Llegó</button><button className="text-button" disabled={busy || !!pending || !s.connected} onClick={() => edit(r)}>Editar</button><button className="text-button" disabled={busy || !!pending || !s.connected} onClick={() => setConfirm({
          r,
          action: "cancel"
        })}>Cancelar reserva</button></div>
      {confirm?.r.id === r.id && <div className="note">
        <p>{confirm.action === "cancel" ? "¿Cancelar esta reserva? Se conservará en el historial." : confirm.visit ? "La mesa está ocupada. Vinculá la reserva solo si la visita activa corresponde a estos mismos clientes. No se cerrará ni reemplazará la cuenta." : "Se iniciará una visita para esta reserva, sin consumos."}</p>
        <button className="primary" disabled={busy || !!pending || !s.connected} onClick={() => run("/reservations/" + r.id + "/" + confirm.action, {
          expectedVersion: r.version,
          linkExisting: !!confirm.visit,
          expectedVisit: confirm.visit || null
        })}>{confirm.action === "cancel" ? "Confirmar cancelación" : confirm.visit ? "Vincular a esta visita" : "Confirmar llegada"}</button>
        <button className="secondary" onClick={() => setConfirm(null)}>Volver</button>
      </div>}
    </article>)}
  </Modal>;
}
