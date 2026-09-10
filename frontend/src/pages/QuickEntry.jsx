import React, { useState } from "react";
import { Search, Plus, Minus } from "lucide-react";
import Product from "./Product";
import { useStore } from "../store";
import { money, estimate } from "../domain";
export function addLine(cart, item) {
  const signature = x => JSON.stringify([x.productId, x.size, x.flavors, x.extras, x.notes]);
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
  const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const products = catalog.products.filter(p => (!category || p.category === category) && normalize(p.name).includes(normalize(search)));
  function choose(p) {
    if (p.sizes?.length > 1 || p.extras?.length) {
      setProduct(p);
      return;
    }
    const size = p.sizes?.[0]?.name || "";
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
    <label className="quick-search"><Search size={18} /><span className="sr-only">Buscar productos</span><input type="search" placeholder="Buscar un producto…" value={search} onChange={e => setSearch(e.target.value)} disabled={disabled} /></label>
    <div className="quick-categories" aria-label="Categorías">
      {["", ...catalog.categories].map(c => <button key={c} className={category === c ? "primary" : "secondary"} onClick={() => setCategory(c)}>{c || "Todos"}</button>)}
    </div>
    <p className="note">Si falta stock, precio o carga inicial, avisá al administrador.</p>
    <div className="quick-products">
      {products.map(p => <button className="quick-product" key={p.id} disabled={disabled || !p.available || cart.length >= 50} onClick={() => choose(p)}>
        <span aria-hidden="true">{p.emoji}</span><span><strong>{p.name}</strong><small>{p.available ? money(p.price) : p.availabilityReason || "No disponible"}{p.sizes?.length > 0 && p.available ? " · opciones" : ""}</small></span><Plus size={17} />
      </button>)}
      {!products.length && <p>No hay productos con esa búsqueda.</p>}
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
      <p className="delivery-hint">{preparation ? "Se envía a la comandera" : "Se registra como entregado"}</p>

    </div>
    {product && <Product manual product={product} onClose={() => setProduct(null)} onAdd={item => {
      setCart(old => addLine(old, item));
      setProduct(null);
    }} />}
  </section>;
}
