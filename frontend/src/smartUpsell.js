/**
 * Smart Cross-Selling and Upselling Engine for NaniFer
 * Generates tailored, high-converting product suggestions based on customer choices.
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

export function detectProductType(product) {
  if (!product || isIceCream(product)) return "helados";

  const cat = (product.category || product.categoryId || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();
  const fullText = `${cat} ${name} ${desc}`;

  // Cervezas
  if (
    fullText.includes("cerveza") ||
    fullText.includes("brahma") ||
    fullText.includes("quilmes") ||
    fullText.includes("heineken") ||
    fullText.includes("stella") ||
    fullText.includes("corona") ||
    fullText.includes("miller") ||
    fullText.includes("imperial") ||
    fullText.includes("santa fe") ||
    fullText.includes("warsteiner")
  ) {
    return "cerveza";
  }

  // Tostados (check before generic drinks/comida)
  if (name.includes("tostado") || fullText.includes("tostado")) {
    return "tostado";
  }

  // Gaseosas / Aguas saborizadas
  if (
    name.includes("coca") ||
    name.includes("sprite") ||
    name.includes("fanta") ||
    name.includes("paso de los toros") ||
    name.includes("aquarius") ||
    name.includes("levite") ||
    name.includes("levité") ||
    name.includes("gaseosa")
  ) {
    return "gaseosa";
  }

  // Cafetería e Infusiones
  if (
    fullText.includes("caf") ||
    fullText.includes("cortado") ||
    fullText.includes("latte") ||
    fullText.includes("lagrima") ||
    fullText.includes("lágrima") ||
    fullText.includes("submarino") ||
    fullText.includes("infusi") ||
    fullText.includes("té") ||
    fullText.includes("te ") ||
    fullText.includes("mate cocido") ||
    fullText.includes("cappuccino") ||
    fullText.includes("capuchino") ||
    cat.includes("desayuno") ||
    cat.includes("merienda")
  ) {
    return "cafeteria";
  }

  // Pizzas y Comidas
  if (
    fullText.includes("pizza") ||
    fullText.includes("empanada") ||
    fullText.includes("lomito") ||
    fullText.includes("hamburguesa") ||
    fullText.includes("sandwich") ||
    fullText.includes("sándwich") ||
    fullText.includes("picada") ||
    cat.includes("comida")
  ) {
    return "comida";
  }

  return "other";
}

export function getSmartPairingSuggestions(addedProduct, catalogProducts = [], currentCart = []) {
  if (!addedProduct || isIceCream(addedProduct)) return null;

  const type = detectProductType(addedProduct);
  if (type === "helados" || type === "other") return null;

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
    const candidate = pool.find((p) => !addedIds.has(p.id) && finder(p));
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
        inCart: cartProductIds.has(candidate.id),
      });
    }
  };

  if (type === "cerveza") {
    // 1. Cazuelas (con selección de variedades como Maní, Jamón, Queso)
    addCandidate(
      (p) => p.name.toLowerCase().includes("cazuela"),
      "Para picar 🥜",
      { featuredVariety: "Maní" }
    );
    // 2. Porción de papas con cheddar
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && n.includes("cheddar") && !isKioskPackaged(p);
      },
      "Imperdible 🧀"
    );
    // 3. Porción de papas clásicas
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && !n.includes("cheddar") && !isKioskPackaged(p);
      },
      "Clásico 🍟"
    );
    // 4. Picada o Empanadas como fallback
    addCandidate(
      (p) => p.name.toLowerCase().includes("picada") || p.name.toLowerCase().includes("empanada"),
      "Sale mucho ⭐"
    );

    if (matched.length === 0) return null;
    return {
      title: "¡Ideal para picar con tu cerveza! 🍺🥜",
      subtitle: "Sumá un acompañamiento crujiente con 1 toque:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "gaseosa") {
    // 1. Porción de papas con cheddar o común
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && n.includes("cheddar") && !isKioskPackaged(p);
      },
      "Imperdible 🧀"
    );
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && !n.includes("cheddar") && !isKioskPackaged(p);
      },
      "Clásico 🍟"
    );
    // 2. Cazuelas (ideal Maní)
    addCandidate(
      (p) => p.name.toLowerCase().includes("cazuela"),
      "Para picar 🥜",
      { featuredVariety: "Maní" }
    );
    // 3. Tostado
    addCandidate(
      (p) => p.name.toLowerCase().includes("tostado"),
      "Maridaje ideal 🥪"
    );

    if (matched.length === 0) return null;
    return {
      title: "¿Sale con algo para picar? 🥤🍟",
      subtitle: "Suman un toque perfecto a tu bebida:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "comida") {
    // 1. Cervezas (preferir litro compartida)
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        const isBeer = n.includes("brahma") || n.includes("quilmes") || n.includes("heineken") || n.includes("cerveza");
        const isLarge = n.includes("litro") || n.includes("1 lt") || n.includes("1lt") || n.includes("1l");
        return isBeer && isLarge;
      },
      "Para compartir 🍺"
    );
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return (n.includes("brahma") || n.includes("quilmes") || n.includes("heineken") || n.includes("cerveza")) && !isKioskPackaged(p);
      },
      "Bien fría 🍺"
    );
    // 2. Gaseosa grande
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        const isSoda = n.includes("coca") || n.includes("sprite") || n.includes("gaseosa") || n.includes("fanta");
        const isBig = n.includes("1.5") || n.includes("1,5") || n.includes("1.25") || n.includes("1,25") || n.includes("litro");
        return isSoda && isBig;
      },
      "Bien fría 🥤"
    );
    // 3. Porción de papas con cheddar o papas
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && n.includes("cheddar") && !isKioskPackaged(p);
      },
      "Para la mesa 🧀"
    );
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && !isKioskPackaged(p);
      },
      "Papas fritas 🍟"
    );

    if (matched.length === 0) return null;
    return {
      title: "Maridaje sugerido: ¿Con qué la vas a acompañar? 🍕🍻",
      subtitle: "Bebidas bien frías y acompañamientos ideales:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "cafeteria") {
    // 1. Medialunas
    addCandidate(
      (p) => p.name.toLowerCase().includes("medialuna"),
      "Recién horneada ⭐"
    );
    // 2. Criollos
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return (n.includes("criollo") || n.includes("criollos")) && !isKioskPackaged(p);
      },
      "Crujientes 🥐"
    );
    // 3. Rol de canela
    addCandidate(
      (p) => p.name.toLowerCase().includes("canela") || p.name.toLowerCase().includes("rol"),
      "Dulce tentación ✨"
    );
    // 4. Cheesecake o Brownie
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return (n.includes("cheesecake") || n.includes("brownie") || n.includes("torta")) && !isIceCream(p) && !isKioskPackaged(p);
      },
      "Porción dulce 🍰"
    );

    if (matched.length === 0) return null;
    return {
      title: "Completá tu café con algo rico ☕🥐",
      subtitle: "Elegidos recién salidos para acompañar tu infusión:",
      items: matched.slice(0, 3),
    };
  }

  if (type === "tostado") {
    // 1. Jugo o Licuado
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("jugo") || n.includes("licuado") || n.includes("naranja");
      },
      "Fresco y natural 🍊"
    );
    // 2. Coca o Gaseosa
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("coca") || n.includes("gaseosa") || n.includes("sprite");
      },
      "Bien fría 🥤"
    );
    // 3. Porción de papas
    addCandidate(
      (p) => {
        const n = p.name.toLowerCase();
        return n.includes("papa") && !isKioskPackaged(p);
      },
      "Para acompañar 🍟"
    );

    if (matched.length === 0) return null;
    return {
      title: "¿Con qué vas a acompañar tu tostado? 🥪🥤",
      subtitle: "La combinación clásica para tu mesa:",
      items: matched.slice(0, 3),
    };
  }

  return null;
}
