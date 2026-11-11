import React, { useState, useRef } from "react";
import { Modal } from "../components";
import { money, operationId } from "../domain";
import { request, useStore } from "../store";
import { isCoffeeOption } from "./Product";
import {
  Sparkles,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  Smartphone,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

// Atajos frecuentes para agregar con 1 solo toque
const FREQUENT_OPTIONS_BY_CATEGORY = [
  {
    category: "☕ Infusiones",
    items: [
      "Café en jarrito",
      "Café cortado",
      "Café con leche",
      "Lágrima",
      "Té",
      "Mate cocido"
    ]
  },
  {
    category: "🥐 Panadería",
    items: [
      "2 Medialunas",
      "2 Criollos",
      "2 Tostadas",
      "Medialuna con jamón y queso"
    ]
  },
  {
    category: "🧀 Untables",
    items: [
      "Queso crema",
      "Mermelada de durazno",
      "Mermelada de frutilla",
      "Manteca",
      "Dulce de leche"
    ]
  },
  {
    category: "🥤 Bebidas",
    items: ["Soda", "Jugo de naranja", "Vaso de agua"]
  }
];

export default function ComboEditor({ item, data, onClose, onSaved }) {
  const isEditing = Boolean(item?.id);
  const existingConfig = item?.comboConfig || {};

  // Categoría por defecto: buscar 'desayuno' o 'merienda' o la primera
  const defaultCategory =
    data?.categories?.find(c => {
      const n = (c.name || "").toLowerCase();
      return n.includes("desayun") || n.includes("meriend") || n.includes("combo");
    })?.id || data?.categories?.[0]?.id || "";

  // Estado del formulario general
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [description, setDescription] = useState(item?.description || "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || defaultCategory);
  const [publicCategories, setPublicCategories] = useState(item?.publicCategories || []);
  const [image, setImage] = useState(item?.image || "");
  const [inMenu, setInMenu] = useState(item?.inMenu ?? true);
  const [order, setOrder] = useState(item?.order ?? 0);

  // Agrandar infusión (Café Grande)
  const [upgradeCoffeeEnabled, setUpgradeCoffeeEnabled] = useState(
    existingConfig.upgradeCoffee?.enabled ?? (item?.extras?.length > 0 || !isEditing)
  );
  const [upgradeCoffeePrice, setUpgradeCoffeePrice] = useState(() => {
    if (existingConfig.upgradeCoffee?.price != null) return String(existingConfig.upgradeCoffee.price);
    if (item?.extras?.[0]?.price != null) return String(item.extras[0].price);
    return "500";
  });
  const [upgradeCoffeeLabel, setUpgradeCoffeeLabel] = useState(
    existingConfig.upgradeCoffee?.label || item?.extras?.[0]?.name || "Café Grande"
  );

  // Block B: Pasos de elección del combo
  const [steps, setSteps] = useState(() => {
    if (Array.isArray(existingConfig.steps) && existingConfig.steps.length > 0) {
      return existingConfig.steps.map((s, idx) => ({
        id: s.id || `step-${idx + 1}`,
        title: s.title || `Paso ${idx + 1}`,
        type: s.type || "single", // "single" | "multiple"
        min: s.min || (s.type === "multiple" ? 2 : 1),
        max: s.max || (s.type === "multiple" ? 2 : 1),
        options: Array.isArray(s.options) ? [...s.options] : []
      }));
    }
    // Paso inicial sugerido para nuevos combos
    return [
      {
        id: "step-1",
        title: "Elegí tu Infusión",
        type: "single",
        min: 1,
        max: 1,
        options: [
          "Café en jarrito",
          "Café cortado",
          "Café con leche",
          "Lágrima",
          "Té",
          "Mate cocido"
        ]
      }
    ];
  });

  // Inputs temporales para escribir nuevas opciones en cada paso
  const [newOptionInputs, setNewOptionInputs] = useState({});

  // Estado de simulación para la previsualización interactiva en vivo
  const [previewSelections, setPreviewSelections] = useState({});
  const [previewTabActive, setPreviewTabActive] = useState("editor"); // 'editor' | 'preview' para pantallas móviles

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  // Manejo de pasos (Block B)
  const addStep = () => {
    const nextIdx = steps.length + 1;
    const newStep = {
      id: `step-${Date.now()}-${nextIdx}`,
      title: `Paso ${nextIdx}`,
      type: "single",
      min: 1,
      max: 1,
      options: []
    };
    setSteps(prev => [...prev, newStep]);
  };

  const removeStep = (indexToRemove) => {
    if (steps.length <= 1) {
      alert("El combo debe tener al menos un paso de elección.");
      return;
    }
    setSteps(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const moveStep = (index, direction) => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    setSteps(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const updateStepField = (index, field, value) => {
    setSteps(prev =>
      prev.map((step, idx) => {
        if (idx !== index) return step;
        const updated = { ...step, [field]: value };
        if (field === "type") {
          if (value === "single") {
            updated.min = 1;
            updated.max = 1;
          } else {
            updated.min = step.min || 2;
            updated.max = step.max || 2;
          }
        }
        return updated;
      })
    );
  };

  const addOptionToStep = (index, rawOption) => {
    const opt = (rawOption || "").trim();
    if (!opt) return;
    setSteps(prev =>
      prev.map((step, idx) => {
        if (idx !== index) return step;
        if (step.options.includes(opt)) return step;
        return { ...step, options: [...step.options, opt] };
      })
    );
    setNewOptionInputs(prev => ({ ...prev, [index]: "" }));
  };

  const removeOptionFromStep = (stepIndex, optionToRemove) => {
    setSteps(prev =>
      prev.map((step, idx) => {
        if (idx !== stepIndex) return step;
        return {
          ...step,
          options: step.options.filter(o => o !== optionToRemove)
        };
      })
    );
  };

  // Manejo de la simulación en la Previsualización
  const handlePreviewSingle = (stepId, option) => {
    setPreviewSelections(prev => ({
      ...prev,
      [stepId]: prev[stepId] === option ? "" : option
    }));
  };

  const handlePreviewMultiple = (stepId, option, max = 2) => {
    setPreviewSelections(prev => {
      const current = prev[stepId] || [];
      const count = current.filter(x => x === option).length;
      if (current.length < max) {
        return { ...prev, [stepId]: [...current, option] };
      } else {
        if (count > 0) {
          const idx = current.lastIndexOf(option);
          const next = [...current];
          next.splice(idx, 1);
          return { ...prev, [stepId]: next };
        } else {
          const next = [...current.slice(1), option];
          return { ...prev, [stepId]: next };
        }
      }
    });
  };

  // Validación de pasos completos en la previsualización
  const isPreviewStepReady = (step) => {
    const val = previewSelections[step.id];
    if (step.type === "multiple") {
      const min = step.min || step.max || 1;
      return (val || []).length >= min;
    }
    return Boolean(val);
  };

  const allPreviewStepsReady = steps.length > 0 && steps.every(isPreviewStepReady);

  // Envío final
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lock.current) return;
    setError("");

    if (!name.trim()) {
      setError("Por favor ingresá un nombre para el combo.");
      return;
    }
    if (price === "" || isNaN(Number(price)) || Number(price) <= 0) {
      setError("Por favor ingresá un precio válido mayor a 0.");
      return;
    }
    if (steps.length === 0) {
      setError("El combo debe tener al menos un paso de elección.");
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.title.trim()) {
        setError(`El Paso ${i + 1} necesita un título (ej: "Elegí tu Infusión").`);
        return;
      }
      if (!s.options || s.options.length === 0) {
        setError(`El Paso "${s.title}" debe tener al menos una opción para elegir.`);
        return;
      }
    }

    const cleanedSteps = steps.map((s, idx) => ({
      id: s.id || `step-${idx + 1}`,
      title: s.title.trim(),
      type: s.type || "single",
      min: s.type === "multiple" ? Math.max(1, Number(s.min || 1)) : 1,
      max: s.type === "multiple" ? Math.max(Number(s.min || 1), Number(s.max || 1)) : 1,
      required: true,
      options: s.options
    }));

    const finalCoffeePrice = upgradeCoffeePrice !== "" && !isNaN(Number(upgradeCoffeePrice))
      ? Math.max(0, Number(upgradeCoffeePrice))
      : 500;
    const finalCoffeeLabel = (upgradeCoffeeLabel || "Café Grande").trim() || "Café Grande";

    const body = {
      name: name.trim(),
      description: description.trim(),
      categoryId,
      subcategory: (item?.subcategory || "").trim(),
      publicCategories: (publicCategories || []).filter(cId => cId && cId !== categoryId),
      price: Number(price),
      image: image || null,
      available: true,
      inMenu: Boolean(inMenu),
      order: Number(order || 0),
      sizes: [],
      flavorOptions: [],
      comboConfig: {
        is_combo: true,
        steps: cleanedSteps,
        upgradeCoffee: {
          enabled: Boolean(upgradeCoffeeEnabled),
          price: finalCoffeePrice,
          label: finalCoffeeLabel
        }
      },
      extras: upgradeCoffeeEnabled
        ? [{ name: finalCoffeeLabel, price: finalCoffeePrice }]
        : []
    };

    try {
      lock.current = true;
      setBusy(true);

      if (isEditing) {
        await request(`/menu-management/products/${item.id}`, {
          method: "PUT",
          body
        });
      } else {
        const key = `new-combo-${operationId()}`;
        await request("/menu-management/products", {
          method: "POST",
          key,
          body
        });
      }

      onSaved();
    } catch (err) {
      setError(err.message || "No se pudo guardar el combo.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isEditing ? `✨ Editar Combo: ${name || item.name}` : "✨ Crear Nuevo Combo"}
      onClose={() => !busy && onClose()}
      className="combo-modal-fullscreen"
    >
      {/* Botones de alternancia para móviles */}
      <div className="combo-mobile-tab-switch">
        <button
          type="button"
          className={previewTabActive === "editor" ? "active" : ""}
          onClick={() => setPreviewTabActive("editor")}
        >
          <Layers size={16} />
          Configurar Combo
        </button>
        <button
          type="button"
          className={previewTabActive === "preview" ? "active" : ""}
          onClick={() => setPreviewTabActive("preview")}
        >
          <Smartphone size={16} />
          Vista Previa en Vivo
          {allPreviewStepsReady && <span className="tab-ready-badge">✓</span>}
        </button>
      </div>

      {error && (
        <div className="combo-error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="combo-editor-layout">
        {/* COLUMNA IZQUIERDA: CONFIGURADOR DEL COMBO (Bloque A y Bloque B) */}
        <div className={`combo-editor-column ${previewTabActive === "editor" ? "mobile-show" : "mobile-hide"}`}>
          {/* BLOQUE A: DATOS GENERALES */}
          <section className="combo-card-section">
            <div className="combo-section-header">
              <span className="combo-section-badge">Bloque A</span>
              <h3 className="combo-section-title">Datos Generales del Combo</h3>
            </div>

            <div className="combo-form-grid">
              <div className="combo-field">
                <label>Nombre del combo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Combo Merienda NaniFer, Combo Americano..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="combo-field">
                <label>Precio final ($) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="100"
                  placeholder="Ej: 11500"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="combo-field">
              <label>Descripción para el cliente</label>
              <textarea
                placeholder="Ej: Infusión a elección, 2 criollos o tostadas con untables y jugo de naranja..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                maxLength={250}
              />
            </div>

            <div className="combo-form-grid">
              <div className="combo-field">
                <label>Categoría principal en la carta</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                >
                  {(data?.categories || []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="combo-field">
                <label>Posición / Orden (menor sale primero)</label>
                <input
                  type="number"
                  min="0"
                  value={order}
                  onChange={e => setOrder(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Categorías adicionales tipo pills */}
            <div className="combo-field">
              <label>También mostrar en otras categorías (opcional):</label>
              <div className="combo-categories-pills">
                {(data?.categories || [])
                  .filter(c => c.id !== categoryId)
                  .map(c => {
                    const isSelected = publicCategories.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`cat-chip-btn ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          if (isSelected) {
                            setPublicCategories(publicCategories.filter(id => id !== c.id));
                          } else {
                            setPublicCategories([...publicCategories, c.id]);
                          }
                        }}
                      >
                        <span>{isSelected ? "✓" : "+"}</span>
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </section>

          {/* BLOQUE B: PASOS DE ELECCIÓN (CORAZÓN INTERACTIVO) */}
          <section className="combo-card-section block-b">
            <div className="combo-section-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="combo-section-badge heart-badge">Bloque B</span>
                <div>
                  <h3 className="combo-section-title">¿Qué tiene que elegir el cliente?</h3>
                  <p className="combo-section-subtitle">
                    Creá los pasos de elección (ej: 1ª infusión, 2ª panadería, 3ª untables) y sus opciones.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="combo-add-step-top-btn"
                onClick={addStep}
              >
                <Plus size={16} />
                + Agregar paso
              </button>
            </div>

            <div className="combo-steps-list">
              {steps.map((step, idx) => (
                <div key={step.id} className="combo-step-editor-card">
                  {/* Barra superior del paso */}
                  <div className="step-editor-head">
                    <div className="step-badge-number">Paso {idx + 1}</div>
                    <input
                      type="text"
                      className="step-title-input"
                      placeholder="Título del paso (ej: Elegí tu Infusión, Panadería, Untables...)"
                      value={step.title}
                      onChange={e => updateStepField(idx, "title", e.target.value)}
                    />

                    <div className="step-actions">
                      <button
                        type="button"
                        className="step-icon-btn"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, "up")}
                        title="Subir paso"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="step-icon-btn"
                        disabled={idx === steps.length - 1}
                        onClick={() => moveStep(idx, "down")}
                        title="Bajar paso"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="step-icon-btn danger"
                        onClick={() => removeStep(idx)}
                        title="Eliminar este paso"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Selector de modo de elección: 1 sola vs Varias */}
                  <div className="step-mode-row">
                    <span className="step-mode-label">El cliente puede elegir:</span>
                    <div className="step-mode-toggle">
                      <button
                        type="button"
                        className={step.type === "single" ? "active" : ""}
                        onClick={() => updateStepField(idx, "type", "single")}
                      >
                        🔘 1 sola opción
                      </button>
                      <button
                        type="button"
                        className={step.type === "multiple" ? "active" : ""}
                        onClick={() => updateStepField(idx, "type", "multiple")}
                      >
                        ☑️ Varias opciones
                      </button>
                    </div>

                    {step.type === "multiple" && (
                      <div className="step-limits-wrap">
                        <label>
                          Exactamente:
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={step.max}
                            onChange={e => {
                              const val = Math.max(1, Number(e.target.value));
                              updateStepField(idx, "min", val);
                              updateStepField(idx, "max", val);
                            }}
                          />
                          opciones
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Opciones del paso */}
                  <div className="step-options-container">
                    <span className="step-options-heading">
                      Opciones configuradas ({step.options.length}):
                    </span>

                    {/* Chips de opciones cargadas */}
                    <div className="step-chips-cloud">
                      {step.options.map(opt => (
                        <span key={opt} className="step-option-chip-admin">
                          <span>{opt}</span>
                          <button
                            type="button"
                            onClick={() => removeOptionFromStep(idx, opt)}
                            title={`Quitar "${opt}"`}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}

                      {step.options.length === 0 && (
                        <p className="no-options-warning">
                          ⚠️ Aún no agregaste opciones. Escribí una abajo o tocá los atajos frecuentes.
                        </p>
                      )}
                    </div>

                    {/* Input para agregar opción manual */}
                    <div className="step-add-option-row">
                      <input
                        type="text"
                        placeholder="Escribí una opción y presioná Enter (ej: Medialuna)..."
                        value={newOptionInputs[idx] || ""}
                        onChange={e =>
                          setNewOptionInputs({
                            ...newOptionInputs,
                            [idx]: e.target.value
                          })
                        }
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addOptionToStep(idx, newOptionInputs[idx]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => addOptionToStep(idx, newOptionInputs[idx])}
                      >
                        + Agregar
                      </button>
                    </div>

                    {/* Atajos inteligentes frecuentes */}
                    <div className="step-quick-suggestions">
                      <span className="quick-suggestions-title">
                        Atajos con 1 toque:
                      </span>
                      <div className="quick-suggestions-groups">
                        {FREQUENT_OPTIONS_BY_CATEGORY.map(group => {
                          const availableItems = group.items.filter(
                            item => !step.options.includes(item)
                          );
                          if (availableItems.length === 0) return null;
                          return (
                            <div key={group.category} className="quick-group">
                              <span className="quick-group-label">
                                {group.category}:
                              </span>
                              <div className="quick-chips">
                                {availableItems.map(item => (
                                  <button
                                    type="button"
                                    key={item}
                                    className="quick-chip-btn"
                                    onClick={() => addOptionToStep(idx, item)}
                                  >
                                    + {item}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="combo-add-step-bottom-btn"
              onClick={addStep}
            >
              <Plus size={18} />
              + Agregar otro paso de elección
            </button>

            {/* Configuración de Agrandar Infusión */}
            <div className="combo-upgrade-coffee-section">
              <div className="combo-upgrade-coffee-header">
                <div className="combo-upgrade-coffee-title-wrap">
                  <span className="combo-upgrade-coffee-icon">☕</span>
                  <div>
                    <strong className="combo-upgrade-coffee-title">Agrandar Infusión (Café Grande)</strong>
                    <p className="combo-upgrade-coffee-desc">
                      Si el cliente elige un café (con leche, lágrima, etc.), se le ofrecerá la opción de agrandarlo por un costo adicional.
                    </p>
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={upgradeCoffeeEnabled}
                    onChange={(e) => setUpgradeCoffeeEnabled(e.target.checked)}
                  />
                  <span>Habilitado</span>
                </label>
              </div>
              {upgradeCoffeeEnabled && (
                <div className="combo-upgrade-coffee-body">
                  <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>Precio adicional ($):</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={upgradeCoffeePrice}
                      onChange={(e) => setUpgradeCoffeePrice(e.target.value)}
                      placeholder="500"
                      style={{ width: "110px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>Etiqueta en comanda / mesa:</label>
                    <input
                      type="text"
                      value={upgradeCoffeeLabel}
                      onChange={(e) => setUpgradeCoffeeLabel(e.target.value)}
                      placeholder="Café Grande"
                      style={{ width: "160px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Footer de guardado */}
          <div className="combo-editor-footer">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary combo-save-btn"
              disabled={busy}
            >
              <Sparkles size={18} />
              {busy ? "Guardando..." : isEditing ? "Guardar Cambios del Combo" : "¡Crear y Publicar Combo!"}
            </button>
          </div>
        </div>

        {/* COLUMNA DERECHA: PREVISUALIZACIÓN INTERACTIVA EN VIVO */}
        <div className={`combo-preview-column ${previewTabActive === "preview" ? "mobile-show" : "mobile-hide"}`}>
          <div className="phone-preview-shell">
            {/* Pantalla del teléfono */}
            <div className="phone-preview-screen">
              <div className="phone-top-notch">
                <span className="phone-notch-pill" />
              </div>

              <div className="phone-header-notice">
                <Smartphone size={15} />
                <span>Simulador en vivo: probá hacer clic en tus opciones</span>
              </div>

              {/* Tarjeta del producto como lo ve el cliente */}
              <div className="phone-product-card">
                <div className="phone-product-title-row">
                  <div>
                    <h4 className="phone-product-name">{name || "Nombre del Combo"}</h4>
                    <p className="phone-product-desc">
                      {description || "Descripción breve del combo..."}
                    </p>
                  </div>
                  <div className="phone-product-price">
                    {price ? money(Number(price)) : "$0"}
                  </div>
                </div>

                {/* Pasos en vivo interactivos */}
                <div className="combo-builder-container">
                  {steps.map((step, idx) => {
                    const stepNum = idx + 1;
                    const isMultiple = step.type === "multiple";
                    const val = previewSelections[step.id];
                    const max = step.max || 2;
                    const min = step.min || max;
                    const currentCount = isMultiple ? (val || []).length : val ? 1 : 0;
                    const isCompleted = isMultiple ? currentCount >= min : Boolean(val);

                    return (
                      <div
                        key={step.id}
                        className={`combo-step-card ${isCompleted ? "completed" : "active"}`}
                      >
                        <div className="combo-step-header">
                          <div className="combo-step-title-wrap">
                            <span className="combo-step-number">{stepNum}</span>
                            <strong className="combo-step-title">
                              {step.title || `Paso ${stepNum}`}
                            </strong>
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
                          {step.options?.map(opt => {
                            const countInMultiple = isMultiple
                              ? (val || []).filter(x => x === opt).length
                              : 0;
                            const isSelected = isMultiple
                              ? countInMultiple > 0
                              : val === opt;

                            return (
                              <button
                                type="button"
                                key={opt}
                                className={`combo-option-chip ${isSelected ? "selected" : ""}`}
                                onClick={() => {
                                  if (isMultiple) {
                                    handlePreviewMultiple(step.id, opt, max);
                                  } else {
                                    handlePreviewSingle(step.id, opt);
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

                          {(!step.options || step.options.length === 0) && (
                            <div className="phone-empty-step">
                              (Sin opciones cargadas aún en este paso)
                            </div>
                          )}
                        </div>

                        {upgradeCoffeeEnabled && !isMultiple && isCoffeeOption(val) && (
                          <div className="combo-coffee-upgrade-card" style={{ margin: "8px 0 0" }}>
                            <div className="combo-coffee-upgrade-left">
                              <span className="coffee-upgrade-icon">☕✨</span>
                              <div className="coffee-upgrade-texts">
                                <strong style={{ fontSize: "12px" }}>¿Agrandar a Café Grande?</strong>
                                <small style={{ fontSize: "10.5px" }}>+{money(Number(upgradeCoffeePrice) || 500)}</small>
                              </div>
                            </div>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#8A4F1D", background: "#FAF0E1", padding: "4px 8px", borderRadius: "12px" }}>
                              Opción activa
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Botón simulado de agregar al carrito */}
                <div className="phone-bottom-action">
                  <button
                    type="button"
                    className={`phone-action-btn ${allPreviewStepsReady ? "ready" : "pending"}`}
                  >
                    {allPreviewStepsReady ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>¡Listo! Agregar · {price ? money(Number(price)) : "$0"}</span>
                      </>
                    ) : (
                      <span>
                        Falta completar opciones · {price ? money(Number(price)) : "$0"}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
