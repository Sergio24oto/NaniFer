import React, { useState, useEffect, useRef } from "react";
import { useStore, request } from "../store";
import { money, estimate, operationId } from "../domain";
import Product from "./Product";
import PublicCart, { publicDevice } from "./PublicCart";

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

function getProductImage(p, catName = "") {
  if (p.image) return p.image;
  const n = ((p.name || "") + " " + (p.category || catName || "")).toLowerCase();

  // Fotos de bebidas individuales
  if (n.includes("jugo") && n.includes("naranja")) return "/menu/jugo-naranja-vaso.webp";
  if (n.includes("licuado")) return "/menu/licuado.webp";
  if (n.includes("smoothie")) return "/menu/smoothie.webp";
  if (n.includes("batido")) return "/menu/batido.webp";
  if (n.includes("aquarius") && (n.includes("1.5") || n.includes("1,5"))) return "/menu/aquarius-15l.webp";
  if (n.includes("aquarius")) return "/menu/aquarius-500ml.webp";
  if (n.includes("levit") && (n.includes("1.5") || n.includes("1,5"))) return "/menu/levite-15l.webp";
  if (n.includes("levit")) return "/menu/levite-500ml.webp";
  if (n.includes("paso") && (n.includes("1.5") || n.includes("1,5"))) return "/menu/paso-toros-15l.webp";
  if (n.includes("paso") && n.includes("lata")) return "/menu/gaseosa-lata.webp";
  if (n.includes("baggio") && (n.includes("1l") || n.includes("grande") || n.includes("1 l"))) return "/menu/baggio-1l.webp";
  if (n.includes("baggio")) return "/menu/baggio-200ml.webp";
  if (n.includes("citric") && (n.includes("1l") || n.includes("1 l") || n.includes("1000"))) return "/menu/citric-1l.webp";
  if (n.includes("citric")) return "/menu/citric-500ml.webp";
  if (n.includes("cepita") && (n.includes("1.5") || n.includes("1,5"))) return "/menu/cepita-15l.webp";
  if (n.includes("cepita") && (n.includes("1l") || n.includes("1 l"))) return "/menu/cepita-1l.webp";
  if (n.includes("cepita")) return "/menu/cepita-botellita.webp";
  if (n.includes("agua") && (n.includes("1.5") || n.includes("1,5"))) return "/menu/agua-mineral-15l.webp";
  if (n.includes("miller")) return "/menu/miller-1lt.webp";
  if (n.includes("quilmes")) return "/menu/quilmes-1lt.webp";
  if (n.includes("warsteiner")) return "/menu/warsteiner-1lt.webp";
  if (n.includes("heineken") && (n.includes("lat") || n.includes("710"))) return "/menu/heineken-laton.webp";
  if (n.includes("heineken")) return "/menu/heineken-1lt.webp";
  if (n.includes("brahma") && (n.includes("lat") || n.includes("473"))) return "/menu/brahma-lata.webp";
  if (n.includes("brahma")) return "/menu/brahma-1lt.webp";
  if (n.includes("corona") && (n.includes("lat") || n.includes("473"))) return "/menu/corona-lata.webp";
  if (n.includes("corona")) return "/menu/corona-botellita.webp";
  if (n.includes("imperial")) return "/menu/imperial-golden.webp";
  if (n.includes("gaseosa") && (n.includes("1.25") || n.includes("vidrio"))) return "/menu/gaseosa-vidrio.webp";
  if (n.includes("gaseosa") && n.includes("500")) return "/menu/gaseosa-500ml.webp";
  if (n.includes("gaseosa") && n.includes("lata")) return "/menu/gaseosa-lata.webp";

  // Fallbacks generales
  if (n.includes("helad") || n.includes("bocha") || n.includes("copa")) return "/menu/helados.webp";
  if (n.includes("torta") || n.includes("dulce") || n.includes("postre") || n.includes("brownie") || n.includes("chocolat")) return "/menu/tortas.webp";
  if (n.includes("pizza") || n.includes("tostad") || n.includes("sandwich") || n.includes("comid") || n.includes("hamburguesa") || n.includes("empanada") || n.includes("picada")) return "/menu/pizza.webp";
  if (n.includes("caf") || n.includes("cortado") || n.includes("latte") || n.includes("submarino") || n.includes("capuchino")) return "/menu/coffebreak.jpg";
  if (n.includes("meriend") || n.includes("medialuna") || n.includes("croissant") || n.includes("desayun")) return "/menu/meriendas.webp";
  if (n.includes("bebid") || n.includes("gaseosa") || n.includes("cerveza") || n.includes("agua") || n.includes("jugo") || n.includes("lata") || n.includes("litro")) return "/menu/bebidas.webp";
  if (n.includes("golosin") || n.includes("kiosco") || n.includes("caramel") || n.includes("alfajor")) return "/menu/golosinas.webp";
  return getCategoryCardImage({ name: catName || p.category });
}

const BEVERAGE_SECTIONS = [
  {
    id: "gaseosas",
    icon: "🥤",
    shortLabel: "Gaseosas y Aguas",
    eyebrow: "REFRESCOS Y AGUAS",
    title: "GASEOSAS, AGUAS Y SABORIZADAS",
    subtitle: "Línea de gaseosas, aguas minerales, Paso de los Toros, Aquarius y Levité.",
  },
  {
    id: "jugos",
    icon: "🍊",
    shortLabel: "Jugos y Licuados",
    eyebrow: "FRUTALES Y NATURALES",
    title: "JUGOS, LICUADOS Y BATIDOS",
    subtitle: "Exprimidos naturales, licuados, batidos, smoothies, Citric, Cepita y Baggio.",
  },
  {
    id: "cervezas",
    icon: "🍺",
    shortLabel: "Cervezas y Aperitivos",
    eyebrow: "PORRONES, LATAS Y APERITIVOS",
    title: "CERVEZAS Y BEBIDAS CON ALCOHOL",
    subtitle: "Latas 473ml, latones 710ml, porrones individuales, sin alcohol y aperitivos.",
  },
  {
    id: "cervezas-litro",
    icon: "🍻",
    shortLabel: "Cervezas 1 Litro",
    eyebrow: "PARA COMPARTIR",
    title: "CERVEZAS DE LITRO",
    subtitle: "Botellas de 1 litro bien heladas para compartir en la mesa.",
  },
];

function getBeverageSectionId(p) {
  const id = (p.id || "").toLowerCase();
  const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();

  if (id.startsWith("beb-litro-") || (text.includes("litro") && /brahma|miller|heineken|warsteiner|quilmes|stella|corona|imperial|santa fe|cerveza|andes|patagonia/.test(text))) {
    return "cervezas-litro";
  }
  if (/brahma|corona|stella|quilmes|miller|heineken|imperial|santa fe|warsteiner|patagonia|andes|cerveza|porrón|porron|latón|laton|473|710|stout|golden|lager|ipa|fernet|granadina|aperitivo|vino|sidra|gin|campari/.test(text)) {
    return "cervezas";
  }
  if (/jugo|licuado|batido|smoothie|limonada|citric|cepita|baggio|chocolatada|ilolay|exprimido/.test(text)) {
    return "jugos";
  }
  return "gaseosas";
}

export default function DigitalMenu({ table }) {
  useEffect(() => {
    document.body.classList.add("public-menu-page");
    return () => document.body.classList.remove("public-menu-page");
  }, []);

  const s = useStore();
  const [selected, setSelected] = useState(null);
  const [subFilter, setSubFilter] = useState("all");
  const [swipeProgress, setSwipeProgress] = useState(0);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0, fromEdge: false });

  const handleBack = () => {
    if (window.history.state && window.history.state.category) {
      window.history.back();
    } else {
      setSelected(null);
    }
  };

  const openCategory = (catId) => {
    setSelected(catId);
    try {
      window.history.pushState({ category: catId }, "");
    } catch {}
  };

  useEffect(() => {
    const onPopState = (e) => {
      if (!e.state?.category) {
        setSelected(null);
      } else {
        setSelected(e.state.category);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTouchStart = (e) => {
    if (!selected) return;
    const touch = e.touches[0];
    const fromEdge = touch.clientX <= 55;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      fromEdge,
    };
  };

  const handleTouchMove = (e) => {
    if (!selected || !touchStartRef.current.fromEdge) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (deltaX > 8 && Math.abs(deltaY) < 45) {
      const progress = Math.min(1, Math.max(0, deltaX / 110));
      setSwipeProgress(progress);
    } else if (Math.abs(deltaY) > 35) {
      touchStartRef.current.fromEdge = false;
      setSwipeProgress(0);
    }
  };

  const handleTouchEnd = (e) => {
    if (!selected || !touchStartRef.current.fromEdge) {
      setSwipeProgress(0);
      return;
    }
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    if (
      (deltaX > 55 || (deltaX > 30 && elapsed < 250)) &&
      Math.abs(deltaY) < 55
    ) {
      handleBack();
    }
    touchStartRef.current.fromEdge = false;
    setSwipeProgress(0);
  };

  useEffect(() => {
    setSubFilter("all");
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
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [waiterNotified, setWaiterNotified] = useState(false);
  const [callError, setCallError] = useState("");

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

  const setCart = (c) => {
    localStorage.setItem("nf.public.cart." + table, JSON.stringify(c));
    setCartState(c);
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
    <main
      className="digital-menu"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {selected && (
        <button
          type="button"
          className="floating-ios-back-btn"
          onClick={handleBack}
          aria-label="Volver a la carta"
          title="Volver a la carta"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="floating-back-text">Carta</span>
        </button>
      )}

      {selected && swipeProgress > 0 && (
        <div
          className="ios-swipe-back-indicator"
          style={{
            opacity: Math.min(1, swipeProgress * 1.5),
            transform: `translateY(-50%) translateX(${Math.min(24, swipeProgress * 24)}px)`,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </div>
      )}

      <div className="menu-top-bar">
        <span className="menu-table">
          <span className="table-pulse-dot" /> Estás en la mesa {table}
        </span>
        <button
          type="button"
          className={"call-waiter-nav-btn" + (waiterNotified ? " success" : "")}
          onClick={handleCallWaiter}
          disabled={callingWaiter}
          title="Avisar a la moza para que se acerque a tu mesa"
        >
          {callingWaiter ? "Avisando…" : waiterNotified ? "✓ ¡Moza avisada!" : "🛎️ Llamar a la moza"}
        </button>
      </div>

      {waiterNotified && (
        <div className="waiter-notified-banner" role="status">
          🛎️ <strong>¡La moza fue avisada!</strong> En breve se acercará a la mesa {table}.
        </div>
      )}
      {callError && (
        <div className="waiter-error-banner" role="alert">
          ⚠️ {callError}
        </div>
      )}

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
                onClick={() => openCategory(c.id)}
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
              onClick={handleBack}
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

            {(() => {
              const isBebidas = (cat.name || "").toLowerCase().includes("bebid");
              const renderProductRow = (p) => {
                const hasOptions = (p.sizes?.length > 0) || (p.extras?.length > 0) || (p.flavorOptions?.length > 0);
                const prodImg = getProductImage(p, cat.name);
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
                    <div className="editorial-product-thumb">
                      <img
                        src={prodImg}
                        alt={p.name}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          if (prodImg && prodImg.startsWith("/menu/") && !prodImg.startsWith("/menu/headers/")) {
                            const filename = prodImg.replace("/menu/", "");
                            e.currentTarget.src = "/api/uploads/menu/" + filename;
                            return;
                          }
                          e.currentTarget.src = getCategoryCardImage({ name: cat?.name || p.category });
                        }}
                      />
                    </div>

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
                              {z.name}{" "}
                              {z.salePrice != null
                                ? p.price != null && Number(z.salePrice) === Number(p.price)
                                  ? ""
                                  : p.price != null && Number(z.salePrice) > Number(p.price)
                                  ? "(+" + money(Number(z.salePrice) - Number(p.price)) + ")"
                                  : money(z.salePrice)
                                : z.price
                                ? "(+" + money(z.price) + ")"
                                : ""}
                            </span>
                          ))}
                        </div>
                      )}

                      {p.flavorOptions?.length > 0 && (
                        <div className="editorial-sizes-pills">
                          <span className="editorial-size-tag" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>
                            Sabores: {p.flavorOptions.join(" · ")}
                          </span>
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
              };

              if (!isBebidas) {
                return (
                  <div className="editorial-products-list">
                    {products.map(renderProductRow)}
                    {!products.length && (
                      <p className="editorial-empty-msg">
                        Todavía no hay productos en esta categoría. Consultá a la moza.
                      </p>
                    )}
                  </div>
                );
              }

              const groupedSections = BEVERAGE_SECTIONS.map((sec) => ({
                ...sec,
                items: products.filter((p) => getBeverageSectionId(p) === sec.id),
              })).filter((sec) => sec.items.length > 0);

              const visibleSections =
                subFilter === "all"
                  ? groupedSections
                  : groupedSections.filter((sec) => sec.id === subFilter);

              return (
                <>
                  {groupedSections.length > 1 && (
                    <nav className="editorial-subnav" aria-label="Subcategorías de bebidas">
                      <span className="editorial-subnav-label">IR RÁPIDO A SECCIÓN:</span>
                      <div className="editorial-subnav-pills">
                        <button
                          type="button"
                          className={`editorial-subnav-pill ${subFilter === "all" ? "active" : ""}`}
                          onClick={() => setSubFilter("all")}
                        >
                          <span className="subnav-pill-icon">✨</span>
                          <span>Ver todas ({products.length})</span>
                        </button>
                        {groupedSections.map((sec) => (
                          <button
                            key={sec.id}
                            type="button"
                            className={`editorial-subnav-pill ${subFilter === sec.id ? "active" : ""}`}
                            onClick={() => setSubFilter(sec.id)}
                          >
                            <span className="subnav-pill-icon">{sec.icon}</span>
                            <span>{sec.shortLabel}</span>
                            <small className="subnav-pill-count">{sec.items.length}</small>
                          </button>
                        ))}
                      </div>
                    </nav>
                  )}

                  <div className="editorial-subsections-container">
                    {visibleSections.map((sec) => (
                      <section key={sec.id} className="editorial-subsection" id={`sec-${sec.id}`}>
                        <div className="editorial-subsection-banner">
                          <div className="editorial-subsection-badge" aria-hidden="true">
                            {sec.icon}
                          </div>
                          <div className="editorial-subsection-titles">
                            <span className="editorial-subsection-eyebrow">{sec.eyebrow}</span>
                            <h2 className="editorial-subsection-title">{sec.title}</h2>
                            <p className="editorial-subsection-subtitle">{sec.subtitle}</p>
                          </div>
                        </div>
                        <div className="editorial-products-list">
                          {sec.items.map(renderProductRow)}
                        </div>
                      </section>
                    ))}

                    {!products.length && (
                      <p className="editorial-empty-msg">
                        Todavía no hay productos en esta categoría. Consultá a la moza.
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

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
          onAdd={(res) => {
            const list = Array.isArray(res) ? res : [res];
            let updated = [...cart];
            for (const i of list) {
              const existingIndex = updated.findIndex(
                (item) =>
                  (item.productId === i.productId || item.product === i.productId) &&
                  item.size === i.size &&
                  JSON.stringify(item.flavors || []) === JSON.stringify(i.flavors || []) &&
                  JSON.stringify(item.extras || []) === JSON.stringify(i.extras || []) &&
                  (item.notes || "") === (i.notes || "")
              );
              if (existingIndex >= 0) {
                updated[existingIndex].quantity += i.quantity;
              } else {
                updated.push(i);
              }
            }
            setCart(updated);
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
