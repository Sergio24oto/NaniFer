import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  transition,
  activeAccount,
  totalAccount,
  priceItem,
} from "./domain.js";
const item = {
  productId: "latte",
  size: "Grande",
  extras: ["Shot extra"],
  flavors: [],
  quantity: 2,
  notes: "Sin azúcar",
};
const order = (s, token = "first") =>
  transition(s, { type: "order", table: 1, items: [item], token });
test("recorrido: pedir, preparar, entregar, agregar otro pedido, cobrar y reutilizar", () => {
  let s = order(emptyState());
  const id = activeAccount(s, 1).id;
  assert.equal(totalAccount(s, id), 8000);
  for (let i = 0; i < 3; i++)
    s = transition(s, { type: "status", id: s.orders[0].id });
  assert.equal(s.payments.length, 0);
  assert.ok(activeAccount(s, 1));
  s = order(s, "second");
  assert.equal(totalAccount(s, id), 16000);
  assert.throws(
    () =>
      transition(s, { type: "pay", id, method: "efectivo", received: "20000" }),
    /Entregá/,
  );
  for (let i = 0; i < 3; i++)
    s = transition(s, { type: "status", id: s.orders[1].id });
  assert.throws(
    () =>
      transition(s, { type: "pay", id, method: "efectivo", received: "100" }),
    /alcanza/,
  );
  s = transition(s, { type: "pay", id, method: "efectivo", received: "20000" });
  assert.equal(s.payments[0].change, 4000);
  assert.equal(activeAccount(s, 1), undefined);
  assert.throws(
    () => transition(s, { type: "pay", id, method: "efectivo", received: "" }),
    /cerrada/,
  );
  s = transition(s, { type: "open", table: 1 });
  assert.notEqual(activeAccount(s, 1).id, id);
  assert.equal(totalAccount(s, activeAccount(s, 1).id), 0);
});
test("doble envío usa token idempotente", () => {
  let s = order(emptyState());
  s = order(s);
  assert.equal(s.orders.length, 1);
});
test("opciones agotadas, límites y precios calculados", () => {
  assert.equal(priceItem({ ...item, unitPrice: 1 }).unitPrice, 4000);
  assert.throws(
    () => priceItem({ ...item, productId: "brownie" }),
    /disponible/,
  );
  assert.throws(
    () =>
      priceItem({
        productId: "helado",
        size: "2 bochas",
        flavors: ["Pistacho"],
        quantity: 1,
      }),
    /disponible/,
  );
  assert.throws(
    () =>
      priceItem({
        productId: "helado",
        size: "2 bochas",
        flavors: ["Vainilla", "Frutilla", "Dulce de leche"],
        quantity: 1,
      }),
    /cantidad/,
  );
  assert.throws(() => priceItem({ ...item, quantity: 0 }), /Cantidad/);
});
test("no permite enviar a una visita distinta desde una pestaña desactualizada", () => {
  const s = order(emptyState());
  assert.throws(
    () =>
      transition(s, {
        type: "order",
        table: 1,
        expectedAccount: "old",
        items: [item],
        token: "new",
      }),
    /cambió/,
  );
});
test("tarjeta y transferencia guardan importe sin dinero recibido", () => {
  for (const method of ["tarjeta", "transferencia", "efectivo"]) {
    let s = order(emptyState());
    const id = s.accounts[0].id;
    for (let i = 0; i < 3; i++)
      s = transition(s, { type: "status", id: s.orders[0].id });
    s = transition(s, { type: "pay", id, method, received: "" });
    assert.equal(s.payments[0].total, 8000);
    assert.equal(s.payments[0].received, null);
  }
});
test("restablecer borra visitas, pedidos y cobros", () =>
  assert.deepEqual(
    transition(order(emptyState()), { type: "reset" }),
    emptyState(),
  ));

test('repetir una transición desde otra pestaña no saltea estados', () => {
 let s=order(emptyState()); const id=s.orders[0].id;
 const action={type:'status',id,expectedStatus:'pendiente'};
 s=transition(s,action);s=transition(s,action);
 assert.equal(s.orders[0].status,'en preparación');
});
