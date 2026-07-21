const express = require("express");

module.exports = (prisma) => {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    try {
      const [products, customers, vendorCount, brandCount, locations] = await Promise.all([
        prisma.product.findMany({
          where: { active: true },
          include: {
            units: { select: { status: true, condition: true, locationId: true } },
            stockEntries: { select: { quantity: true } },
            category: { select: { name: true, parent: { select: { name: true } } } },
            brand: { select: { name: true } },
          },
        }),
        prisma.customer.count(),
        prisma.vendor.count({ where: { active: true } }),
        prisma.brand.count({ where: { active: true } }),
        prisma.location.findMany({ where: { active: true }, select: { id: true, name: true } }),
      ]);

      const qtyOf = (p) => (p.stockEntries ?? []).reduce((s, e) => s + e.quantity, 0);
      const avgCostOf = (p) => {
        const ins = (p.stockEntries ?? []).filter((e) => e.quantity > 0);
        const q = ins.reduce((s, e) => s + e.quantity, 0);
        return q > 0 ? Math.round(ins.reduce((s, e) => s + e.quantity * e.costCents, 0) / q) : p.costCents;
      };
      const inStock = (p) => p.units.filter((u) => u.status === "IN_STOCK");

      let unitsInStock = 0;
      let unitsSold = 0;
      let unitsReserved = 0;
      let stockValueCents = 0;
      let retailValueCents = 0;

      for (const p of products) {
        const n = qtyOf(p);
        unitsInStock += n;
        unitsSold += p.units.filter((u) => u.status === "SOLD").length;
        unitsReserved += p.units.filter((u) => u.status === "RESERVED").length;
        stockValueCents += p.costCents * n;
        retailValueCents += p.salePriceCents * n;
      }

      // Anything at or below its reorder point — the reason to open this page.
      const lowStock = products
        .map((p) => ({ p, qty: qtyOf(p) }))
        .filter(({ p, qty }) => qty <= p.reorderAt)
        .sort((a, b) => a.qty - b.qty)
        .slice(0, 8)
        .map(({ p, qty }) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: qty,
          reorderAt: p.reorderAt,
          brand: p.brand?.name ?? null,
        }));

      const byLocation = locations.map((l) => {
        let units = 0;
        let valueCents = 0;
        for (const p of products) {
          const n = inStock(p).filter((u) => u.locationId === l.id).length;
          units += n;
          valueCents += p.costCents * n;
        }
        return { id: l.id, name: l.name, units, valueCents };
      });

      const conditionCounts = {};
      for (const p of products) {
        for (const u of inStock(p)) {
          conditionCounts[u.condition] = (conditionCounts[u.condition] || 0) + 1;
        }
      }
      const byCondition = Object.entries(conditionCounts)
        .map(([condition, count]) => ({ condition, count }))
        .sort((a, b) => b.count - a.count);

      const categoryCounts = {};
      for (const p of products) {
        const label = p.category
          ? p.category.parent
            ? `${p.category.parent.name} / ${p.category.name}`
            : p.category.name
          : "Uncategorised";
        const n = inStock(p).length;
        if (!categoryCounts[label]) categoryCounts[label] = { units: 0, products: 0 };
        categoryCounts[label].units += n;
        categoryCounts[label].products += 1;
      }
      const byCategory = Object.entries(categoryCounts)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 8);

      const recent = [...products]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: qtyOf(p),
          salePriceCents: p.salePriceCents,
          category: p.category
            ? p.category.parent
              ? `${p.category.parent.name} / ${p.category.name}`
              : p.category.name
            : null,
          createdAt: p.createdAt,
        }));

      res.json({
        totals: {
          products: products.length,
          unitsInStock,
          unitsSold,
          unitsReserved,
          customers,
          vendors: vendorCount,
          brands: brandCount,
          stockValueCents,
          retailValueCents,
          potentialProfitCents: retailValueCents - stockValueCents,
          lowStockCount: products.filter((p) => inStock(p).length <= p.reorderAt).length,
        },
        lowStock,
        byLocation,
        byCondition,
        byCategory,
        recent,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};