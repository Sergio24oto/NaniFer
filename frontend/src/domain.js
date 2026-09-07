import { products, flavors, staff } from "./data.js";
export const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
export const statuses = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "entregado",
];
export const emptyState = () => ({
  version: 1,
  accounts: [],
  orders: [],
  payments: [],
  tokens: [],
});
export const activeAccount = (s, table) =>
  s.accounts.find((a) => a.table === table && !a.closedAt);
export const totalAccount = (s, id) =>
  s.orders
    .filter((o) => o.accountId === id)
    .reduce(
      (t, o) => t + o.items.reduce((n, i) => n + i.unitPrice * i.quantity, 0),
      0,
    );
export function priceItem(item) {
  const p = products.find((p) => p.id === item.productId);
  if (!p?.available) throw Error("Producto no disponible.");
  const size = p.sizes?.find((s) => s.name === item.size);
  if (p.sizes && !size) throw Error("Elegí un tamaño.");
  const chosen = item.flavors || [];
  if (size?.max && (!chosen.length || chosen.length > size.max))
    throw Error("Revisá la cantidad de sabores.");
  if (
    new Set(chosen).size !== chosen.length ||
    chosen.some((f) => !flavors.find((x) => x.name === f)?.available)
  )
    throw Error("Sabor no disponible.");
  const extras = item.extras || [];
  if (
    new Set(extras).size !== extras.length ||
    extras.some((e) => !p.extras?.find((x) => x.name === e))
  )
    throw Error("Extra inválido.");
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 99
  )
    throw Error("Cantidad inválida.");
  return {
    ...item,
    name: p.name,
    notes: (item.notes || "").slice(0, 300),
    unitPrice:
      p.price +
      (size?.price || 0) +
      extras.reduce((n, e) => n + p.extras.find((x) => x.name === e).price, 0),
  };
}
export function transition(state, action) {
  const s = structuredClone(state);
  const now = new Date().toISOString();
  if (action.type === "reset") return emptyState();
  if (action.type === "open" || action.type === "order") {
    if (
      !Number.isInteger(action.table) ||
      action.table < 1 ||
      action.table > 15
    )
      throw Error("Mesa inválida.");
    if (action.type === "order" && s.tokens.includes(action.token)) return s;
    let a = activeAccount(s, action.table);
    if (
      action.expectedAccount !== undefined &&
      (a?.id || null) !== action.expectedAccount
    )
      throw Error("La cuenta cambió. Revisá la mesa y volvé a confirmar.");
    if (!a) {
      a = {
        id: crypto.randomUUID(),
        table: action.table,
        waitress: action.waitress || staff[0],
        openedAt: now,
      };
      s.accounts.push(a);
    }
    if (action.type === "order") {
      if (!action.items?.length) throw Error("El carrito está vacío.");
      s.orders.push({
        id: crypto.randomUUID(),
        accountId: a.id,
        table: a.table,
        createdAt: now,
        status: statuses[0],
        items: action.items.map(priceItem),
      });
      s.tokens.push(action.token);
    }
  }
  if (action.type === "staff") {
    const a = s.accounts.find((a) => a.id === action.id && !a.closedAt);
    if (!a || !staff.includes(action.name))
      throw Error("Cuenta no disponible.");
    a.waitress = action.name;
  }
  if (action.type === "status") {
    const o = s.orders.find((o) => o.id === action.id);
    if (!o || !s.accounts.find((a) => a.id === o.accountId && !a.closedAt))
      throw Error("Cuenta cerrada.");
    if (
      action.expectedStatus !== undefined &&
      action.expectedStatus !== o.status
    )
      return s;
    const i = statuses.indexOf(o.status);
    if (i >= 3) throw Error("Ya entregado.");
    o.status = statuses[i + 1];
  }
  if (action.type === "pay") {
    const a = s.accounts.find((a) => a.id === action.id && !a.closedAt);
    if (!a) throw Error("La cuenta ya está cerrada.");
    const total = totalAccount(s, a.id);
    if (total <= 0) throw Error("Agregá consumos antes de cobrar.");
    if (s.orders.some((o) => o.accountId === a.id && o.status !== "entregado"))
      throw Error("Entregá todos los pedidos antes de cerrar la cuenta.");
    if (!["efectivo", "tarjeta", "transferencia"].includes(action.method))
      throw Error("Medio inválido.");
    const received =
      action.method === "efectivo" && action.received !== ""
        ? Number(action.received)
        : null;
    if (received !== null && (!Number.isFinite(received) || received < total))
      throw Error("El dinero recibido no alcanza.");
    s.payments.push({
      id: crypto.randomUUID(),
      accountId: a.id,
      table: a.table,
      total,
      method: action.method,
      received,
      change: received === null ? null : received - total,
      createdAt: now,
    });
    a.closedAt = now;
  }
  return s;
}
