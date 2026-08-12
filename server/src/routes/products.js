const express = require("express");
const { scope, stamp, assertStore } = require("../tenancy");

const CONDITIONS =["NEW", "OPEN_BOX", "USED_LIKE_NEW", "USED_GOOD", "USED_FAIR", "FOR_PARTS"];

/** Form fields → what Prisma expects. Money arrives in dollars, stored as cents. */
function shapeProduct(body) {
  const d = {};

  ["name", "sku", "upc", "ean", "customSku", "notes"].forEach((k) => {
    if (body[k] !== undefined) {
      const v = String(body[k] ?? "").trim();
      d[k] = v === "" ? null : v;
    }
  });

  ["brandId", "categoryId", "vendorId"].forEach((k) => {
    if (body[k] !== undefined) d[k] = body[k] || null;
  });

  const dollars = (v) => Math.round(parseFloat(v) * 100) || 0;
  if (body.cost !== undefined && body.cost !== "") d.costCents = dollars(body.cost);
  if (body.onlinePrice !== undefined && body.onlinePrice !== "") d.onlinePriceCents = dollars(body.onlinePrice);
  if (body.salePrice !== undefined && body.salePrice !== "") d.salePriceCents = dollars(body.salePrice);

  if (body.taxable !== undefined) d.taxable = !!body.taxable;
  if (body.active !== undefined) d.active = !!body.active;
  if (body.tracksSerials !== undefined) d.tracksSerials = !!body.tracksSerials;

  ["reorderAt"].forEach((k) => {
    if (body[k] !== undefined && body[k] !== "") {
      const n = parseInt(body[k], 10);
      if (Number.isFinite(n)) d[k] = n;
    }
  });

  return d;
}

/** Each incoming serial row, validated. */
function shapeUnit(u) {
  const serial = String(u?.serial ?? "").trim();
  const condition = String(u?.condition ?? "").trim();
  const locationId = u?.locationId || null;

  if (!serial) throw new Error("Every serial number row needs a serial.");
  if (!CONDITIONS.includes(condition)) throw new Error(`Pick a condition for serial ${serial}.`);
  if (!locationId) throw new Error(`Pick a location for serial ${serial}.`);

  const warrantyMonths = parseInt(u?.warrantyMonths ?? 3, 10);
  const labelCostCents =
    u?.labelCost !== undefined && u.labelCost !== "" && u.labelCost !== null
      ? Math.round(parseFloat(u.labelCost) * 100) || 0
      : null;

  return {
    serial,
    condition,
    locationId,
    storage: String(u?.storage ?? "").trim() || null,
    color: String(u?.color ?? "").trim() || null,
    warrantyMonths: Number.isFinite(warrantyMonths) ? warrantyMonths : 3,
    labelCostCents,
    note: String(u?.note ?? "").trim() || null,
    vendorId: u?.vendorId || null,
  };
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /**
   * These three keep another store's records out of reach. Each answers the
   * request itself and returns false when the row isn't ours, so callers only
   * need `if (!(await guardX(...))) return;`.
   */
  async function guardProduct(req, res, productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { storeId: true },
    });
    return assertStore(req, res, product, "product");
  }

  /** Serials and stock entries belong to whichever store owns the item. */
  async function guardUnit(req, res, unitId) {
    const unit = await prisma.productUnit.findUnique({
      where: { id: unitId },
      select: { storeId: true },
    });
    return assertStore(req, res, unit, "serial");
  }

  async function guardStockEntry(req, res, entryId) {
    const entry = await prisma.stockEntry.findUnique({
      where: { id: entryId },
      select: { product: { select: { storeId: true } } },
    });
    return assertStore(req, res, entry?.product, "stock entry");
  }

  /**
   * Quantity is the sum of stock entries. Average cost is weighted across
   * the batches you actually received — buy 10 at $100 then 10 at $200 and
   * it's $150, not whatever the Details tab happens to say.
   */
  const withCounts = (p) => {
    const entries = (p.stockEntries ?? []).filter((e) => e.quantity > 0);
    const totalQty = entries.reduce((sum, e) => sum + e.quantity, 0);
    const totalCost = entries.reduce((sum, e) => sum + e.quantity * (e.costCents ?? 0), 0);

    const quantity = (p.stockEntries ?? []).reduce((sum, e) => sum + e.quantity, 0);
    const avgCostCents = totalQty > 0 ? Math.round(totalCost / totalQty) : p.costCents;

    const serialsOnFile = p.units?.filter((u) => u.status === "IN_STOCK").length ?? 0;
    return { ...p, quantity, avgCostCents, serialsOnFile, unitCount: p.units?.length ?? 0 };
  };

  router.get("/", async (req, res) => {
    try {
      const { q, location, condition, lowStock, includeInactive } = req.query;

      const where = { ...scope(req) };
      if (!includeInactive) where.active = true;
      if (q) {
        where.OR = [
          { name: { contains: q } },
          { sku: { contains: q } },
          { upc: { contains: q } },
          { ean: { contains: q } },
          { customSku: { contains: q } },
          { brand: { name: { contains: q } } },
          { units: { some: { serial: { contains: q } } } },
        ];
      }

      // Filtering by location or condition means "has a unit like that in stock".
      const unitFilter = {};
      if (location) unitFilter.locationId = location;
      if (condition) unitFilter.condition = condition;
      if (Object.keys(unitFilter).length) {
        unitFilter.status = "IN_STOCK";
        where.units = { some: unitFilter };
      }

      let products = await prisma.product.findMany({
        where,
        include: {
          brand: true,
          category: { include: { parent: { select: { name: true } } } },
          vendor: { select: { id: true, name: true } },
          units: { select: { id: true, status: true } },
          stockEntries: { select: { quantity: true, costCents: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      products = products.map(withCounts);
      if (lowStock) products = products.filter((p) => p.quantity <= p.reorderAt);

      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/:id", async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, ...scope(req) },
      include: {
        brand: true,
        category: { include: { parent: { select: { name: true } } } },
        vendor: { select: { id: true, name: true } },
        units: {
          include: {
            location: { select: { id: true, name: true } },
            vendor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        stockEntries: {
          include: { vendor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json(withCounts(product));
  });

  /** Create the product and all its serials in one go — all or nothing. */
  router.post("/", async (req, res) => {
    try {
      const data = shapeProduct(req.body);
      if (!data.name) return res.status(400).json({ error: "Product name is required." });

      // Check linked records exist before Prisma throws a raw FK error.
      for (const [field, model, label] of [
        ["brandId", "brand", "brand"],
        ["categoryId", "category", "category"],
        ["vendorId", "vendor", "vendor"],
      ]) {
        if (data[field]) {
          // Scoped, so one store can't attach another's brand or vendor.
          const found = await prisma[model].findFirst({
            where: { id: data[field], ...scope(req) },
          });
          if (!found) {
            return res.status(400).json({
              error: `That ${label} no longer exists. Refresh the page and pick again.`,
            });
          }
        }
      }

      const incoming = Array.isArray(req.body.units) ? req.body.units : [];
      const units = incoming.map(shapeUnit);

      const seen = new Set();
      for (const u of units) {
        if (seen.has(u.serial)) {
          return res.status(400).json({ error: `Serial ${u.serial} is listed twice.` });
        }
        seen.add(u.serial);
      }

      if (units.length) {
        // Serials only have to be unique within the store — another shop may
        // legitimately have handled the same handset.
        const clash = await prisma.productUnit.findFirst({
          where: { serial: { in: [...seen] }, ...scope(req) },
          select: { serial: true },
        });
        if (clash) {
          return res.status(409).json({ error: `Serial ${clash.serial} is already in the system.` });
        }
      }

      // SKUs run per store, so each shop gets its own CCC-000001 upwards.
      if (!data.sku) {
        const count = await prisma.product.count({ where: scope(req) });
        data.sku = "CCC-" + String(count + 1).padStart(6, "0");
      }

      const created = await prisma.product.create({
        data: {
          ...data,
          ...stamp(req),
          units: units.length
            ? { create: units.map((u) => ({ ...u, ...stamp(req) })) }
            : undefined,
        },
        include: { units: true, stockEntries: true },
      });

      res.status(201).json(withCounts(created));
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "That SKU or serial is already used." });
      }
      res.status(400).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      if (!(await guardProduct(req, res, req.params.id))) return;

      const updated = await prisma.product.update({
        where: { id: req.params.id },
        data: shapeProduct(req.body),
        include: {
          units: { select: { id: true, status: true } },
          stockEntries: { select: { quantity: true, costCents: true } },
        },
      });
      res.json(withCounts(updated));
    } catch (err) {
      if (err.code === "P2002") return res.status(409).json({ error: "That SKU is already used." });
      if (err.code === "P2025") return res.status(404).json({ error: "Product not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------ units ------------------------------ */

  /** Add more serials to an existing product. */
  router.post("/:id/units", async (req, res) => {
    try {
      if (!(await guardProduct(req, res, req.params.id))) return;

      const incoming = Array.isArray(req.body.units) ? req.body.units : [req.body];
      const units = incoming.map(shapeUnit);

      const created = await prisma.$transaction(
        units.map((u) =>
          prisma.productUnit.create({ data: { ...u, productId: req.params.id, ...stamp(req) } })
        )
      );
      res.status(201).json(created);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "That serial is already in the system." });
      }
      res.status(400).json({ error: err.message });
    }
  });

  router.patch("/units/:unitId", async (req, res) => {
    try {
      if (!(await guardUnit(req, res, req.params.unitId))) return;

      const data = {};
      if (req.body?.serial !== undefined) {
        const serial = String(req.body.serial).trim();
        if (!serial) return res.status(400).json({ error: "Serial is required." });
        data.serial = serial;
      }
      if (req.body?.condition !== undefined) {
        if (!CONDITIONS.includes(req.body.condition)) {
          return res.status(400).json({ error: "Pick a valid condition." });
        }
        data.condition = req.body.condition;
      }
      if (req.body?.locationId !== undefined) {
        if (!req.body.locationId) return res.status(400).json({ error: "Location is required." });
        data.locationId = req.body.locationId;
      }
      if (req.body?.storage !== undefined) data.storage = String(req.body.storage).trim() || null;
      if (req.body?.color !== undefined) data.color = String(req.body.color).trim() || null;
      if (req.body?.note !== undefined) data.note = String(req.body.note).trim() || null;
      if (req.body?.vendorId !== undefined) data.vendorId = req.body.vendorId || null;
      if (req.body?.status !== undefined) data.status = req.body.status;
      if (req.body?.warrantyMonths !== undefined) {
        const w = parseInt(req.body.warrantyMonths, 10);
        if (Number.isFinite(w)) data.warrantyMonths = w;
      }
      if (req.body?.labelCost !== undefined) {
        data.labelCostCents =
          req.body.labelCost === "" || req.body.labelCost === null
            ? null
            : Math.round(parseFloat(req.body.labelCost) * 100) || 0;
      }

      const updated = await prisma.productUnit.update({ where: { id: req.params.unitId }, data });
      res.json(updated);
    } catch (err) {
      if (err.code === "P2002") return res.status(409).json({ error: "That serial is already used." });
      if (err.code === "P2025") return res.status(404).json({ error: "Serial not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Sell one serial by hand, without building a full sale. Marks the unit SOLD
   * and takes one off the quantity on hand so the two stay in step.
   */
  router.post("/units/:unitId/sell", async (req, res) => {
    try {
      if (!(await guardUnit(req, res, req.params.unitId))) return;

      const unit = await prisma.productUnit.findUnique({
        where: { id: req.params.unitId },
        include: { product: { select: { costCents: true } } },
      });
      if (!unit) return res.status(404).json({ error: "Serial not found." });
      if (unit.status !== "IN_STOCK") {
        return res.status(409).json({ error: `Serial ${unit.serial} is not in stock.` });
      }

      await prisma.$transaction([
        prisma.productUnit.update({ where: { id: unit.id }, data: { status: "SOLD" } }),
        prisma.stockEntry.create({
          data: {
            productId: unit.productId,
            quantity: -1,
            costCents: unit.product.costCents,
            note: `Sold serial ${unit.serial}`,
          },
        }),
      ]);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Put a sold serial back on the shelf. Status only — the quantity on hand is
   * left alone so it can be corrected by hand from the Inventory tab.
   */
  router.post("/units/:unitId/return", async (req, res) => {
    try {
      if (!(await guardUnit(req, res, req.params.unitId))) return;

      const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
      if (!unit) return res.status(404).json({ error: "Serial not found." });
      if (unit.status === "IN_STOCK") {
        return res.status(409).json({ error: `Serial ${unit.serial} is already in stock.` });
      }

      await prisma.productUnit.update({ where: { id: unit.id }, data: { status: "IN_STOCK" } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Only unsold units can be deleted — sold ones are history. */
  router.delete("/units/:unitId", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      if (!(await guardUnit(req, res, req.params.unitId))) return;

      const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
      if (!unit) return res.status(404).json({ error: "Serial not found." });
      if (unit.status === "SOLD") {
        return res.status(409).json({ error: "That unit has been sold — it can't be deleted." });
      }
      await prisma.productUnit.delete({ where: { id: req.params.unitId } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* --------------------------- stock entries --------------------------- */

  /** Receive stock. Quantity can be negative to correct a mistake. */
  router.post("/:id/stock", async (req, res) => {
    try {
      if (!(await guardProduct(req, res, req.params.id))) return;

      const product = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (!product) return res.status(404).json({ error: "Product not found." });

      const quantity = parseInt(req.body?.quantity, 10);
      if (!Number.isFinite(quantity) || quantity === 0) {
        return res.status(400).json({ error: "Enter a quantity (use a negative number to correct)." });
      }

      const costCents =
        req.body?.cost !== undefined && req.body.cost !== ""
          ? Math.round(parseFloat(req.body.cost) * 100) || 0
          : product.costCents;

      const vendorId = req.body?.vendorId || null;
      if (vendorId) {
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...scope(req) } });
        if (!vendor) return res.status(400).json({ error: "That vendor no longer exists." });
      }

      const entry = await prisma.stockEntry.create({
        data: {
          productId: req.params.id,
          quantity,
          costCents,
          vendorId,
          note: String(req.body?.note ?? "").trim() || null,
        },
        include: { vendor: { select: { id: true, name: true } } },
      });

      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/stock/:entryId", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      if (!(await guardStockEntry(req, res, req.params.entryId))) return;

      await prisma.stockEntry.delete({ where: { id: req.params.entryId } });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Entry not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /** Archive rather than delete — sales history must keep pointing somewhere. */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      if (!(await guardProduct(req, res, req.params.id))) return;

      await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: "Product not found." });
    }
  });

  return router;
};