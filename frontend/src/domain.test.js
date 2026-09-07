import test from "node:test";
import assert from "node:assert/strict";
import { activeAccount, totalAccount, itemInput, estimate } from "./domain.js";
test("muestra el total del servidor y separa visitas históricas", () => {
  const s = {
    accounts: [
      { id: "old", table: 1, closedAt: "yesterday", total: 9000 },
      { id: "new", table: 1, closedAt: null, total: 1800 },
    ],
  };
  assert.equal(activeAccount(s, 1).id, "new");
  assert.equal(totalAccount(s, "new"), 1800);
});
test("el pedido enviado excluye nombres y precios calculados en el cliente", () => {
  const input = itemInput({
    productId: "coffee",
    quantity: 2,
    name: "Injected",
    unitPrice: 1,
  });
  assert.equal(input.productId, "coffee");
  assert.equal("unitPrice" in input, false);
  assert.equal("name" in input, false);
});
test("la estimación visual suma tamaño y extras", () => {
  assert.equal(
    estimate(
      {
        price: 2800,
        sizes: [{ name: "Grande", price: 600 }],
        extras: [{ name: "Shot", price: 600 }],
      },
      "Grande",
      ["Shot"],
    ),
    4000,
  );
});
