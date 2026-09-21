import test from "node:test";
import assert from "node:assert/strict";
import {
  hasCorrections,
  salesPdfPath,
  salesQuery,
  calculateProductPerformance,
  sortAndFilterProducts,
} from "./salesView.js";

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

test("calcula el rendimiento de productos, más vendidos y productos con cero ventas", () => {
  const catalog = [
    { id: "p1", name: "Café Espresso", category: "Cafetería", price: 2000 },
    { id: "p2", name: "Torta NaniFer", category: "Tortas", price: 5000 },
    { id: "p3", name: "Jugo Naranja", category: "Bebidas", price: 2500 },
  ];
  const sales = [
    {
      id: "s1",
      items: [
        { productId: "p1", name: "Café Espresso", quantity: 3, unitPrice: "2000", subtotal: "6000" },
        { productId: "p2", name: "Torta NaniFer", quantity: 1, unitPrice: "5000", subtotal: "5000" },
      ],
    },
    {
      id: "s2",
      items: [
        { productId: "p1", name: "Café Espresso", quantity: 2, unitPrice: "2000", subtotal: "4000" },
      ],
    },
  ];

  const res = calculateProductPerformance(sales, catalog);
  assert.equal(res.kpis.totalUnitsSold, 6);
  assert.equal(res.kpis.totalRevenue, 15000);
  assert.equal(res.kpis.distinctSold, 2);
  assert.equal(res.kpis.distinctUnsold, 1);
  assert.equal(res.kpis.topByUnits.id, "p1");
  assert.equal(res.kpis.topByUnits.unitsSold, 5);
  assert.equal(res.kpis.topByRevenue.id, "p1"); // 10000 vs 5000
  assert.equal(res.unsoldProducts.length, 1);
  assert.equal(res.unsoldProducts[0].name, "Jugo Naranja");

  // Ordenamiento por unidades
  const sortedByUnits = sortAndFilterProducts(res.soldProducts, { sortBy: "units" });
  assert.equal(sortedByUnits[0].id, "p1");
  assert.equal(sortedByUnits[1].id, "p2");

  // Filtrado por categoría
  const filtered = sortAndFilterProducts(res.soldProducts, { category: "Tortas" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, "Torta NaniFer");

  // Búsqueda por texto
  const searched = sortAndFilterProducts(res.soldProducts, { search: "espr" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, "Café Espresso");
});
