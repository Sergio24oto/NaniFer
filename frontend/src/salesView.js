export function salesQuery(filter) {
  if (!filter) return "";
  if (filter.last) return `?last=${filter.last}`;
  return `?start=${filter.start}&end=${filter.end}`;
}

// Export the successfully consulted period, never the dates being edited.
export function salesPdfPath(report) {
  return `/sales/export.pdf?start=${report.start}&end=${report.end}`;
}

export function hasCorrections(report) {
  return report.correctedCount > 0;
}

export function calculateProductPerformance(sales = [], catalogProducts = []) {
  const map = new Map();

  // Index catalog products first
  for (const p of catalogProducts) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      category: p.category || "Sin categoría",
      price: Number(p.price) || 0,
      unitsSold: 0,
      revenue: 0,
      ordersCount: 0,
      available: p.available !== false,
    });
  }

  // Accumulate from sales items
  let grandTotalUnits = 0;
  let grandTotalRevenue = 0;

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const pid = item.productId || item.id;
      const qty = Number(item.quantity) || 0;
      const subtotal = Number(item.subtotal) || (Number(item.unitPrice || 0) * qty);

      grandTotalUnits += qty;
      grandTotalRevenue += subtotal;

      let entry = map.get(pid);
      if (!entry) {
        entry = {
          id: pid,
          name: item.name || "Producto sin nombre",
          category: "Otros",
          price: Number(item.unitPrice) || 0,
          unitsSold: 0,
          revenue: 0,
          ordersCount: 0,
          available: true,
        };
        map.set(pid, entry);
      }

      entry.unitsSold += qty;
      entry.revenue += subtotal;
      entry.ordersCount += 1;
    }
  }

  const all = Array.from(map.values()).map((p) => ({
    ...p,
    shareRevenue: grandTotalRevenue > 0 ? (p.revenue / grandTotalRevenue) * 100 : 0,
    shareUnits: grandTotalUnits > 0 ? (p.unitsSold / grandTotalUnits) * 100 : 0,
  }));

  const soldProducts = all.filter((p) => p.unitsSold > 0);
  const unsoldProducts = all.filter((p) => p.unitsSold === 0);

  // Highest by units
  const topByUnits = [...soldProducts].sort((a, b) => b.unitsSold - a.unitsSold)[0] || null;
  // Highest by revenue
  const topByRevenue = [...soldProducts].sort((a, b) => b.revenue - a.revenue)[0] || null;

  const categories = Array.from(
    new Set(all.map((p) => p.category).filter(Boolean)),
  ).sort();

  return {
    all,
    soldProducts,
    unsoldProducts,
    kpis: {
      topByUnits,
      topByRevenue,
      totalUnitsSold: grandTotalUnits,
      totalRevenue: grandTotalRevenue,
      distinctSold: soldProducts.length,
      distinctUnsold: unsoldProducts.length,
    },
    categories,
  };
}

export function sortAndFilterProducts(products = [], { sortBy = "units", category = "", search = "" } = {}) {
  let list = [...products];
  if (category) {
    list = list.filter((p) => p.category === category);
  }
  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q),
    );
  }
  if (sortBy === "revenue") {
    list.sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);
  } else {
    list.sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue);
  }
  return list;
}
