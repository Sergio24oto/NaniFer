export const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
export const statuses = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "entregado",
];
export const activeAccount = (s, table) =>
  s.accounts.find((a) => a.table === table && !a.closedAt);
// Persisted amounts are authoritative values returned by FastAPI.
export const totalAccount = (s, id) =>
  s.accounts.find((a) => a.id === id)?.total || 0;
export const time = (d) =>
  new Date(d).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function itemInput(i) {
  const obj = {
    productId: i.productId || i.product || "",
    size: i.size || "",
    flavors: i.flavors || [],
    extras: i.extras || [],
    preparation: i.preparation || "",
    notes: i.notes || "",
    quantity: i.quantity,
  };
  if (i.customPrice != null && Number(i.customPrice) > 0) {
    obj.customPrice = Number(i.customPrice);
  }
  return obj;
}
// Flag para activar o desactivar la selección obligatoria de sabores de heladería en ventas.
// Por el momento se desactiva (false) para agilizar las ventas en mostrador.
// La lógica interna y modelos de la base de datos se conservan al 100%.
export const ASK_ICE_CREAM_FLAVORS = false;

export function isIceCreamDipEligible(p) {
  if (!p) return false;
  const name = (p.name || "").toLowerCase();
  const id = (p.id || "").toLowerCase();
  return (
    name.includes("bocha") ||
    name.includes("capelina") ||
    name.includes("cucurucho") ||
    id.includes("hel-1-bocha") ||
    id.includes("hel-2-bochas") ||
    id.includes("hel-3-bochas") ||
    id.includes("capelina")
  );
}

export function isIceCreamProduct(p) {
  if (!p) return false;
  const name = (p.name || "").toLowerCase();
  const id = (p.id || "").toLowerCase();
  const cat = (p.category || "").toLowerCase();
  return (
    cat.includes("helado") ||
    id.startsWith("hel-") ||
    name.includes("bocha") ||
    name.includes("capelina") ||
    name.includes("cucurucho") ||
    name.includes("sundae") ||
    name.includes("lanchita")
  );
}
export function getIceCreamMaxFlavors(p) {
  if (!p) return 0;
  const name = (p.name || "").toLowerCase();
  const id = (p.id || "").toLowerCase();
  if (name.includes("1 bocha") || id === "hel-1-bocha") return 1;
  if (name.includes("2 bochas") || id === "hel-2-bochas") return 2;
  if (name.includes("3 bochas") || id === "hel-3-bochas") return 3;
  if (name.includes("capelina") || id.includes("capelina")) return 2;
  if (name.includes("1kg") || id === "hel-1kg") return 4;
  if (name.includes("1/2kg") || id === "hel-medio-kg") return 3;
  if (name.includes("1/4kg") || id === "hel-cuarto-kg") return 2;
  if (name.includes("lanchita") || id === "hel-lanchita") return 3;
  if (name.includes("sundae") || id === "hel-sundae") return 2;
  return 0;
}
export function estimate(p, size, extras, extraPrices = {}) {
  const base =
    p.sizes?.find((s) => s.name === size)?.salePrice != null
      ? Number(p.sizes.find((s) => s.name === size).salePrice)
      : (p.price || 0) + (p.sizes?.find((s) => s.name === size)?.price || 0);
  const extrasCost = (extras || []).reduce((n, e) => {
    const known = p.extras?.find((x) => x.name === e)?.price;
    if (known != null) return n + Number(known);
    if (extraPrices && extraPrices[e] != null) return n + Number(extraPrices[e]);
    return n;
  }, 0);
  return base + extrasCost;
}
// crypto.getRandomValues also works on a LAN HTTP origin (randomUUID may not).
export function operationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function tableLabel(s, number) {
  if (number == null) return "Mostrador";
  const found = s?.tables?.find((t) => t.number === number);
  if (found) {
    return found.name || `Mesa ${found.displayNumber}${found.sector === "afuera" ? " (Afuera)" : ""}`;
  }
  if (number >= 100) {
    return `Mesa ${number - 100} (Afuera)`;
  }
  return `Mesa ${number}`;
}

export function tableSector(s, number) {
  if (number == null) return null;
  const found = s?.tables?.find((t) => t.number === number);
  if (found) return found.sector;
  return number >= 100 ? "afuera" : "salon";
}

export function getProductStation(product) {
  if (!product) return "mostrador";
  const cat = (product.category || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();
  const text = `${cat} ${name} ${desc}`;

  // 1. Cocina (comidas elaboradas, pizzas, tostados, lomitos, minutas, sandwiches, desayunos cocinados)
  if (
    text.includes("comida") ||
    text.includes("pizza") ||
    text.includes("tostado") ||
    text.includes("lomito") ||
    text.includes("hamburguesa") ||
    text.includes("sandwich") ||
    text.includes("sándwich") ||
    text.includes("empanada") ||
    text.includes("tarta") ||
    text.includes("picada") ||
    text.includes("minuta") ||
    text.includes("huevo") ||
    text.includes("palta") ||
    text.includes("rol de canela") ||
    (text.includes("combo") && (text.includes("tostado") || text.includes("americano") || text.includes("supremo") || text.includes("nanifer")))
  ) {
    return "cocina";
  }

  // 2. Cafetería / Barra
  if (
    text.includes("caf") ||
    text.includes("infus") ||
    text.includes("té") ||
    text.includes("te ") ||
    text.includes("submarino") ||
    text.includes("cortado") ||
    text.includes("latte") ||
    text.includes("espresso") ||
    text.includes("cappuccino") ||
    text.includes("capuchino") ||
    text.includes("lagrima") ||
    text.includes("jugo de naranja") ||
    text.includes("licuado")
  ) {
    return "cafeteria";
  }

  // 3. Heladería
  if (text.includes("helad") || text.includes("cucurucho") || text.includes("pote") || text.includes("kilo de helado") || text.includes("1/4") || text.includes("1/2")) {
    return "heladeria";
  }

  return "mostrador";
}

export function orderHasStation(order, station, catalog) {
  if (!order || !order.items || order.items.length === 0) return false;
  if (!station || station === "all") return true;
  return order.items.some(i => {
    const p = (catalog?.products || []).find(prod => prod.id === i.productId);
    const itemStation = getProductStation(p || { name: i.name, category: "" });
    return itemStation === station;
  });
}

