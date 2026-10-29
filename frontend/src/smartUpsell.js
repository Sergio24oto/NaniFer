/**
 * Smart Cross-Selling and Upselling Engine for NaniFer
 * Generates tailored, high-converting product suggestions based on customer choices
 * strictly on strategic trigger products without annoying the user.
 */

function isIceCream(product) {
  if (!product) return false;
  const id = (product.id || "").toLowerCase();
  const cat = (product.category || product.categoryId || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  return (
    id.startsWith("hel-") ||
    cat.includes("helad") ||
    name.includes("helad") ||
    name.includes("bocha") ||
    name.includes("cucurucho") ||
    name.includes("almendrado") ||
    name.includes("palito")
  );
}

function isKioskPackaged(product) {
  if (!product) return false;
  const id = (product.id || "").toLowerCase();
  return id.startsWith("kiosco-");
}

export function isProductBeer(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""} ${p.category || ""}`.toLowerCase();
  return (
    text.includes("cerveza") ||
    text.includes("brahma") ||
    text.includes("quilmes") ||
    text.includes("heineken") ||
    text.includes("stella") ||
    text.includes("corona") ||
    text.includes("miller") ||
    text.includes("imperial") ||
    text.includes("santa fe") ||
    text.includes("warsteiner")
  );
}

export function isProductSoda(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return (
    text.includes("coca") ||
    text.includes("sprite") ||
    text.includes("fanta") ||
    text.includes("paso de los toros") ||
    text.includes("gaseosa")
  );
}

export function isProductLevite(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return (
    text.includes("levite") ||
    text.includes("levité") ||
    text.includes("aquarius") ||
    text.includes("saborizada")
  );
}

export function isProductPapas(p) {
  if (!p || isIceCream(p) || isKioskPackaged(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return text.includes("papa");
}

export function isProductCazuela(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return text.includes("cazuela");
}

export function isProductMedialuna(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return text.includes("medialuna") || text.includes("croissant");
}

export function isProductCriollo(p) {
  if (!p || isIceCream(p) || isKioskPackaged(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return text.includes("criollo") || text.includes("criollos");
}

export function isProductSweetBakery(p) {
  if (!p || isIceCream(p) || isKioskPackaged(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return (
    (text.includes("rol") && text.includes("canela")) ||
    text.includes("torta") ||
    text.includes("cheesecake") ||
    text.includes("brownie")
  );
}

export function isProductTostado(p) {
  if (!p || isIceCream(p)) return false;
  const text = `${p.id || ""} ${p.name || ""}`.toLowerCase();
  return text.includes("tostado");
}

/**
 * Checks if the customer's current cart already contains a product matching the predicate.
 */
export function cartHasType(currentCart = [], catalogProducts = [], predicate) {
  if (!Array.isArray(currentCart) || currentCart.length === 0) return false;
  return currentCart.some((item) => {
    const prodId = item.productId || item.product;
    const catProd = (catalogProducts || []).find((p) => p.id === prodId);
    if (catProd && predicate(catProd)) return true;
    if (item.name && predicate({ id: prodId, name: item.name })) return true;
    return false;
  });
}

/**
 * Detects if the product is one of the 5 STRATEGIC TRIGGER POINTS:
 * 1. picada
 * 2. pizza
 * 3. cerveza
 * 4. licuado
 * 5. cafe
 * Everything else returns "other" (which does not trigger popups).
 */
export function detectProductType(product) {
  if (!product || isIceCream(product)) return "helados";

  const cat = (product.category || product.categoryId || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();

  // 1. Picada
  if (name.includes("picada") || desc.includes("picada")) {
    return "picada";
  }

  // 2. Pizza
  if (name.includes("pizza") || cat.includes("pizza")) {
    return "pizza";
  }

  // 3. Cerveza
  if (isProductBeer(product)) {
    return "cerveza";
  }

  // 4. Licuado y jugos frutales/naturales
  if (
    name.includes("licuado") ||
    name.includes("jugo natural") ||
    name.includes("exprimido") ||
    name.includes("smoothie") ||
    name.includes("batido") ||
    (name.includes("jugo") && (name.includes("naranja") || name.includes("vaso")))
  ) {
    return "licuado";
  }

  // 5. Cafetería (solo distintos tipos de café / infusión de café)
  if (
    name.includes("caf") ||
    name.includes("cortado") ||
    name.includes("latte") ||
    name.includes("lagrima") ||
    name.includes("lágrima") ||
    name.includes("submarino") ||
    name.includes("capuchino") ||
    name.includes("cappuccino") ||
    name.includes("expreso") ||
    name.includes("espresso") ||
    name.includes("americano")
  ) {
    return "cafe";
  }

  return "other";
}

export function getSmartPairingSuggestions(addedProduct, catalogProducts = [], currentCart = []) {
  if (!addedProduct || isIceCream(addedProduct)) return null;

  const type = detectProductType(addedProduct);
  if (!type || type === "helados" || type === "other") return null;

  // Filter available active non-ice products
  const pool = catalogProducts.filter((p) => {
    if (!p || p.id === addedProduct.id) return false;
    if (p.available === false || p.archived) return false;
    if (isIceCream(p)) return false;
    return true;
  });

  const cartProductIds = new Set(
    currentCart.map((i) => i.productId || i.product)
  );

  const matched = [];
  const addedIds = new Set();

  const addCandidate = (finder, tag, options = {}) => {
    const candidate = pool.find((p) => !addedIds.has(p.id) && !cartProductIds.has(p.id) && finder(p));
    if (candidate) {
      addedIds.add(candidate.id);
      const varieties = Array.isArray(candidate.flavorOptions) && candidate.flavorOptions.length > 0
        ? candidate.flavorOptions
        : Array.isArray(candidate.sizes) && candidate.sizes.length > 0
        ? candidate.sizes.map((s) => s.name)
        : [];

      matched.push({
        product: candidate,
        tag: tag || "Recomendado ⭐",
        hasVarieties: varieties.length > 0,
        varieties,
        featuredVariety: options.featuredVariety || (varieties.includes("Maní") ? "Maní" : varieties[0] || null),
        inCart: false,
      });
      return true;
    }
    return false;
  };

  // Pre-calcular qué categorías ya tiene el cliente en su carrito para NO ofrecerlas
  const hasBeerInCart = cartHasType(currentCart, catalogProducts, isProductBeer);
  const hasSodaInCart = cartHasType(currentCart, catalogProducts, isProductSoda);
  const hasLeviteInCart = cartHasType(currentCart, catalogProducts, isProductLevite);
  const hasPapasInCart = cartHasType(currentCart, catalogProducts, isProductPapas);
  const hasCazuelaInCart = cartHasType(currentCart, catalogProducts, isProductCazuela);
  const hasMedialunaInCart = cartHasType(currentCart, catalogProducts, isProductMedialuna);
  const hasCriolloInCart = cartHasType(currentCart, catalogProducts, isProductCriollo);
  const hasSweetBakeryInCart = cartHasType(currentCart, catalogProducts, isProductSweetBakery);
  const hasTostadoInCart = cartHasType(currentCart, catalogProducts, isProductTostado);

  if (type === "pizza") {
    // 1. Cerveza (1 sola opción: preferir litro compartida o fría) - Solo si NO tiene cerveza en carrito
    if (!hasBeerInCart) {
      const addedLarge = addCandidate(
        (p) => {
          const n = p.name.toLowerCase();
          const isBeer = isProductBeer(p);
          const isLarge = n.includes("litro") || n.includes("1 lt") || n.includes("1lt") || n.includes("1l");
          return isBeer && isLarge;
        },
        "Para compartir 🍺"
      );
      if (!addedLarge) {
        addCandidate(
          (p) => isProductBeer(p) && !isKioskPackaged(p),
          "Bien fría 🍺"
        );
      }
    }

    // 2. Gaseosa grande (1 sola opción) - Solo si NO tiene gaseosa en carrito
    if (!hasSodaInCart) {
      const addedBig = addCandidate(
        (p) => {
          const n = p.name.toLowerCase();
          const isSoda = isProductSoda(p);
          const isBig = n.includes("1.5") || n.includes("1,5") || n.includes("1.25") || n.includes("1,25") || n.includes("litro");
          return isSoda && isBig;
        },
        "Bien fría 🥤"
      );
      if (!addedBig) {
        addCandidate(
          (p) => isProductSoda(p),
          "Para refrescar 🥤"
        );
      }
    }

    // 3. Porción de papas (1 sola opción: cheddar o clásica) - Solo si NO tiene papas en carrito
    if (!hasPapasInCart) {
      const addedCheddar = addCandidate(
        (p) => {
          const n = p.name.toLowerCase();
          return isProductPapas(p) && n.includes("cheddar");
        },
        "Para la mesa 🧀"
      );
      if (!addedCheddar) {
        addCandidate(
          (p) => isProductPapas(p),
          "Papas fritas 🍟"
        );
      }
    }

    if (matched.length === 0) return null;
    return {
      title: "Maridaje sugerido: ¿Con qué la vas a acompañar? 🍕🍻",
      subtitle: "Bebidas bien frías y acompañamientos ideales:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "cerveza") {
    // 1. Cazuelas (con selección de variedades como Maní, Jamón, Queso) - Solo si NO tiene cazuela
    if (!hasCazuelaInCart) {
      addCandidate(
        (p) => isProductCazuela(p),
        "Para picar 🥜",
        { featuredVariety: "Maní" }
      );
    }

    // 2. Porción de papas con cheddar o clásicas - Solo si NO tiene papas
    if (!hasPapasInCart) {
      addCandidate(
        (p) => {
          const n = p.name.toLowerCase();
          return isProductPapas(p) && n.includes("cheddar");
        },
        "Imperdible 🧀"
      );
      addCandidate(
        (p) => isProductPapas(p) && !p.name.toLowerCase().includes("cheddar"),
        "Clásico 🍟"
      );
    }

    if (matched.length === 0) return null;
    return {
      title: "¡Ideal para picar con tu cerveza! 🍺🥜",
      subtitle: "Sumá un acompañamiento crujiente con 1 toque:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "cafe") {
    // 1. Medialunas
    if (!hasMedialunaInCart) {
      addCandidate(
        (p) => isProductMedialuna(p),
        "Recién horneada ⭐"
      );
    }

    // 2. Criollos
    if (!hasCriolloInCart) {
      addCandidate(
        (p) => isProductCriollo(p),
        "Crujientes 🥐"
      );
    }

    // 3. Rol de canela o Torta dulce
    if (!hasSweetBakeryInCart) {
      addCandidate(
        (p) => p.name.toLowerCase().includes("canela") || p.name.toLowerCase().includes("rol"),
        "Dulce tentación ✨"
      );
      addCandidate(
        (p) => isProductSweetBakery(p),
        "Porción dulce 🍰"
      );
    }

    if (matched.length === 0) return null;
    return {
      title: "Completá tu café con algo rico ☕🥐",
      subtitle: "Elegidos recién salidos para acompañar tu infusión:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "licuado") {
    // 1. Tostado
    if (!hasTostadoInCart) {
      addCandidate(
        (p) => isProductTostado(p),
        "Maridaje ideal 🥪"
      );
    }

    // 2. Medialunas
    if (!hasMedialunaInCart) {
      addCandidate(
        (p) => isProductMedialuna(p),
        "Recién horneada ⭐"
      );
    }

    // 3. Rol de canela o porción dulce
    if (!hasSweetBakeryInCart) {
      addCandidate(
        (p) => isProductSweetBakery(p),
        "Dulce tentación ✨"
      );
    }

    if (matched.length === 0) return null;
    return {
      title: "¿Con qué vas a acompañar tu licuado? 🥤🥪",
      subtitle: "Combinaciones frescas y ricas para tu momento:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "picada") {
    // 1. Gaseosas - Solo si no tiene gaseosa en carrito
    if (!hasSodaInCart) {
      addCandidate(
        (p) => isProductSoda(p),
        "Bien fría 🥤"
      );
    }

    // 2. Cervezas (bien fría o litro) - Solo si no tiene cerveza en carrito
    if (!hasBeerInCart) {
      addCandidate(
        (p) => isProductBeer(p),
        "Para compartir 🍺"
      );
    }

    // 3. Levité / Aguas saborizadas - Solo si no tiene Levite en carrito
    if (!hasLeviteInCart) {
      addCandidate(
        (p) => isProductLevite(p),
        "Refrescante 🍊"
      );
    }

    if (matched.length === 0) return null;
    return {
      title: "¡Acompañá tu picada con una buena bebida! 🧀🍻",
      subtitle: "Elegí tu bebida favorita para compartir:",
      items: matched.slice(0, 3),
    };
  }

  return null;
}
