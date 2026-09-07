import React, { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { money } from "./domain";
export function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Cerrar" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Items({ items }) {
  return (
    <div className="items">
      {items.map((i, k) => (
        <div className="item" key={k}>
          <b className="qty">{i.quantity}×</b>
          <div className="grow">
            <strong>{i.name}</strong>
            <small>
              {[i.size, ...(i.flavors || []), ...(i.extras || [])]
                .filter(Boolean)
                .join(" · ")}
            </small>
            {i.notes && <p className="note">“{i.notes}”</p>}
          </div>
          <span>{money(i.quantity * i.unitPrice)}</span>
        </div>
      ))}
    </div>
  );
}
