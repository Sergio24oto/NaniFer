import React, { useState, useRef } from "react";
import { Modal, Badge } from "../components";
import { money, estimate } from "../domain";
import { useStore } from "../store";
export default function Product({ product: p, onClose, onAdd }) {
  const { catalog } = useStore();
  const [size, setSize] = useState(p.sizes?.[0]?.name || "");
  const [chosen, setChosen] = useState([]);
  const [extras, setExtras] = useState([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const max = p.sizes?.find((s) => s.name === size)?.max;
  const unit = estimate(p, size, extras);
  const toggle = (v, list, set) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Modal title={p.name} onClose={onClose}>
      <p>{p.description}</p>
      {p.sizes?.length > 0 && (
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
          {catalog.flavors.map((f) => (
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
      {p.extras?.length > 0 && (
        <fieldset>
          <legend>Extras opcionales</legend>
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
          value={notes}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Por ejemplo: sin azúcar…"
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
          onAdd({
            productId: p.id,
            name: p.name,
            size,
            flavors: chosen,
            extras,
            notes,
            quantity,
            unitPrice: unit,
          })
        }
      >
        Agregar · {money(unit * quantity)}
      </button>
    </Modal>
  );
}
