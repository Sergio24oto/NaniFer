import React, { useState } from "react";
import { X, Check, Plus, ShoppingBag, ChevronRight } from "lucide-react";
import { money } from "../domain";

export default function SmartUpsellSheet({
  suggestion,
  addedProduct,
  cart = [],
  onAddToCart,
  onViewCart,
  onClose,
}) {
  if (!suggestion || !suggestion.items?.length) return null;

  const [addedMap, setAddedMap] = useState({});
  const [activeVarietyProdId, setActiveVarietyProdId] = useState(null);

  const cartTotalQty = cart.reduce((n, i) => n + (i.quantity || 1), 0);
  const cartTotalPrice = cart.reduce((n, i) => n + ((i.quantity || 1) * (i.unitPrice || 0)), 0);

  const handleAddSimple = (p) => {
    onAddToCart({
      productId: p.id,
      product: p.id,
      name: p.name,
      quantity: 1,
      size: null,
      flavors: [],
      extras: [],
      notes: "",
      unitPrice: p.price || 0,
    });
    setAddedMap((prev) => ({ ...prev, [p.id]: true }));
  };

  const handleAddVariety = (p, variety) => {
    onAddToCart({
      productId: p.id,
      product: p.id,
      name: p.name,
      quantity: 1,
      size: null,
      flavors: [variety],
      extras: [],
      notes: variety,
      unitPrice: p.price || 0,
    });
    setAddedMap((prev) => ({ ...prev, [p.id]: variety }));
    setActiveVarietyProdId(null);
  };

  return (
    <div className="smart-upsell-backdrop" onClick={onClose}>
      <div
        className="smart-upsell-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sugerencias de maridaje"
      >
        {/* Handle superior de arrastre */}
        <div className="smart-upsell-handle" />

        {/* Encabezado con badge de confirmación y botón cerrar */}
        <div className="smart-upsell-head">
          <div className="smart-upsell-badge">
            <Check size={16} strokeWidth={3} />
            <span>
              ¡{addedProduct?.name || "Producto"} agregado a tu pedido!
            </span>
          </div>
          <button
            type="button"
            className="smart-upsell-close-btn"
            onClick={onClose}
            aria-label="Cerrar sugerencias"
          >
            <X size={18} />
          </button>
        </div>

        {/* Título de recomendación contextual */}
        <div className="smart-upsell-copy">
          <h3 className="smart-upsell-title">{suggestion.title}</h3>
          <p className="smart-upsell-subtitle">{suggestion.subtitle}</p>
        </div>

        {/* Grid de productos sugeridos */}
        <div className="smart-upsell-cards">
          {suggestion.items.map((item) => {
            const p = item.product;
            const isAdded = Boolean(addedMap[p.id]);
            const addedVarietyName = typeof addedMap[p.id] === "string" ? addedMap[p.id] : null;
            const isChoosingVariety = activeVarietyProdId === p.id;

            return (
              <div
                key={p.id}
                className={`smart-upsell-card ${isAdded ? "item-added" : ""}`}
              >
                {/* Micro-etiqueta de marketing */}
                <div className="smart-upsell-tag">{item.tag}</div>

                {/* Foto / Miniatura */}
                <div className="smart-upsell-thumb">
                  {p.image ? (
                    <img
                      src={p.image.startsWith("/api/uploads/menu/") || p.image.startsWith("/menu/") ? p.image : `/menu/${p.image}`}
                      alt={p.name}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="smart-upsell-placeholder">
                      {p.emoji || "✨"}
                    </div>
                  )}
                </div>

                {/* Info del producto */}
                <div className="smart-upsell-info">
                  <h4 className="smart-upsell-item-name">{p.name}</h4>
                  <div className="smart-upsell-item-price">
                    {money(p.price)}
                  </div>
                </div>

                {/* Acciones del producto */}
                {isAdded ? (
                  <div className="smart-upsell-added-pill">
                    <Check size={14} strokeWidth={3} />
                    <span>
                      {addedVarietyName ? `¡Sumada (${addedVarietyName})!` : "¡Agregado!"}
                    </span>
                  </div>
                ) : item.hasVarieties ? (
                  <div className="smart-upsell-variety-block">
                    {isChoosingVariety ? (
                      <div className="smart-upsell-variety-picker">
                        <span className="smart-upsell-variety-prompt">Elegí la variedad:</span>
                        <div className="smart-upsell-chips">
                          {item.varieties.map((v) => (
                            <button
                              key={v}
                              type="button"
                              className={`smart-variety-chip ${v.toLowerCase().includes("maní") ? "featured" : ""}`}
                              onClick={() => handleAddVariety(p, v)}
                            >
                              {v} {v.toLowerCase().includes("maní") ? "⭐" : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="smart-upsell-add-btn variety-btn"
                        onClick={() => setActiveVarietyProdId(p.id)}
                      >
                        <Plus size={15} />
                        <span>Elegir variedad</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="smart-upsell-add-btn"
                    onClick={() => handleAddSimple(p)}
                  >
                    <Plus size={15} />
                    <span>Agregar</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer con acciones principales */}
        <div className="smart-upsell-footer">
          <button
            type="button"
            className="smart-upsell-view-cart-btn"
            onClick={onViewCart}
          >
            <ShoppingBag size={18} />
            <span>
              Ver mi pedido ({cartTotalQty} {cartTotalQty === 1 ? "item" : "items"} · {money(cartTotalPrice)})
            </span>
            <ChevronRight size={18} />
          </button>

          <button
            type="button"
            className="smart-upsell-continue-btn"
            onClick={onClose}
          >
            Seguir en la carta
          </button>
        </div>
      </div>
    </div>
  );
}
