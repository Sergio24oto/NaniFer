import React, { useState, useEffect, useMemo } from "react";
import { Search, LayoutGrid, List, Plus, Info, Store, X, PhoneCall } from "lucide-react";
import { useStore, request } from "../store";
import { money, operationId } from "../domain";
import { Modal } from "../components";
import Product from "./Product";
import PublicCart, { publicDevice } from "./PublicCart";
import "../olaclick-menu.css";

function getProductImage(p, catName = "") {
  if (p.image) return p.image;
  const n = (p.name + " " + (p.category || catName)).toLowerCase();
  if (n.includes("helad") || n.includes("bocha") || n.includes("copa")) return "/menu/helados.webp";
  if (n.includes("torta") || n.includes("dulce") || n.includes("postre") || n.includes("brownie") || n.includes("chocolat")) return "/menu/tortas.webp";
  if (n.includes("pizza") || n.includes("tostad") || n.includes("sandwich") || n.includes("comid") || n.includes("hamburguesa") || n.includes("cena")) return "/menu/pizza.webp";
  if (n.includes("caf") || n.includes("cortado") || n.includes("latte") || n.includes("submarino") || n.includes("capuchino")) return "/menu/coffebreak.jpg";
  if (n.includes("meriend") || n.includes("medialuna") || n.includes("croissant") || n.includes("desayun")) return "/menu/meriendas.webp";
  if (n.includes("bebid") || n.includes("gaseosa") || n.includes("cerveza") || n.includes("agua") || n.includes("jugo") || n.includes("lata") || n.includes("litro")) return "/menu/bebidas.webp";
  if (n.includes("golosin") || n.includes("kiosco") || n.includes("caramel") || n.includes("alfajor")) return "/menu/golosinas.webp";
  return "/menu/nanifer.webp";
}

export default function DigitalMenu({ table }) {
  const s = useStore();
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [cart, setCartState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nf.public.cart." + table) || "[]");
    } catch {
      return [];
    }
  });

  const [product, setProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [waiterNotified, setWaiterNotified] = useState(false);
  const [callError, setCallError] = useState("");

  const setCart = (c) => {
    localStorage.setItem("nf.public.cart." + table, JSON.stringify(c));
    setCartState(c);
  };

  const handleCallWaiter = async () => {
    if (callingWaiter) return;
    setCallingWaiter(true);
    setCallError("");
    try {
      const key = operationId();
      await request("/public/qr/" + table + "/call", {
        method: "POST",
        key,
        body: {},
        device: publicDevice(),
      });
      setWaiterNotified(true);
      setTimeout(() => setWaiterNotified(false), 8000);
    } catch (e) {
      setCallError(e.message || "No se pudo avisar a la moza. Por favor intentá nuevamente.");
      setTimeout(() => setCallError(""), 6000);
    } finally {
      setCallingWaiter(false);
    }
  };

  const getProductCartQty = (p) => {
    return cart
      .filter((item) => item.productId === p.id || item.product === p.id)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const handleQuickAdd = (p) => {
    if ((p.flavorOptions || []).length > 0 || (p.sizes || []).length > 0 || (p.extras || []).length > 0) {
      setProduct(p);
      return;
    }
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

  const handleItemClick = (p) => {
    if (!p.available) return;
    const hasOptions = (p.sizes?.length > 0) || (p.extras?.length > 0) || (p.flavorOptions?.length > 0);
    if (hasOptions) {
      setProduct(p);
    } else {
      handleQuickAdd(p);
    }
  };

  const normalize = (t) =>
    (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const totalItemsCount = cart.reduce((n, i) => n + i.quantity, 0);
  const totalCartAmount = cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0);

  const categories = useStore().catalog.categories || [];
  const allProducts = useStore().catalog.products || [];

  // Filtered by search
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = normalize(search.trim());
    return allProducts.filter((p) => {
      const inName = normalize(p.name).includes(q);
      const inCat = normalize(p.category).includes(q);
      const inDesc = normalize(p.description).includes(q);
      const inSizes = (p.sizes || []).some((z) => normalize(z.name).includes(q));
      return inName || inCat || inDesc || inSizes;
    });
  }, [allProducts, search]);

  // Featured products (top 4 items with image or from first category)
  const featuredProducts = useMemo(() => {
    return allProducts.slice(0, 4);
  }, [allProducts]);

  if (s.error) {
    return (
      <main className="olaclick-menu-page">
        <div className="olaclick-container" style={{ padding: "40px 20px", textAlign: "center" }}>
          <h2>No pudimos consultar el menú</h2>
          <p role="alert" style={{ color: "#ef4444", margin: "14px 0" }}>{s.error}</p>
          <p>Consultá a la moza mientras se restablece el servicio.</p>
        </div>
      </main>
    );
  }

  const renderGridCard = (p, catName = "") => {
    const hasOptions = (p.sizes?.length > 0) || (p.extras?.length > 0) || (p.flavorOptions?.length > 0);
    const inCartQty = getProductCartQty(p);
    return (
      <article className="olaclick-card" key={p.id} onClick={() => handleItemClick(p)}>
        <div className="olaclick-card-photo-wrap">
          <img src={getProductImage(p, catName)} alt={p.name} loading="lazy" />
          <button
            type="button"
            className={`olaclick-float-btn ${inCartQty > 0 ? "in-cart" : "empty"}`}
            onClick={(e) => {
              e.stopPropagation();
              handleItemClick(p);
            }}
            aria-label={`Agregar ${p.name}`}
            title={hasOptions ? "Ver opciones" : "Agregar 1 al pedido"}
          >
            {inCartQty > 0 ? inCartQty : <Plus size={18} />}
          </button>
        </div>
        <div className="olaclick-card-info">
          <div className="olaclick-card-price">
            {p.pricePending ? "Consultar" : (p.sizes?.length > 0 ? "Desde " : "") + money(p.price)}
          </div>
          <div className="olaclick-card-name">{p.name}</div>
          {hasOptions && <span className="olaclick-card-options-tag">Opciones disponibles</span>}
        </div>
      </article>
    );
  };

  const renderListRow = (p, catName = "") => {
    const hasOptions = (p.sizes?.length > 0) || (p.extras?.length > 0) || (p.flavorOptions?.length > 0);
    const inCartQty = getProductCartQty(p);
    return (
      <article className="olaclick-list-row" key={p.id} onClick={() => handleItemClick(p)}>
        <div className="olaclick-list-info">
          <h3 className="olaclick-list-title">{p.name}</h3>
          {p.description && <p className="olaclick-list-desc">{p.description}</p>}
          <div className="olaclick-list-price">
            {p.pricePending ? "Consultar" : (p.sizes?.length > 0 ? "Desde " : "") + money(p.price)}
          </div>
          {p.sizes?.length > 0 && (
            <div className="olaclick-list-variants-pills">
              {p.sizes.map((z) => (
                <span key={z.name} className="olaclick-variant-pill">
                  {z.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="olaclick-list-photo-wrap">
          <img src={getProductImage(p, catName)} alt={p.name} loading="lazy" />
          <button
            type="button"
            className={`olaclick-float-btn ${inCartQty > 0 ? "in-cart" : "empty"}`}
            onClick={(e) => {
              e.stopPropagation();
              handleItemClick(p);
            }}
            aria-label={`Agregar ${p.name}`}
          >
            {inCartQty > 0 ? inCartQty : <Plus size={16} />}
          </button>
        </div>
      </article>
    );
  };

  return (
    <main className="olaclick-menu-page">
      <div className="olaclick-container">
        {/* Header estilo OlaClick */}
        <header className="olaclick-header">
          <div className="olaclick-store-badge">
            <Store size={28} />
          </div>
          <h1 className="olaclick-store-title">NaniFer</h1>
          <span className="olaclick-table-pill">Mesa {table}</span>
          <button
            type="button"
            className="olaclick-info-btn"
            onClick={() => setShowInfo(true)}
          >
            <Info size={15} />
            Información
          </button>
        </header>

        {/* Notificaciones de moza */}
        {waiterNotified && (
          <aside className="olaclick-waiter-banner" role="status">
            <span>🛎️ ¡La moza fue avisada! Se acercará a tu mesa.</span>
          </aside>
        )}
        {callError && (
          <aside className="olaclick-waiter-banner error" role="alert">
            <span>⚠️ {callError}</span>
          </aside>
        )}

        {/* Barra fija de navegación: Búsqueda + Selector de Vista + Pestañas de categorías */}
        <div className="olaclick-sticky-nav">
          <div className="olaclick-controls-row">
            <button
              type="button"
              className={`olaclick-icon-btn ${showSearch ? "active" : ""}`}
              onClick={() => {
                setShowSearch((prev) => !prev);
                if (showSearch) setSearch("");
              }}
              aria-label="Buscar"
              title="Buscar en la carta"
            >
              <Search size={18} />
            </button>

            <button
              type="button"
              className="olaclick-icon-btn"
              onClick={() => setViewMode((prev) => (prev === "grid" ? "list" : "grid"))}
              aria-label={viewMode === "grid" ? "Ver en lista" : "Ver en cuadrícula"}
              title={viewMode === "grid" ? "Cambiar a vista lista" : "Cambiar a vista cuadrícula"}
            >
              {viewMode === "grid" ? <List size={18} /> : <LayoutGrid size={18} />}
            </button>

            <button
              type="button"
              className={`olaclick-call-waiter-btn ${waiterNotified ? "active" : ""}`}
              onClick={handleCallWaiter}
              disabled={callingWaiter}
            >
              <PhoneCall size={14} />
              {callingWaiter ? "Llamando…" : waiterNotified ? "Moza avisada" : "Llamar moza"}
            </button>
          </div>

          {showSearch && (
            <div className="olaclick-search-wrap">
              <div className="olaclick-search-input-box">
                <input
                  type="search"
                  placeholder="Buscar en la carta (ej: café, tostado, cerveza)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    className="olaclick-search-clear"
                    onClick={() => setSearch("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Selector de Categorías Horizontal */}
          {!search && (
            <nav className="olaclick-tabs-scroll" aria-label="Categorías">
              <button
                type="button"
                className={`olaclick-tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                Destacados
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`olaclick-tab-btn ${activeTab === c.id ? "active" : ""}`}
                  onClick={() => setActiveTab(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Contenido de Productos */}
        <div className="olaclick-content">
          {/* Vista de Búsqueda */}
          {searchResults !== null ? (
            <section className="olaclick-section">
              <h2 className="olaclick-section-title">Resultados de búsqueda ({searchResults.length})</h2>
              {searchResults.length === 0 ? (
                <p className="olaclick-empty-msg">No encontramos productos con esa búsqueda.</p>
              ) : viewMode === "grid" ? (
                <div className="olaclick-grid">
                  {searchResults.map((p) => renderGridCard(p))}
                </div>
              ) : (
                <div className="olaclick-list">
                  {searchResults.map((p) => renderListRow(p))}
                </div>
              )}
            </section>
          ) : activeTab === "all" ? (
            /* Vista General: Destacados + Todas las Categorías */
            <>
              {featuredProducts.length > 0 && (
                <section className="olaclick-section">
                  <h2 className="olaclick-section-title">Destacados</h2>
                  <div className="olaclick-grid">
                    {featuredProducts.map((p) => renderGridCard(p))}
                  </div>
                </section>
              )}

              {categories.map((c) => {
                const prods = allProducts.filter(
                  (p) => p.category === c.name || p.publicCategories?.includes(c.id)
                );
                if (!prods.length) return null;
                return (
                  <section className="olaclick-section" key={c.id}>
                    <h2 className="olaclick-section-title">{c.name}</h2>
                    {viewMode === "grid" ? (
                      <div className="olaclick-grid">
                        {prods.map((p) => renderGridCard(p, c.name))}
                      </div>
                    ) : (
                      <div className="olaclick-list">
                        {prods.map((p) => renderListRow(p, c.name))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          ) : (
            /* Vista de Categoría Específica */
            (() => {
              const currentCat = categories.find((c) => c.id === activeTab);
              const prods = allProducts.filter(
                (p) => p.category === currentCat?.name || p.publicCategories?.includes(activeTab)
              );
              return (
                <section className="olaclick-section">
                  <h2 className="olaclick-section-title">{currentCat?.name || "Productos"}</h2>
                  {prods.length === 0 ? (
                    <p className="olaclick-empty-msg">No hay productos disponibles en esta categoría.</p>
                  ) : viewMode === "grid" ? (
                    <div className="olaclick-grid">
                      {prods.map((p) => renderGridCard(p, currentCat?.name))}
                    </div>
                  ) : (
                    <div className="olaclick-list">
                      {prods.map((p) => renderListRow(p, currentCat?.name))}
                    </div>
                  )}
                </section>
              );
            })()
          )}
        </div>

        {/* Barra Inferior Fija ("Ver mi pedido") estilo OlaClick */}
        {totalItemsCount > 0 && (
          <aside className="olaclick-bottom-bar">
            <div className="olaclick-bottom-inner">
              <div className="olaclick-bottom-summary">
                <span className="olaclick-bottom-count">
                  {totalItemsCount} {totalItemsCount === 1 ? "producto" : "productos"}
                </span>
                <span className="olaclick-bottom-total">{money(totalCartAmount)}</span>
              </div>
              <button
                type="button"
                className="olaclick-bottom-btn"
                onClick={() => setShowCart(true)}
              >
                Ver mi pedido
              </button>
            </div>
          </aside>
        )}

        {/* Modal de Información */}
        {showInfo && (
          <Modal title="NaniFer Café Bar & Heladería" onClose={() => setShowInfo(false)}>
            <div className="olaclick-info-modal-content">
              <div className="olaclick-info-item">
                <Store size={20} style={{ color: "#2563eb", marginTop: "2px" }} />
                <div>
                  <strong>Salón y Atención</strong>
                  <p>Mesa {table} activa. Podés armar tu pedido desde esta carta o llamar a la moza en cualquier momento.</p>
                </div>
              </div>

              <div className="olaclick-info-item">
                <PhoneCall size={20} style={{ color: "#16a34a", marginTop: "2px" }} />
                <div>
                  <strong>Servicio de Mesa</strong>
                  <p>¿Necesitás algo? Presioná el botón de llamar moza y nos acercamos al instante.</p>
                  <button
                    type="button"
                    className="primary"
                    style={{ marginTop: "10px", width: "100%" }}
                    onClick={() => {
                      handleCallWaiter();
                      setShowInfo(false);
                    }}
                    disabled={callingWaiter}
                  >
                    🛎️ Llamar a la moza ahora
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal de Personalización de Producto */}
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

        {/* Modal / Drawer del Carrito */}
        {showCart && (
          <PublicCart
            table={table}
            cart={cart}
            setCart={setCart}
            onClose={() => setShowCart(false)}
          />
        )}
      </div>
    </main>
  );
}
