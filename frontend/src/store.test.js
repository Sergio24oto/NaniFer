import test from "node:test";
import assert from "node:assert/strict";
const values = new Map();
globalThis.sessionStorage = {
  getItem: (k) => values.get(k) ?? null,
  setItem: (k, v) => values.set(k, v),
  removeItem: (k) => values.delete(k),
};
globalThis.window = { addEventListener: () => {} };
const originalInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { submitOnce, pendingOperation, request } = await import("./store.js");
globalThis.setInterval = originalInterval;
const catalog = () =>
  Response.json({ products: [], categories: [], flavors: [] });
test("respuesta perdida: reenvía la misma clave y el mismo contenido", async () => {
  const calls = [];
  let failed = true;
  globalThis.fetch = async (url, options) => {
    if (options.method === "GET") return catalog();
    calls.push(options);
    if (failed) {
      failed = false;
      throw Error("offline");
    }
    return Response.json({ id: "persisted-order" });
  };
  await assert.rejects(
    submitOnce("retry", "/orders", { quantity: 1 }),
    /Sin conexión/,
  );
  assert.ok(pendingOperation("retry"));
  const result = await submitOnce("retry", "/orders", { quantity: 99 });
  assert.equal(result.id, "persisted-order");
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    calls[1].headers["Idempotency-Key"],
  );
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(pendingOperation("retry"), null);
});
test("un rechazo explícito no confirma y permite corregir el formulario", async () => {
  globalThis.fetch = async () =>
    Response.json({ detail: "Saldo cambió" }, { status: 409 });
  await assert.rejects(submitOnce("reject", "/pay", {}), /Saldo cambió/);
  assert.equal(pendingOperation("reject"), null);
});
test("respuesta ilegible nunca se considera una confirmación", async () => {
  globalThis.fetch = async () =>
    new Response("<html>error</html>", { status: 200 });
  await assert.rejects(submitOnce("malformed", "/pay", {}), /interpretar/);
  assert.ok(pendingOperation("malformed"));
});

test("PDF: descarga binaria y rechazo de permisos sin archivo falso", async () => {
  globalThis.fetch = async () =>
    new Response("%PDF-example", {
      headers: { "Content-Type": "application/pdf" },
    });
  const pdf = await request("/sales/export.pdf", { asBlob: true });
  assert.equal(pdf.type, "application/pdf");
  assert.equal(await pdf.text(), "%PDF-example");
  globalThis.fetch = async () =>
    Response.json({ detail: "Solo administrador" }, { status: 403 });
  await assert.rejects(
    request("/sales/export.pdf", { asBlob: true }),
    /Solo administrador/,
  );
});
