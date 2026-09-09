import test from "node:test";
import assert from "node:assert/strict";
import { hasCorrections, salesPdfPath, salesQuery } from "./salesView.js";

test("las correcciones se muestran aunque la diferencia neta sea cero", () => {
  assert.equal(hasCorrections({ correctedCount: 2, difference: "0.00" }), true);
  assert.equal(
    hasCorrections({ correctedCount: 0, difference: "0.00" }),
    false,
  );
});

test("los filtros rápidos delegan la jornada actual al servidor", () => {
  assert.equal(salesQuery(null), "");
  assert.equal(salesQuery({ last: 7 }), "?last=7");
  assert.equal(salesQuery({ last: 31 }), "?last=31");
  assert.equal(
    salesQuery({ start: "2026-01-01", end: "2026-01-31" }),
    "?start=2026-01-01&end=2026-01-31",
  );
});

test("el PDF usa el período consultado, independientemente del filtro en edición", () => {
  const consulted = { start: "2026-01-01", end: "2026-01-07" };
  const draft = { start: "2026-02-01", end: "2026-02-28" };
  assert.equal(
    salesPdfPath(consulted),
    "/sales/export.pdf?start=2026-01-01&end=2026-01-07",
  );
  assert.notEqual(salesPdfPath(consulted), salesPdfPath(draft));
});
