import React, { useState, useEffect } from "react";
import { useStore } from "../store";
import { money, estimate } from "../domain";
import Product from "./Product";
import PublicCart from "./PublicCart";

function Photo({ src, alt, ...props }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img {...props} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  ) : null;
}

function getCategoryHeaderImage(catName = "") {
  const n = catName.toLowerCase();
  if (n.includes("comida") || n.includes("pizza") || n.includes("cena") || n.includes("almuerzo")) return "/menu/headers/comidas.webp";
  if (n.includes("bebid") || n.includes("gaseosa") || n.includes("jugo") || n.includes("agua")) return "/menu/headers/bebidas.webp";
  if (n.includes("golosin") || n.includes("kiosco") || n.includes("quiosco") || n.includes("chocolat") || n.includes("caramel") || n.includes("chicle") || n.includes("gomita")) return "/menu/headers/golosinas.webp";
  if (n.includes("caf") || n.includes("espresso") || n.includes("infus")) return "/menu/headers/cafes.webp";
  if (n.includes("helad") || n.includes("sabor") || n.includes("pote") || n.includes("cucurucho")) return "/menu/headers/helados.webp";
  if (n.includes("torta") || n.includes("merienda") || n.includes("desayun") || n.includes("bakery") || n.includes("panad")) return "/menu/headers/tortas.webp";
  return "/menu/headers/cafes.webp";
}

function getCategoryCardImage(c) {
  if (c.image) return c.image;
  const n = (c.name || "").toLowerCase();
  if (n.includes("bebid")) return "/menu/bebidas.webp";
  if (n.includes("golosin") || n.includes("gomita") || n.includes("caramel") || n.includes("chicle")) return "/menu/golosinas.webp";
  if (n.includes("comida") || n.includes("pizza") || n.includes("cena")) return "/menu/pizza.webp";
  if (n.includes("helad")) return "/menu/helados.webp";
  if (n.includes("torta")) return "/menu/tortas.webp";
  if (n.includes("caf")) return "/menu/meriendas.webp";
  return "/menu/bebidas.webp";
}

export default function DigitalMenu({ table }) {
  useEffect(() => {
    document.body.classList.add("public-menu-page");
    return () => document.body.classList.remove("public-menu-page");
  }, []);

  const s = useStore();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [selected]);
  const [cart, setCartState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nf.public.cart." + table) || "[]");
    } catch {
      return [];
    }
  });
  const [product, setProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);

  const setCart = (c) => {
    localStorage.setItem("nf.public.cart." + table, JSON.stringify(c));
    setCartState(c);
  };

  const handleQuickAdd = (p) => {
    const existingIndex = cart.findIndex(
      (item) =>
        (item.productId === p.id || item.product === p.id) &&
        !item.size &&
        !item.flavors?.length &&
        !item.extras?.length &&
        !item.notes
    );
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          productId: p.id,
          product: p.id,
          name: p.name,
          quantity: 1,
          size: null,
          flavors: [],
          extras: [],
          notes: "",
          unitPrice: p.price || 0,
        },
      ]);
    }
  };

  const cat = s.catalog.categories.find((c) => c.id === selected);

  if (s.error) {
    return (
      <main className="digital-menu">
        <h1>No pudimos consultar el menú</h1>
        <p role="alert">{s.error}</p>
        <p>Consultá a la moza mientras se restablece el servicio.</p>
      </main>
    );
  }

  const products = cat
    ? s.catalog.products.filter(
        (p) => p.category === cat.name || p.publicCategories?.includes(cat.id)
      )
    : [];

  const totalItemsCount = cart.reduce((n, i) => n + i.quantity, 0);
  const totalCartAmount = cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0);

  return (
    <main className="digital-menu">
      <div className="menu-top-bar">
        <span className="menu-table">
          <span className="table-pulse-dot" /> Estás en la mesa {table}
        </span>
      </div>

      {!cat ? (
        <>
          <div className="digital-brand-center">
            <img
              src="/brand/logo.png"
              alt="NaniFer Café Bar - Heladería"
              className="digital-hero-logo"
            />
          </div>

          <div className="digital-intro">
            <span className="eyebrow">CARTA DIGITAL · BIENVENIDOS</span>
            <h1>
              Un ratito para<br />
              <em>disfrutar.</em>
            </h1>
            <blockquote className="digital-quote">
              «Los mejores momentos se viven, se sienten y se comparten ♡»
            </blockquote>
            <span className="digital-subtitle">
              CAFETERÍA DE ESPECIALIDAD · HELADERÍA ARTESANAL · DELICIAS
            </span>
            <p>
              Elegí una categoría para explorar nuestra carta.<br />
              Armá tu pedido a tu gusto o llamá a la moza.
            </p>
          </div>

          <div className="menu-section-title">
            <span>NUESTRA CARTA</span>
            <h2>¿Qué te gustaría disfrutar hoy?</h2>
          </div>

          <div className="digital-categories">
            {s.catalog.categories.map((c) => (
              <button
                className="digital-category"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <div className="category-photo">
                  <Photo
                    src={getCategoryCardImage(c)}
                    alt={c.name}
                  />
                </div>
                <span>
                  <span>
                    <small>DESCUBRÍ</small>
                    {c.name}
                  </span>
                  <span className="category-arrow" aria-hidden="true">
                    ↗
                  </span>
                </span>
              </button>
            ))}
          </div>

          {!s.catalog.categories.length && (
            <p className="note">
              La carta todavía no tiene categorías visibles. Consultá a la moza.
            </p>
          )}
        </>
      ) : (
        <div className="editorial-view">
          <div className="editorial-nav">
            <button
              className="secondary editorial-back-btn"
              onClick={() => setSelected(null)}
            >
              ← Volver a la carta
            </button>
            <span className="editorial-table-chip">Mesa {table}</span>
          </div>

          <article className="editorial-card">
            <div className="editorial-header">
              <div className="editorial-header-text">
                <span className="editorial-script-eyebrow">menu</span>
                <h1 className="editorial-title">{cat.name.replace(/\//g, " / ").toUpperCase()}</h1>
                <div className="editorial-brand-stamp">
                  <span className="stamp-sub">NANIFER</span>
                  <span className="stamp-main">CAFÉ BAR · HELADERÍA</span>
                </div>
                {cat.note && <aside className="editorial-cat-note">{cat.note}</aside>}
              </div>

              <div className="editorial-art-composition">
                <img
                  src={getCategoryHeaderImage(cat.name)}
                  alt={cat.name}
                  className="editorial-art-img"
                  fetchPriority="high"
                />
              </div>
            </div>

            <div className="editorial-products-list">
              {products.map((p) => {
                const hasOptions = (p.sizes?.length > 0) || (p.extras?.length > 0);
                return (
                  <div
                    key={p.id}
                    className={`editorial-product-row ${!p.available ? "unavailable" : ""}`}
                    onClick={() => {
                      if (!p.available) return;
                      if (hasOptions) setProduct(p);
                      else handleQuickAdd(p);
                    }}
                  >
                    <div className="editorial-item-info">
                      <div className="editorial-title-line">
                        <h2 className="editorial-product-name">{p.name.toUpperCase()}</h2>
                        <span className="editorial-dots" aria-hidden="true" />
                        <span className="editorial-price">
                          {p.pricePending ? "Consultar" : money(p.price)}
                        </span>
                      </div>

                      {p.description && (
                        <p className="editorial-product-desc">{p.description}</p>
                      )}

                      {p.sizes?.length > 0 && (
                        <div className="editorial-sizes-pills">
                          {p.sizes.map((z) => (
                            <span key={z.name} className="editorial-size-tag">
                              {z.name} {z.salePrice != null ? money(z.salePrice) : z.price ? "(+" + money(z.price) + ")" : ""}
                            </span>
                          ))}
                        </div>
                      )}

                      {!p.available && !p.pricePending && (
                        <span className="editorial-unavailable-badge">Agotado</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="editorial-add-btn"
                      disabled={!p.available || cart.length >= 50 || !!localStorage.getItem("nf.public.pending." + table)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasOptions) setProduct(p);
                        else handleQuickAdd(p);
                      }}
                      aria-label={`Agregar ${p.name}`}
                      title={hasOptions ? "Personalizar y agregar" : "Agregar 1 al pedido"}
                    >
                      +
                    </button>
                  </div>
                );
              })}

              {!products.length && (
                <p className="editorial-empty-msg">
                  Todavía no hay productos en esta categoría. Consultá a la moza.
                </p>
              )}
            </div>

            {products.some((p) => p.sizes?.some((z) => z.max > 0)) && (
              <section className="editorial-flavors-section">
                <h3>SABORES DISPONIBLES DE HOY</h3>
                <p>
                  {s.catalog.flavors
                    .map((f) => f.name + (f.available ? "" : " (agotado)"))
                    .join(" · ")}
                </p>
              </section>
            )}
          </article>
        </div>
      )}

      {totalItemsCount > 0 && (
        <button
          className="primary public-cart-bar"
          onClick={() => setShowCart(true)}
        >
          <span className="cart-bar-badge">{totalItemsCount}</span>
          <span>Ver mi pedido</span>
          <span className="cart-bar-total">{money(totalCartAmount)}</span>
        </button>
      )}

      {product && (
        <Product
          product={product}
          onClose={() => setProduct(null)}
          onAdd={(i) => {
            setCart([...cart, i]);
            setProduct(null);
          }}
        />
      )}

      {showCart && (
        <PublicCart
          table={table}
          cart={cart}
          setCart={setCart}
          onClose={() => setShowCart(false)}
        />
      )}
    </main>
  );
}
