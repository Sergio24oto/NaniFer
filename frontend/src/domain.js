export const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(n || 0);
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
    productId: i.productId,
    size: i.size || "",
    flavors: i.flavors || [],
    extras: i.extras || [],
    notes: i.notes || "",
    quantity: i.quantity,
  };
}
export function estimate(p, size, extras) {
  return (
    p.price +
    (p.sizes?.find((s) => s.name === size)?.price || 0) +
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
