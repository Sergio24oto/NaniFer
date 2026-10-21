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
  return {
    productId: i.productId || i.product || "",
    size: i.size || "",
    flavors: i.flavors || [],
    extras: i.extras || [],
    notes: i.notes || "",
    quantity: i.quantity,
  };
}
export function estimate(p, size, extras) {
  return (
    (p.sizes?.find((s) => s.name === size)?.salePrice != null ? Number(p.sizes.find(s=>s.name===size).salePrice) : p.price + (p.sizes?.find((s) => s.name === size)?.price || 0)) +
    (extras || []).reduce(
      (n, e) => n + (p.extras?.find((x) => x.name === e)?.price || 0),
      0,
    )
  );
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
