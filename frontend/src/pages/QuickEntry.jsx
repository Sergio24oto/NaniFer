import React, { useState } from "react";
import { Search, Plus, Minus } from "lucide-react";
import Product from "./Product";
import { Modal } from "../components";
import { useStore, submitOnce, refresh } from "../store";
import { money, estimate, getProductStation, operationId } from "../domain";
const CATEGORY_ORDER = [
  "cafeteria",
  "cafe",
  "desayunos",
  "meriendas",
  "tostados",
  "panaderia",
  "helados",
  "heladeria",
  "licuados",
  "bebidas",
  "comidas",
  "pizzas",
  "empanadas",
  "combos",
  "tortas",
  "dulces"
];

function getCategoryPriority(cat, normalize) {
  if (!cat) return 0;
  const n = normalize(cat);
  const idx = CATEGORY_ORDER.findIndex(p => n.includes(p));
  return idx === -1 ? 99 : idx + 1;
}

function getProductOperationalScore(p, normalize) {
  const n = normalize(p.name || "");
  const cat = normalize(p.category || "");

  // 1. Cafetería y desayunos / meriendas básicos (máxima rotación de mozas)
  if (n.includes("cafe") || n.includes("cortado") || n.includes("lagrima") || n.includes("submarino") || n.includes("jarrito")) return 1000;
  if (n.includes("tostado") || n.includes("carlit")) return 950;
  if (n.includes("medialuna") || n.includes("criollo") || n.includes("factura")) return 900;
  if (n.includes("licuado")) return 850;

  // 2. Heladería (1 kg, 1/2 kg, 1/4 kg, bochas)
  if (n.includes("1 kg") || n.includes("1kg") || n.includes("kilo")) return 800;
  if (n.includes("1/2 kg") || n.includes("medio kilo") || n.includes("1/2kg")) return 790;
  if (n.includes("1/4 kg") || n.includes("cuarto") || n.includes("1/4kg")) return 780;
  if (n.includes("bocha") || n.includes("cucurucho") || n.includes("tacita") || n.includes("vasito")) return 770;
  if (cat.includes("helad")) return 750;

  // 3. Bebidas comunes
  if (n.includes("gaseosa") || n.includes("agua") || n.includes("levite") || n.includes("soda")) return 700;
  if (n.includes("cerveza") || n.includes("chopp") || n.includes("pinta")) return 680;

  // 4. Comidas saladas de alta rotación
  if (n.includes("empanada")) return 600;
  if (n.includes("pizza")) return 550;
  if (n.includes("papas") || n.includes("picada")) return 500;

  return 100;
}

export function addLine(cart, item) {
  const signature = x => JSON.stringify([x.productId, x.size, x.flavors, x.extras, x.notes, x.customPrice || x.unitPrice]);
  const index = cart.findIndex(x => signature(x) === signature(item) && x.quantity + item.quantity <= 99);
  return index < 0 ? [...cart, item] : cart.map((x, i) => i === index ? {
    ...x,
    quantity: x.quantity + item.quantity
  } : x);
}
export default function QuickEntry({
  cart,
  setCart,
  preparation,
  setPreparation,
  disabled,
  counter = false
}) {
  const {
    catalog
  } = useStore();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState(null);

  // Recarga Virtual
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeCompany, setRechargeCompany] = useState("");

  // Crear producto nuevo (Lógica de Stock)
  const [showNewProd, setShowNewProd] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdCatId, setNewProdCatId] = useState("");
  const [newProdNewCatName, setNewProdNewCatName] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdInMenu, setNewProdInMenu] = useState(false);
  const [newProdBusy, setNewProdBusy] = useState(false);
  const [newProdError, setNewProdError] = useState("");

  function handleAddRecharge(e) {
    e?.preventDefault();
    const amt = Number(rechargeAmount);
    if (!amt || amt <= 0) return;
    const noteStr = rechargeCompany.trim();
    const rechargeItem = {
      productId: "prod-recarga-virtual",
      name: "Recarga Virtual",
      size: "",
      flavors: [],
      extras: [],
      notes: noteStr ? `Línea/Servicio: ${noteStr}` : "",
      quantity: 1,
      unitPrice: amt,
      customPrice: amt,
    };
    setCart(old => addLine(old, rechargeItem));
    setShowRecharge(false);
    setRechargeAmount("");
    setRechargeCompany("");
  }

  async function handleCreateProduct(e) {
    e.preventDefault();
    if (!newProdName.trim()) return;
    setNewProdBusy(true);
    setNewProdError("");
    try {
      const scope = "quick-prod-" + operationId();
      const body = {
        name: newProdName.trim(),
        categoryId: newProdCatId === "__new__" || !newProdCatId ? null : newProdCatId,
        categoryName: newProdCatId === "__new__" ? newProdNewCatName.trim() : null,
        area: "manual",
        manageStock: false,
        price: newProdPrice === "" || newProdPrice == null ? null : Number(newProdPrice),
        available: true,
        inMenu: Boolean(newProdInMenu),
        initialStock: false
      };
      const result = await submitOnce(scope, "/stock/products", body);
      await refresh();
      setCart(old => addLine(old, {
        productId: result.id,
        name: result.name,
        size: "",
        flavors: [],
        extras: [],
        notes: "",
        quantity: 1,
        unitPrice: Number(newProdPrice) || 0
      }));
      setShowNewProd(false);
      setNewProdName("");
      setNewProdCatId("");
      setNewProdNewCatName("");
      setNewProdPrice("");
      setNewProdInMenu(false);
    } catch (err) {
      setNewProdError(err.message || "Error al crear el producto.");
    } finally {
      setNewProdBusy(false);
    }
  }
  const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sortedCategories = [
    "",
    ...[...catalog.categories].sort((a, b) => getCategoryPriority(a, normalize) - getCategoryPriority(b, normalize))
  ];
  const products = catalog.products
    .filter(p => {
      if (category && p.category !== category) return false;
      if (!search.trim()) return true;
      const term = normalize(search.trim());
      const inName = normalize(p.name || "").includes(term);
      const inCategory = normalize(p.category || "").includes(term);
      const inDesc = normalize(p.description || "").includes(term);
      const inPublicCats = (p.publicCategories || []).some(c => normalize(c || "").includes(term));
      const inSizes = (p.sizes || []).some(s => normalize(s.name || "").includes(term));
      const inFlavors = (p.flavorOptions || []).some(f => normalize(f || "").includes(term));
      return inName || inCategory || inDesc || inPublicCats || inSizes || inFlavors;
    })
    .sort((a, b) => {
      if (search.trim()) return 0;
      return getProductOperationalScore(b, normalize) - getProductOperationalScore(a, normalize);
    });
  function choose(p) {
    if (p.sizes?.length > 1 || p.extras?.length || p.flavorOptions?.length || (p.comboConfig?.is_combo && p.comboConfig.steps?.length > 0)) {
      setProduct(p);
      return;
    }
    if (getProductStation(p) === "cocina") {
      setPreparation(true);
    }
    const defaultSz = p.sizes?.find(s => s.available !== false && s.isDefault) || p.sizes?.find(s => s.available !== false) || p.sizes?.[0];
    const size = defaultSz?.name || "";
    setCart(old => addLine(old, {
      productId: p.id,
      name: p.name,
      size,
      flavors: [],
      extras: [],
      notes: "",
      quantity: 1,
      unitPrice: estimate(p, size, [])
    }));
  }
  const total = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  return <section className="quick-entry">
    {counter && (
      <div className="counter-tools-bar">
        <button
          type="button"
          className="counter-tool-btn counter-tool-recharge"
          onClick={() => setShowRecharge(true)}
          disabled={disabled}
        >
          <span>📱</span> <strong>Recarga Virtual</strong>
        </button>
        <button
          type="button"
          className="counter-tool-btn counter-tool-new"
          onClick={() => {
            setNewProdName(search.trim());
            setShowNewProd(true);
          }}
          disabled={disabled}
        >
          <span>➕</span> <strong>Crear producto nuevo</strong>
        </button>
      </div>
    )}
    <label className="quick-search"><Search size={18} /><span className="sr-only">Buscar productos</span><input type="search" placeholder="Buscar un producto…" value={search} onChange={e => setSearch(e.target.value)} disabled={disabled} /></label>
    <div className="quick-categories" aria-label="Categorías">
      {sortedCategories.map(c => <button key={c} className={category === c ? "primary" : "secondary"} onClick={() => setCategory(c)}>{c || "Todos"}</button>)}
    </div>
    <p className="note">Si falta stock, precio o carga inicial, avisá al administrador.</p>
    <div className="quick-products">
      {products.map(p => <button className="quick-product" key={p.id} disabled={disabled || !p.available || cart.length >= 50} onClick={() => choose(p)}>
        <span aria-hidden="true">{p.emoji}</span><span><strong>{p.name}</strong><small>{p.available ? money(p.price) : p.availabilityReason || "No disponible"}{p.sizes?.length > 0 && p.available ? " · opciones" : ""}</small></span><Plus size={17} />
      </button>)}
      {!products.length && (
        <div className="quick-empty-search">
          <p>No hay productos con esa búsqueda.</p>
          {counter && (
            <button
              type="button"
              className="primary quick-create-from-search-btn"
              onClick={() => {
                setNewProdName(search.trim());
                setShowNewProd(true);
              }}
              disabled={disabled}
            >
              ➕ Crear "{search.trim() || 'producto'}" en el sistema
            </button>
          )}
        </div>
      )}
    </div>
    <div className="quick-cart panel">
      <h2>{counter ? "Productos de esta compra" : "Consumos por guardar"}</h2>
      {!cart.length && <p>Elegí productos para agregarlos. Todavía no se registró ningún consumo.</p>}
      {cart.map((item, index) => <div className="quick-line" key={index}>
        <div><strong>{item.name}</strong><small>{[item.size, ...item.flavors, ...item.extras].filter(Boolean).join(" · ")}</small>
          <details><summary>Observación opcional</summary><textarea aria-label={"Observación de " + item.name} maxLength={300} value={item.notes} disabled={disabled} onChange={e => {
              const value = e.target.value;
              setCart(old => old.map((x, i) => i === index ? {
                ...x,
                notes: value
              } : x));
            }} /></details>
        </div>
        <div className="quantity"><button aria-label={"Quitar una unidad de " + item.name} disabled={disabled} onClick={() => setCart(old => old.flatMap((x, i) => i !== index ? [x] : x.quantity > 1 ? [{
            ...x,
            quantity: x.quantity - 1
          }] : []))}><Minus size={16} /></button><strong>{item.quantity}</strong><button aria-label={"Agregar una unidad de " + item.name} disabled={disabled || item.quantity >= 99} onClick={() => setCart(old => old.map((x, i) => i === index ? {
            ...x,
            quantity: x.quantity + 1
          } : x))}><Plus size={16} /></button></div>
        <strong>{money(item.quantity * item.unitPrice)}</strong>
      </div>)}
      <div className="total"><span>{counter ? "Total de la compra" : "Total de esta carga"}</span><strong>{money(total)}</strong></div>
      <small>Se confirma con los precios del catálogo al guardar.</small>
      <div className="preparation-toggle-container">
        <label className="preparation-toggle-card">
          <input
            type="checkbox"
            checked={Boolean(preparation)}
            onChange={e => setPreparation(e.target.checked)}
            disabled={disabled}
          />
          <span className="preparation-toggle-badge">
            {preparation ? "🍳 Enviar a Cocina (Comanda)" : "✓ Ya entregado en mesa"}
          </span>
          <small>
            {preparation
              ? "Aparecerá en la pantalla de cocina para su preparación."
              : "Consumo directo ya servido, no necesita salir en cocina."}
          </small>
        </label>
      </div>

    </div>
    {product && <Product manual product={product} onClose={() => setProduct(null)} onAdd={res => {
      const list = Array.isArray(res) ? res : [res];
      if (getProductStation(product) === "cocina") {
        setPreparation(true);
      }
      setCart(old => {
        let acc = old;
        for (const item of list) {
          acc = addLine(acc, item);
        }
        return acc;
      });
      setProduct(null);
    }} />}

    {showRecharge && (
      <Modal title="📱 Recarga Virtual (Venta rápida)" onClose={() => setShowRecharge(false)}>
        <form onSubmit={handleAddRecharge}>
          <p>Ingresá el importe de la recarga solicitada por el cliente.</p>

          <label>
            Monto de la recarga ($)
            <input
              type="number"
              min="1"
              step="any"
              placeholder="Ej: 2000"
              value={rechargeAmount}
              onChange={e => setRechargeAmount(e.target.value)}
              autoFocus
              required
            />
          </label>

          <div className="recharge-quick-amounts">
            <span style={{ fontSize: 13, color: "#64748b", alignSelf: "center", marginRight: 4 }}>Montos rápidos:</span>
            {[1000, 2000, 3000, 5000, 10000].map(val => (
              <button
                type="button"
                key={val}
                className="recharge-chip"
                onClick={() => setRechargeAmount(String(val))}
              >
                ${val.toLocaleString("es-AR")}
              </button>
            ))}
          </div>

          <label>
            Compañía / N° de línea (opcional)
            <input
              type="text"
              placeholder="Ej: Personal 381..., Claro, Movistar, SUBE"
              value={rechargeCompany}
              onChange={e => setRechargeCompany(e.target.value)}
              maxLength={150}
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowRecharge(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary"
              style={{ flex: 1 }}
              disabled={!rechargeAmount || Number(rechargeAmount) <= 0}
            >
              Sumar {rechargeAmount ? money(Number(rechargeAmount)) : ""} al mostrador
            </button>
          </div>
        </form>
      </Modal>
    )}

    {showNewProd && (
      <Modal title="➕ Crear producto no registrado" onClose={() => !newProdBusy && setShowNewProd(false)}>
        <form onSubmit={handleCreateProduct}>
          <p>
            Cargá el producto que se llevan en este momento. Se guardará en el catálogo y se sumará automáticamente a esta compra.
          </p>

          {newProdError && <p className="alert" role="alert">{newProdError}</p>}

          <fieldset disabled={newProdBusy} style={{ border: "none", padding: 0 }}>
            <label>
              Nombre del producto
              <input
                required
                maxLength={150}
                value={newProdName}
                onChange={e => setNewProdName(e.target.value)}
                placeholder="Ej: Alfajor Havanna 70%, Chicle Beldent, etc."
                autoFocus
              />
            </label>

            <label>
              Categoría
              <select
                value={newProdCatId}
                onChange={e => {
                  const val = e.target.value;
                  setNewProdCatId(val);
                  if (val === "__new__" && !newProdNewCatName) {
                    setNewProdNewCatName("");
                  }
                }}
              >
                <option value="">Seleccionar categoría...</option>
                {catalog.categories.map(c => (
                  <option key={c.id || c} value={c.id || c}>{c.name || c}</option>
                ))}
                <option value="__new__">+ Crear nueva categoría</option>
              </select>
            </label>

            {newProdCatId === "__new__" && (
              <label>
                Nombre de la nueva categoría
                <input
                  required
                  maxLength={100}
                  value={newProdNewCatName}
                  onChange={e => setNewProdNewCatName(e.target.value)}
                  placeholder="Ej: Kiosco, Golosinas, Almacén"
                />
              </label>
            )}

            <label>
              Precio de venta ($)
              <input
                type="number"
                min="0"
                step="10"
                value={newProdPrice}
                onChange={e => setNewProdPrice(e.target.value)}
                placeholder="Ej: 1500"
                required
              />
            </label>

            <label className="option" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={newProdInMenu}
                onChange={e => setNewProdInMenu(e.target.checked)}
              />
              Mostrar también en la carta digital pública de las mesas
            </label>
            <small style={{ color: "var(--text-muted, #666)", display: "block", marginBottom: 12 }}>
              Si está desmarcado, el producto solo aparecerá en el mostrador para el personal (solo mostrador / kiosco).
            </small>
          </fieldset>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="secondary"
              disabled={newProdBusy}
              onClick={() => setShowNewProd(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary"
              style={{ flex: 1 }}
              disabled={newProdBusy || !newProdName.trim() || (newProdCatId === "__new__" && !newProdNewCatName.trim())}
            >
              {newProdBusy ? "Guardando…" : "Guardar y sumar a esta compra"}
            </button>
          </div>
        </form>
      </Modal>
    )}
  </section>;
}
