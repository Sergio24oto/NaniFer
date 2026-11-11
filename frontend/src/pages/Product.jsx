import React, { useState } from "react";
import { Modal } from "../components";
import { money, estimate } from "../domain";
import { useStore } from "../store";

export function isCoffeeOption(optionName) {
  if (!optionName) return false;
  const n = String(optionName).toLowerCase();
  if (
    n.includes("té") ||
    n.includes("te") ||
    n.includes("mate") ||
    n.includes("jugo") ||
    n.includes("chocolatada")
  ) {
    return false;
  }
  return (
    n.includes("caf") ||
    n.includes("cortado") ||
    n.includes("leche") ||
    n.includes("lágrima") ||
    n.includes("lagrima") ||
    n.includes("jarrito") ||
    n.includes("capuchino") ||
    n.includes("submarino") ||
    n.includes("expreso") ||
    n.includes("espresso") ||
    n.includes("americano")
  );
}

export default function Product({ product: initialProduct, onClose, onAdd, manual = false }) {
  const { catalog } = useStore();
  const p = catalog.products.find(x => x.id === initialProduct.id) || initialProduct;
  const defaultSize =
    p.sizes?.find(s => s.available !== false && s.isDefault)?.name ||
    p.sizes?.find(s => s.available !== false && (s.name.toLowerCase().includes("entera") || (p.price != null && Number(s.salePrice) === Number(p.price))))?.name ||
    p.sizes?.find(s => s.available !== false)?.name ||
    p.sizes?.[0]?.name ||
    "";
  const [size, setSize] = useState(defaultSize);
  const [chosen, setChosen] = useState([]);
  const [extras, setExtras] = useState([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [flavorCounts, setFlavorCounts] = useState({});

  const isCombo = Boolean(p.comboConfig?.is_combo && p.comboConfig.steps?.length > 0);
  const comboSteps = isCombo ? p.comboConfig.steps : [];

  const upgradeConfig = p.comboConfig?.upgradeCoffee || {
    enabled: true,
    price: 500,
    label: "Café Grande",
  };
  const isCoffeeUpgradeEnabled = Boolean(isCombo && upgradeConfig.enabled !== false);
  const coffeeUpgradePrice = Number(upgradeConfig.price) || 500;
  const coffeeUpgradeLabel = (upgradeConfig.label || "Café Grande").trim();

  const [upgradeCoffee, setUpgradeCoffee] = useState(false);

  const selectedSizeObj = p.sizes?.find((s) => s.name === size);
  const max = selectedSizeObj?.max;
  const comboCoffeeExtra = (isCombo && upgradeCoffee && isCoffeeUpgradeEnabled) ? coffeeUpgradePrice : 0;
  const unit = estimate(p, size, extras) + comboCoffeeExtra;
  const toggle = (v, list, set) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const productFlavors = p.flavorOptions || [];
  const requiresFlavorOption = !manual && productFlavors.length > 0;

  // Helper para detectar si la presentación elegida es un pack (ej: docena = 12, media docena = 6)
  const getPackUnits = (sizeObj) => {
    if (!sizeObj) return 1;
    if (sizeObj.max != null && Number(sizeObj.max) > 0) {
      return Number(sizeObj.max);
    }
    const sName = (sizeObj.name || "").toLowerCase();
    if (
      sName.includes("media docena") ||
      sName.includes("1/2 docena") ||
      sName.includes("1/2docena") ||
      sName.includes("6 u") ||
      sName.includes("6u")
    ) {
      return 6;
    }
    if (sName.includes("docena") || sName.includes("12 u") || sName.includes("12u")) {
      return 12;
    }
    const match = sName.match(/(\d+)\s*(u|un|unid|unidades)\b/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > 1) return n;
    }
    return 1;
  };

  const unitsPerPack = getPackUnits(selectedSizeObj);
  const isPack = unitsPerPack > 1;
  const totalUnitsNeeded = isPack ? unitsPerPack * quantity : quantity;
  const totalSelectedFlavors = Object.values(flavorCounts).reduce((a, b) => a + (b || 0), 0);

  const missingFlavorOption =
    requiresFlavorOption && totalSelectedFlavors < totalUnitsNeeded;

  const requiresIceCreamFlavors = !manual && !productFlavors.length && max;
  const missingIceCreamFlavors = requiresIceCreamFlavors && !chosen.length;

  const updateQuantity = (newQty) => {
    const q = Math.max(1, Math.min(99, newQty));
    setQuantity(q);
    const newNeeded = isPack ? unitsPerPack * q : q;
    if (totalSelectedFlavors > newNeeded) {
      setFlavorCounts({});
    }
  };

  const isMultiSize = Boolean(
    p.sizes &&
    p.sizes.length > 1 &&
    !isCombo &&
    !requiresFlavorOption &&
    !Boolean(!manual && !productFlavors.length && p.sizes.some(s => s.max && s.max > 0))
  );

  const [sizeCounts, setSizeCounts] = useState(() => {
    const init = {};
    if (p.sizes && p.sizes.length > 1) {
      p.sizes.forEach(s => {
        init[s.name] = (s.name === defaultSize) ? 1 : 0;
      });
    }
    return init;
  });

  const updateSizeCount = (sizeName, newCount) => {
    const c = Math.max(0, Math.min(99, newCount));
    setSizeCounts(prev => ({
      ...prev,
      [sizeName]: c
    }));
  };

  const totalMultiUnits = isMultiSize
    ? Object.values(sizeCounts).reduce((a, b) => a + (b || 0), 0)
    : quantity;

  const totalMultiPrice = isMultiSize
    ? Object.entries(sizeCounts).reduce(
        (sum, [sz, cnt]) => sum + (cnt || 0) * estimate(p, sz, extras),
        0
      )
    : unit * quantity;

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
    const isDeselecting = comboSelections[stepId] === opt;
    const nextVal = isDeselecting ? "" : opt;
    setComboSelections(prev => ({
      ...prev,
      [stepId]: nextVal
    }));
    if (!isCoffeeOption(nextVal)) {
      setUpgradeCoffee(false);
    }
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
    if (isMultiSize) {
      if (totalMultiUnits === 0) {
        return `Elegí al menos un tamaño · $0`;
      }
      return `Agregar ${totalMultiUnits} ${totalMultiUnits === 1 ? "unidad" : "unidades"} · ${money(totalMultiPrice)}`;
    }
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
      const remaining = totalUnitsNeeded - totalSelectedFlavors;
      if (totalUnitsNeeded === 1) {
        return `Elegí un sabor · ${money(unit * quantity)}`;
      }
      const isEmpanada = (p.name || "").toLowerCase().includes("empanada");
      const unitWord = isEmpanada ? "empanada" : "unidad";
      const pluralWord = isEmpanada ? "empanadas" : "unidades";
      return `Faltan ${remaining} ${remaining === 1 ? unitWord : pluralWord} · ${money(unit * quantity)}`;
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
          const isCoffee = isCoffeeOption(val);
          const displayVal = (isCoffee && upgradeCoffee && isCoffeeUpgradeEnabled)
            ? `${val} (GRANDE)`
            : val;
          summaryParts.push(`${step.title}: ${displayVal}`);
        }
      }
      const comboSummary = summaryParts.join(' · ');
      const finalNotes = [comboSummary, notes.trim()].filter(Boolean).join(' | ');

      const comboExtras = (upgradeCoffee && isCoffeeUpgradeEnabled)
        ? [`${coffeeUpgradeLabel} (+${money(coffeeUpgradePrice)})`]
        : [];

      onAdd({
        productId: p.id,
        name: p.name,
        size: defaultSize || p.sizes?.[0]?.name || "",
        flavors: [],
        extras: comboExtras,
        comboSelections,
        upgradeCoffee: upgradeCoffee && isCoffeeUpgradeEnabled,
        notes: finalNotes,
        quantity,
        unitPrice: unit,
      });
      return;
    }

    if (isMultiSize) {
      const items = Object.entries(sizeCounts)
        .filter(([_, count]) => count > 0)
        .map(([szName, count]) => ({
          productId: p.id,
          name: p.name,
          size: szName,
          flavors: chosen,
          extras,
          notes,
          quantity: count,
          unitPrice: estimate(p, szName, extras),
        }));
      if (items.length === 1) {
        onAdd(items[0]);
      } else if (items.length > 1) {
        onAdd(items);
      }
      return;
    }

    if (productFlavors.length > 0) {
      if (isPack) {
        const flavorBreakdown = Object.entries(flavorCounts)
          .filter(([_, count]) => count > 0)
          .map(([fl, count]) => (count > 1 ? `${count}x ${fl}` : fl));

        onAdd({
          productId: p.id,
          name: p.name,
          size: selectedSizeObj?.name || size,
          flavors: flavorBreakdown,
          extras,
          notes,
          quantity,
          unitPrice: unit,
        });
      } else {
        const items = Object.entries(flavorCounts)
          .filter(([_, count]) => count > 0)
          .map(([fl, count]) => ({
            productId: p.id,
            name: p.name,
            size,
            flavors: [fl],
            extras,
            notes,
            quantity: count,
            unitPrice: unit,
          }));

        if (items.length === 1) {
          onAdd(items[0]);
        } else if (items.length > 1) {
          onAdd(items);
        }
      }
      return;
    }

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
  };

  return (
    <Modal title={p.name} onClose={onClose}>
      {p.description && <p className="product-modal-desc">{p.description}</p>}

      {/* Selector de cantidad interactivo */}
      {!isMultiSize && (
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
      )}

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

                {isCoffeeUpgradeEnabled && !isMultiple && isCoffeeOption(val) && (
                  <div className="combo-coffee-upgrade-card">
                    <div className="combo-coffee-upgrade-left">
                      <span className="coffee-upgrade-icon">☕✨</span>
                      <div className="coffee-upgrade-texts">
                        <strong>¿Agrandar a Café Grande?</strong>
                        <small>
                          El combo incluye tamaño mediano. Agrandalo por +{money(coffeeUpgradePrice)}.
                        </small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`combo-coffee-upgrade-btn ${upgradeCoffee ? "active" : ""}`}
                      onClick={() => setUpgradeCoffee(!upgradeCoffee)}
                    >
                      {upgradeCoffee ? "✓ Grande sumado" : `+ Agrandar (+${money(coffeeUpgradePrice)})`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {p.sizes?.length > 0 && (
            isMultiSize ? (
              <fieldset className="product-sizes-fieldset">
                <legend>Presentación · Elegí la cantidad de cada tamaño</legend>
                <div className="size-stepper-list">
                  {p.sizes.map((z) => {
                    const count = sizeCounts[z.name] || 0;
                    const variantPrice =
                      z.salePrice != null && z.salePrice !== ""
                        ? z.salePrice
                        : z.price != null && p.price != null
                        ? Number(p.price) + Number(z.price)
                        : z.price != null
                        ? z.price
                        : p.price;

                    return (
                      <div
                        key={z.name}
                        className={`size-stepper-row ${count > 0 ? "active" : ""}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          marginBottom: 8,
                          borderRadius: 10,
                          background: count > 0 ? "#fdf7f2" : "#fbf9f6",
                          border: count > 0 ? "1.5px solid #d97706" : "1px solid #e2d7c9"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: 15, color: "#24140b" }}>{z.name}</strong>
                          <span style={{ fontSize: 13, color: "#716055" }}>
                            {variantPrice != null ? money(variantPrice) : ""}
                            {z.available === false ? " · Sin stock" : ""}
                          </span>
                        </div>
                        <div className="product-stepper" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={count <= 0}
                            onClick={() => updateSizeCount(z.name, count - 1)}
                            aria-label={`Disminuir ${z.name}`}
                            style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#ffffff", fontSize: 18, cursor: count <= 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            −
                          </button>
                          <span className="stepper-val" style={{ minWidth: 28, textAlign: "center", fontWeight: 800, fontSize: 16 }}>
                            {count}
                          </span>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={z.available === false || count >= 99}
                            onClick={() => updateSizeCount(z.name, count + 1)}
                            aria-label={`Aumentar ${z.name}`}
                            style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#ffffff", fontSize: 18, cursor: z.available === false ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
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
                        setFlavorCounts({});
                      }}
                    />
                    {z.name}{z.available === false ? " · Sin stock" : ""}
                    <span>
                      <strong>
                        {(() => {
                          const variantPrice =
                            z.salePrice != null && z.salePrice !== ""
                              ? z.salePrice
                              : z.price != null && p.price != null
                              ? Number(p.price) + Number(z.price)
                              : z.price != null
                              ? z.price
                              : p.price;
                          return variantPrice != null ? money(variantPrice) : "";
                        })()}
                      </strong>
                    </span>
                  </label>
                ))}
              </fieldset>
            )
          )}

          {/* Selección de sabor / variedad con panel de surtido interactivo */}
          {productFlavors.length > 0 && (
            totalUnitsNeeded === 1 ? (
              <fieldset className="product-flavor-fieldset">
                <legend>Sabor o variedad {manual ? "(opcional)" : "· Elegí 1"}</legend>
                {productFlavors.map((fl) => (
                  <label className="option" key={fl}>
                    <input
                      type="radio"
                      name="productFlavor_single"
                      checked={(flavorCounts[fl] || 0) === 1}
                      onChange={() => setFlavorCounts({ [fl]: 1 })}
                    />
                    {fl}
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="flavor-assortment-container">
                <div className="flavor-assortment-header">
                  <span className="flavor-assortment-title">
                    🥟 Sabores ({totalUnitsNeeded} {totalUnitsNeeded === 1 ? "unidad" : "unidades"}):
                  </span>
                  <span className={`flavor-assortment-badge ${totalSelectedFlavors === totalUnitsNeeded ? "ready" : ""}`}>
                    {totalSelectedFlavors} / {totalUnitsNeeded} {totalSelectedFlavors === totalUnitsNeeded ? "✓" : "elegidas"}
                  </span>
                </div>

                {/* Acciones rápidas: Todas de un sabor o Limpiar */}
                <div className="flavor-assortment-quick-actions">
                  <span className="quick-action-label">⚡ Todas de:</span>
                  {productFlavors.slice(0, 5).map((fl) => (
                    <button
                      type="button"
                      key={fl}
                      className="quick-all-btn"
                      onClick={() => setFlavorCounts({ [fl]: totalUnitsNeeded })}
                      title={`Elegir todas de ${fl}`}
                    >
                      {fl}
                    </button>
                  ))}
                  {totalSelectedFlavors > 0 && (
                    <button
                      type="button"
                      className="quick-clear-btn"
                      onClick={() => setFlavorCounts({})}
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Lista interactiva con [+] y [-] por sabor */}
                <div className="flavor-stepper-list">
                  {productFlavors.map((fl) => {
                    const count = flavorCounts[fl] || 0;
                    const canIncrease = totalSelectedFlavors < totalUnitsNeeded;
                    const canDecrease = count > 0;

                    return (
                      <div key={fl} className={`flavor-stepper-row ${count > 0 ? "active" : ""}`}>
                        <span className="flavor-stepper-name">{fl}</span>
                        <div className="flavor-stepper-controls">
                          <button
                            type="button"
                            className="flavor-stepper-btn"
                            disabled={!canDecrease}
                            onClick={() => {
                              if (!canDecrease) return;
                              setFlavorCounts((prev) => {
                                const nextCount = (prev[fl] || 0) - 1;
                                if (nextCount <= 0) {
                                  const copy = { ...prev };
                                  delete copy[fl];
                                  return copy;
                                }
                                return { ...prev, [fl]: nextCount };
                              });
                            }}
                            aria-label={`Quitar 1 ${fl}`}
                          >
                            −
                          </button>
                          <span className="flavor-stepper-count">{count}</span>
                          <button
                            type="button"
                            className="flavor-stepper-btn"
                            disabled={!canIncrease}
                            onClick={() => {
                              if (!canIncrease) return;
                              setFlavorCounts((prev) => ({
                                ...prev,
                                [fl]: (prev[fl] || 0) + 1,
                              }));
                            }}
                            aria-label={`Agregar 1 ${fl}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
          (isMultiSize && totalMultiUnits < 1) ||
          (!isCombo && !isMultiSize && p.sizes?.length > 0 && !p.sizes.some(z => z.name === size && z.available !== false)) ||
          (!isCombo && !isMultiSize && missingIceCreamFlavors) ||
          (!isCombo && !isMultiSize && missingFlavorOption) ||
          (!isMultiSize && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99))
        }
        onClick={handleAdd}
      >
        {buttonText()}
      </button>
    </Modal>
  );
}
