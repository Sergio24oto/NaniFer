import test from "node:test";
import assert from "node:assert/strict";
import { detectProductType, getSmartPairingSuggestions } from "./smartUpsell.js";

const mockCatalog = [
  { id: "pizza-1", name: "Pizza especial", category: "Comidas", price: 13000, available: true },
  { id: "beer-1", name: "Brahma 1 Lt", category: "Bebidas", price: 4500, available: true },
  { id: "beer-2", name: "Corona 473ml", category: "Bebidas", price: 4800, available: true },
  { id: "coca-1", name: "Coca-Cola 1.5L", category: "Bebidas", price: 5000, available: true },
  { id: "caz-1", name: "Cazuelas", category: "Comidas", price: 4000, flavorOptions: ["Maní", "Jamón", "Queso", "Salame", "Aceitunas"], available: true },
  { id: "papas-ched", name: "Porción de papas con cheddar", category: "Comidas", price: 5500, available: true },
  { id: "papas-comun", name: "Porción de papas", category: "Comidas", price: 4500, available: true },
  { id: "kiosco-p014", name: "Quento Papas fritas Mostaza 82g", category: "Kiosco", price: 3200, available: true },
  { id: "cafe-1", name: "Café con leche", category: "Cafetería", price: 2500, available: true },
  { id: "criollos", name: "Criollos", category: "Cafetería", price: 800, available: true },
  { id: "medialunas", name: "Medialunas", category: "Cafetería", price: 1000, available: true },
  { id: "canela", name: "Rol de canela", category: "Cafetería", price: 2200, available: true },
  { id: "torta", name: "Cheesecake de frutos rojos", category: "Tortas", price: 4600, available: true },
  { id: "tostado", name: "Tostado", category: "Comidas", price: 5000, available: true },
  { id: "jugo", name: "Jugo Naranja vaso", category: "Bebidas", price: 3500, available: true },
  { id: "hel-1", name: "1KG Helado", category: "Helados", price: 24500, available: true },
  { id: "hel-2", name: "Copa NaniFer", category: "Helados", price: 6500, available: true },
];

test("detectProductType clasifica correctamente sin contemplar helados", () => {
  assert.equal(detectProductType({ name: "Pizza especial" }), "comida");
  assert.equal(detectProductType({ name: "Brahma 1 Lt" }), "cerveza");
  assert.equal(detectProductType({ name: "Coca-Cola 1.5L" }), "gaseosa");
  assert.equal(detectProductType({ name: "Café con leche" }), "cafeteria");
  assert.equal(detectProductType({ name: "Tostado mixto" }), "tostado");
  assert.equal(detectProductType({ name: "1KG Helado", category: "Helados" }), "helados");
});

test("Al agregar Pizza, sugiere cervezas grandes, gaseosas y papas", () => {
  const suggestions = getSmartPairingSuggestions(mockCatalog[0], mockCatalog, []);
  assert.ok(suggestions);
  assert.match(suggestions.title, /Maridaje sugerido/i);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.includes("Brahma 1 Lt"));
  assert.ok(names.includes("Coca-Cola 1.5L"));
  assert.ok(names.includes("Porción de papas con cheddar") || names.includes("Porción de papas"));
});

test("Al agregar Cerveza, sugiere Cazuelas (con selección de variedades y Maní por defecto), y Papas", () => {
  const beer = mockCatalog.find((p) => p.name.includes("Brahma"));
  const suggestions = getSmartPairingSuggestions(beer, mockCatalog, []);
  assert.ok(suggestions);
  assert.match(suggestions.title, /cerveza/i);
  const caz = suggestions.items.find((i) => i.product.name.includes("Cazuela"));
  assert.ok(caz);
  assert.equal(caz.hasVarieties, true);
  assert.equal(caz.featuredVariety, "Maní");
  assert.ok(caz.varieties.includes("Maní"));
});

test("Al agregar Gaseosa, sugiere Papas con cheddar y Cazuelas", () => {
  const soda = mockCatalog.find((p) => p.name.includes("Coca-Cola"));
  const suggestions = getSmartPairingSuggestions(soda, mockCatalog, []);
  assert.ok(suggestions);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.some((n) => n.includes("papas")));
  assert.ok(names.some((n) => n.includes("Cazuelas")));
});

test("Al agregar Café, sugiere Criollos, Medialunas, Rol de canela y Torta con nombres exactos de la carta", () => {
  const cafe = mockCatalog.find((p) => p.name.includes("Café"));
  const suggestions = getSmartPairingSuggestions(cafe, mockCatalog, []);
  assert.ok(suggestions);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.includes("Criollos"));
  assert.ok(names.includes("Medialunas"));
  assert.ok(names.includes("Rol de canela"));
  // No debe sugerir helados
  assert.ok(!names.some((n) => n.toLowerCase().includes("helad")));
});

test("Al agregar Helados, NO se genera ninguna sugerencia", () => {
  const iceCream = mockCatalog.find((p) => p.id === "hel-1");
  const suggestions = getSmartPairingSuggestions(iceCream, mockCatalog, []);
  assert.equal(suggestions, null);
});
