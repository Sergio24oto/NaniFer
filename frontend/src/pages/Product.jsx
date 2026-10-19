import React, { useState } from "react";
import { Modal } from "../components";
import { money, estimate } from "../domain";
import { useStore } from "../store";

export default function Product({ product: initialProduct, onClose, onAdd, manual = false }) {
  const { catalog } = useStore();
  const p = catalog.products.find(x => x.id === initialProduct.id) || initialProduct;
  const [size, setSize] = useState(p.sizes?.find(s => s.available !== false)?.name || "");
  const [chosen, setChosen] = useState([]);
  const [extras, setExtras] = useState([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitFlavors, setUnitFlavors] = useState([""]);

  const max = p.sizes?.find((s) => s.name === size)?.max;
  const unit = estimate(p, size, extras);
  const toggle = (v, list, set) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const productFlavors = p.flavorOptions || [];
  const requiresFlavorOption = !manual && productFlavors.length > 0;
  const missingFlavorOption =
    requiresFlavorOption &&
    (unitFlavors.length < quantity ||
      unitFlavors.slice(0, quantity).some((fl) => !fl));

  const requiresIceCreamFlavors = !manual && !productFlavors.length && max;
  const missingIceCreamFlavors = requiresIceCreamFlavors && !chosen.length;

  const updateQuantity = (newQty) => {
    const q = Math.max(1, Math.min(99, newQty));
    setQuantity(q);
    setUnitFlavors((prev) => {
      const next = [...prev];
      while (next.length < q) {
        next.push("");
      }
      return next.slice(0, q);
    });
  };

  const selectUnitFlavor = (index, fl) => {
    setUnitFlavors((prev) => {
      const next = [...prev];
      next[index] = fl;
      return next;
    });
  };

  const copyFlavorToAll = (fl) => {
    if (!fl) return;
    setUnitFlavors(Array(quantity).fill(fl));
  };

  const firstMissingUnit = requiresFlavorOption
    ? unitFlavors.slice(0, quantity).findIndex((fl) => !fl)
    : -1;

  const isCombo = Boolean(p.comboConfig?.is_combo && p.comboConfig.steps?.length > 0);
  const comboSteps = isCombo ? p.comboConfig.steps : [];

  const [comboSelections, setComboSelections] = useState(() => {
    const init = {};
    for (const step of comboSteps) {
      if (step.type === 'multiple') {
        init[step.id] = [];
      } else {
        init[step.id] = step.options?.length === 1 ? step.options[0] : "";
      }
    }
    return init;
  });

  const selectComboSingle = (stepId, opt) => {
    setComboSelections(prev => ({
      ...prev,
      [stepId]: prev[stepId] === opt ? "" : opt
    }));
  };

  const toggleComboMultiple = (stepId, opt, max = 2) => {
    setComboSelections(prev => {
      const current = prev[stepId] || [];
      const count = current.filter(x => x === opt).length;
      if (current.length < max) {
        return { ...prev, [stepId]: [...current, opt] };
      } else {
        if (count > 0) {
          const idx = current.lastIndexOf(opt);
          const next = [...current];
          next.splice(idx, 1);
          return { ...prev, [stepId]: next };
        } else {
          const next = [...current.slice(1), opt];
          return { ...prev, [stepId]: next };
        }
      }
    });
  };

  const missingComboStep = isCombo && comboSteps.find(step => {
    if (!step.required) return false;
    const val = comboSelections[step.id];
    if (step.type === 'multiple') {
      const min = step.min || step.max || 1;
      return !val || val.length < min;
    }
    return !val || !val.trim();
  });

  const buttonText = () => {
    if (isCombo && missingComboStep) {
      if (missingComboStep.type === 'multiple') {
        const cur = (comboSelections[missingComboStep.id] || []).length;
        const min = missingComboStep.min || missingComboStep.max || 1;
        const rem = min - cur;
        return `${missingComboStep.title} (faltan ${rem}) · ${money(unit * quantity)}`;
      }
      return `${missingComboStep.title} · ${money(unit * quantity)}`;
    }
    if (missingFlavorOption) {
      if (quantity === 1) return `Elegí un sabor · ${money(unit * quantity)}`;
      const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];
      const ord = ordinals[firstMissingUnit] || `${firstMissingUnit + 1}ª`;
      return `Elegí el sabor de la ${ord} unidad · ${money(unit * quantity)}`;
    }
    if (missingIceCreamFlavors) {
      return `Elegí los sabores · ${money(unit * quantity)}`;
    }
    return `Agregar · ${money(unit * quantity)}`;
  };

  const handleAdd = () => {
    if (isCombo) {
      const summaryParts = [];
      for (const step of comboSteps) {
        const val = comboSelections[step.id];
        if (Array.isArray(val) && val.length > 0) {
          const counts = {};
          val.forEach(v => counts[v] = (counts[v] || 0) + 1);
          const str = Object.entries(counts).map(([k, c]) => c > 1 ? `${c}x ${k}` : k).join(', ');
          summaryParts.push(`${step.title}: ${str}`);
        } else if (val) {
          summaryParts.push(`${step.title}: ${val}`);
        }
      }
      const comboSummary = summaryParts.join(' · ');
      const finalNotes = [comboSummary, notes.trim()].filter(Boolean).join(' | ');

      onAdd({
        productId: p.id,
        name: p.name,
        size: "",
        flavors: [],
        extras: [],
        comboSelections,
        notes: finalNotes,
        quantity,
        unitPrice: unit,
      });
      return;
    }
    if (productFlavors.length > 0) {
      const chosenUnits = unitFlavors.slice(0, quantity);
      const counts = {};
      for (const fl of chosenUnits) {
        const k = fl || "";
        counts[k] = (counts[k] || 0) + 1;
      }
      const items = Object.entries(counts).map(([fl, qty]) => ({
        productId: p.id,
        name: p.name,
        size,
        flavors: fl ? [fl] : [],
        extras,
        notes,
        quantity: qty,
        unitPrice: unit,
      }));
      onAdd(items.length === 1 ? items[0] : items);
    } else {
      onAdd({
        productId: p.id,
        name: p.name,
        size,
        flavors: chosen,
        extras,
        notes,
        quantity,
        unitPrice: unit,
      });
    }
  };

  return (
    <Modal title={p.name} onClose={onClose}>
      {p.description && <p className="product-modal-desc">{p.description}</p>}

      {/* Selector de cantidad interactivo */}
      <div className="product-qty-row">
        <span className="product-qty-label">Cantidad:</span>
        <div className="product-stepper">
          <button
            type="button"
            className="stepper-btn"
            disabled={quantity <= 1}
            onClick={() => updateQuantity(quantity - 1)}
            aria-label="Disminuir cantidad"
          >
            −
          </button>
          <span className="stepper-val">{quantity}</span>
          <button
            type="button"
            className="stepper-btn"
            disabled={quantity >= 99}
            onClick={() => updateQuantity(quantity + 1)}
            aria-label="Aumentar cantidad"
          >
            +
          </button>
        </div>
      </div>

      {isCombo ? (
        <div className="combo-builder-container">
          {comboSteps.map((step, idx) => {
            const stepNum = idx + 1;
            const isMultiple = step.type === "multiple";
            const val = comboSelections[step.id];
            const max = step.max || 2;
            const min = step.min || max;
            const currentCount = isMultiple ? (val || []).length : (val ? 1 : 0);
            const isCompleted = isMultiple ? currentCount >= min : Boolean(val);

            return (
              <div
                key={step.id}
                className={`combo-step-card ${isCompleted ? "completed" : "active"}`}
              >
                <div className="combo-step-header">
                  <div className="combo-step-title-wrap">
                    <span className="combo-step-number">{stepNum}</span>
                    <strong className="combo-step-title">{step.title}</strong>
                  </div>
                  {isMultiple ? (
                    <span className={`combo-step-badge ${isCompleted ? "ready" : ""}`}>
                      {currentCount} / {max} {isCompleted ? "✓" : "elegidos"}
                    </span>
                  ) : val ? (
                    <span className="combo-step-badge ready">✓ {val}</span>
                  ) : (
                    <span className="combo-step-badge">Requerido</span>
                  )}
                </div>

                <div className="combo-options-grid">
                  {step.options?.map((opt) => {
                    const countInMultiple = isMultiple
                      ? (val || []).filter((x) => x === opt).length
                      : 0;
                    const isSelected = isMultiple ? countInMultiple > 0 : val === opt;

                    return (
                      <button
                        type="button"
                        key={opt}
                        className={`combo-option-chip ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          if (isMultiple) {
                            toggleComboMultiple(step.id, opt, max);
                          } else {
                            selectComboSingle(step.id, opt);
                          }
                        }}
                      >
                        <span>{opt}</span>
                        {isMultiple && countInMultiple > 0 && (
                          <span className="combo-option-count-badge">
                            {countInMultiple}
                          </span>
                        )}
                        {!isMultiple && isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {p.sizes?.length > 0 && (
            <fieldset>
              <legend>Presentación</legend>
              {p.sizes.map((z) => (
                <label className="option" key={z.name}>
                  <input
                    type="radio"
                    name="size"
                    checked={size === z.name}
                    disabled={z.available === false}
                    onChange={() => {
                      setSize(z.name);
                      setChosen([]);
                    }}
                  />
                  {z.name}{z.available === false ? " · Sin stock" : ""}
                  <span>
                    {z.salePrice != null
                      ? p.price != null && Number(z.salePrice) === Number(p.price)
                        ? "Incluido"
                        : p.price != null && Number(z.salePrice) > Number(p.price)
                        ? "+ " + money(Number(z.salePrice) - Number(p.price))
                        : money(z.salePrice)
                      : z.price
                      ? "+ " + money(z.price)
                      : "Incluido"}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {/* Selección de sabor / variedad para cada unidad si tiene opciones */}
          {productFlavors.length > 0 && (
            quantity === 1 ? (
              <fieldset className="product-flavor-fieldset">
                <legend>Sabor o variedad {manual ? "(opcional)" : "· Elegí 1"}</legend>
                {productFlavors.map((fl) => (
                  <label className="option" key={fl}>
                    <input
                      type="radio"
                      name="productFlavor_0"
                      checked={unitFlavors[0] === fl}
                      onChange={() => selectUnitFlavor(0, fl)}
                    />
                    {fl}
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="multi-flavor-container">
                <div className="multi-flavor-header">
                  <span>Sabores para las {quantity} unidades:</span>
                  {unitFlavors[0] && (
                    <button
                      type="button"
                      className="copy-flavor-btn"
                      onClick={() => copyFlavorToAll(unitFlavors[0])}
                      title={`Aplicar "${unitFlavors[0]}" a todas las unidades`}
                    >
                      Repetir "{unitFlavors[0]}" en todas
                    </button>
                  )}
                </div>

                {Array.from({ length: quantity }, (_, idx) => {
                  const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];
                  const ord = ordinals[idx] || `${idx + 1}ª`;
                  const title =
                    idx === 0
                      ? "1ª unidad: ¿Qué sabor querés?"
                      : `¿Y la ${ord} qué va a ser?`;

                  return (
                    <fieldset key={idx} className="product-flavor-fieldset unit-flavor-box">
                      <legend className="unit-flavor-title">
                        <span className="unit-badge">{ord}</span>
                        <strong>{title}</strong>
                        {unitFlavors[idx] && (
                          <span className="unit-selected-tag">✓ {unitFlavors[idx]}</span>
                        )}
                      </legend>
                      <div className="unit-flavor-options">
                        {productFlavors.map((fl) => (
                          <label
                            className={`option unit-flavor-opt ${unitFlavors[idx] === fl ? "selected" : ""}`}
                            key={fl}
                          >
                            <input
                              type="radio"
                              name={`productFlavor_${idx}`}
                              checked={unitFlavors[idx] === fl}
                              onChange={() => selectUnitFlavor(idx, fl)}
                            />
                            {fl}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )
          )}

          {!manual && !productFlavors.length && Boolean(max && max > 0) && (
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
        </>
      )}

      <label>
        Observaciones
        <textarea
          value={notes}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Por ejemplo: bien fría, vaso con hielo, etc."
        />
      </label>

      <button
        className="primary full"
        disabled={
          !p.available ||
          (isCombo && Boolean(missingComboStep)) ||
          (!isCombo && p.sizes?.length > 0 && !p.sizes.some(z => z.name === size && z.available !== false)) ||
          (!isCombo && missingIceCreamFlavors) ||
          (!isCombo && missingFlavorOption) ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 99
        }
        onClick={handleAdd}
      >
        {buttonText()}
      </button>
    </Modal>
  );
}
