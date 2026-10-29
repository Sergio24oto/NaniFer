import test from "node:test";
import assert from "node:assert/strict";
import { detectProductType, getSmartPairingSuggestions } from "./smartUpsell.js";

const mockCatalog = [
  { id: "pizza-1", name: "Pizza especial", category: "Comidas", price: 13000, available: true },
  { id: "beer-1", name: "Brahma 1 Lt", category: "Bebidas", price: 4500, available: true },
  { id: "beer-2", name: "Corona 473ml", category: "Bebidas", price: 4800, available: true },
  { id: "coca-1", name: "Coca-Cola 1.5L", category: "Bebidas", price: 5000, available: true },
  { id: "levite-1", name: "Levité Pomelo 1.5L", category: "Bebidas", price: 4200, available: true },
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
  { id: "picada-1", name: "Picada para dos", category: "Comidas", price: 18000, available: true },
  { id: "empanada-1", name: "Empanada criolla", category: "Comidas", price: 1500, available: true },
  { id: "hel-1", name: "1KG Helado", category: "Helados", price: 24500, available: true },
  { id: "hel-2", name: "Copa NaniFer", category: "Helados", price: 6500, available: true },
];

test("detectProductType clasifica solo los 5 disparadores estratégicos y silencia el resto", () => {
  assert.equal(detectProductType({ name: "Pizza especial" }), "pizza");
  assert.equal(detectProductType({ name: "Brahma 1 Lt" }), "cerveza");
  assert.equal(detectProductType({ name: "Café con leche" }), "cafe");
  assert.equal(detectProductType({ name: "Jugo Naranja vaso" }), "licuado");
  assert.equal(detectProductType({ name: "Picada para dos" }), "picada");

  // Todo lo demás devuelve 'other' o 'helados' para NO abrir cartel
  assert.equal(detectProductType({ name: "Coca-Cola 1.5L" }), "other");
  assert.equal(detectProductType({ name: "Empanada criolla" }), "other");
  assert.equal(detectProductType({ name: "Tostado mixto" }), "other");
  assert.equal(detectProductType({ name: "Porción de papas" }), "other");
  assert.equal(detectProductType({ name: "1KG Helado", category: "Helados" }), "helados");
});

test("Al agregar Pizza, sugiere cervezas grandes, gaseosas y papas", () => {
  const pizza = mockCatalog.find((p) => p.name.includes("Pizza"));
  const suggestions = getSmartPairingSuggestions(pizza, mockCatalog, []);
  assert.ok(suggestions);
  assert.match(suggestions.title, /Maridaje sugerido/i);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.includes("Brahma 1 Lt"));
  assert.ok(names.includes("Coca-Cola 1.5L"));
  assert.ok(names.includes("Porción de papas con cheddar") || names.includes("Porción de papas"));
});

test("Inteligencia sobre el carrito en Pizza: si ya tiene cerveza, NO la ofrece", () => {
  const pizza = mockCatalog.find((p) => p.name.includes("Pizza"));
  const cartWithBeer = [{ productId: "beer-1", name: "Brahma 1 Lt", quantity: 1 }];
  const suggestions = getSmartPairingSuggestions(pizza, mockCatalog, cartWithBeer);
  assert.ok(suggestions);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(!names.some((n) => n.toLowerCase().includes("brahma") || n.toLowerCase().includes("corona")));
  assert.ok(names.includes("Coca-Cola 1.5L"));
});

test("Inteligencia sobre el carrito: si ya tiene todo lo sugerido, NO abre cartel (retorna null)", () => {
  const pizza = mockCatalog.find((p) => p.name.includes("Pizza"));
  const cartComplete = [
    { productId: "beer-1", name: "Brahma 1 Lt", quantity: 1 },
    { productId: "coca-1", name: "Coca-Cola 1.5L", quantity: 1 },
    { productId: "papas-ched", name: "Porción de papas con cheddar", quantity: 1 },
    { productId: "papas-comun", name: "Porción de papas", quantity: 1 },
  ];
  const suggestions = getSmartPairingSuggestions(pizza, mockCatalog, cartComplete);
  assert.equal(suggestions, null);
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

test("Al agregar Picada, sugiere Gaseosa, Cerveza y Levité", () => {
  const picada = mockCatalog.find((p) => p.name.includes("Picada"));
  const suggestions = getSmartPairingSuggestions(picada, mockCatalog, []);
  assert.ok(suggestions);
  assert.match(suggestions.title, /picada/i);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.some((n) => n.includes("Coca-Cola")));
  assert.ok(names.some((n) => n.includes("Brahma")));
  assert.ok(names.some((n) => n.includes("Levité")));
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

test("Al agregar Licuado, sugiere Tostado, Medialunas y Porción dulce", () => {
  const licuado = mockCatalog.find((p) => p.id === "jugo");
  const suggestions = getSmartPairingSuggestions(licuado, mockCatalog, []);
  assert.ok(suggestions);
  assert.match(suggestions.title, /licuado/i);
  const names = suggestions.items.map((i) => i.product.name);
  assert.ok(names.includes("Tostado"));
  assert.ok(names.includes("Medialunas"));
  assert.ok(names.includes("Rol de canela") || names.includes("Cheesecake de frutos rojos"));
});

test("Productos comunes fuera de los 5 disparadores NO abren cartel", () => {
  const soda = mockCatalog.find((p) => p.name.includes("Coca-Cola"));
  const empanada = mockCatalog.find((p) => p.name.includes("Empanada"));
  assert.equal(getSmartPairingSuggestions(soda, mockCatalog, []), null);
  assert.equal(getSmartPairingSuggestions(empanada, mockCatalog, []), null);
});

test("Al agregar Helados, NO se genera ninguna sugerencia", () => {
  const iceCream = mockCatalog.find((p) => p.id === "hel-1");
  const suggestions = getSmartPairingSuggestions(iceCream, mockCatalog, []);
  assert.equal(suggestions, null);
});
