const express = require("express");

/** Only `name` is required — everything else is optional. */
function shape(body) {
  const d = {};
  [
    "name",
    "accountNumber",
    "contactPerson",
    "phone",
    "mobile",
    "fax",
    "email1",
    "email2",
    "country",
    "address",
    "address2",
    "city",
    "province",
    "postal",
    "notes",
  ].forEach((k) => {
    if (body[k] !== undefined) {
      const v = String(body[k] ?? "").trim();
      d[k] = v === "" ? null : v;
    }
  });

  if (d.email1) d.email1 = d.email1.toLowerCase();
  if (d.email2) d.email2 = d.email2.toLowerCase();
  if (body.active !== undefined) d.active = !!body.active;
  if (body.currency !== undefined && ["CAD", "USD"].includes(body.currency)) {
    d.currency = body.currency;
  }

  return d;
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { q, includeInactive } = req.query;

    const where = {};
    if (!includeInactive) where.active = true;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { accountNumber: { contains: q } },
        { contactPerson: { contains: q } },
        { phone: { contains: q } },
        { mobile: { contains: q } },
        { email1: { contains: q } },
        { email2: { contains: q } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json(vendors);
  });

  router.get("/:id", async (req, res) => {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { products: true } } },
    });
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    res.json(vendor);
  });

  router.post("/", async (req, res) => {
    try {
      const data = shape(req.body);
      if (!data.name) return res.status(400).json({ error: "Vendor name is required." });
      const created = await prisma.vendor.create({ data });
      res.status(201).json(created);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "A vendor with that name already exists." });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const data = shape(req.body);
      if (data.name === null) return res.status(400).json({ error: "Vendor name is required." });
      const updated = await prisma.vendor.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "A vendor with that name already exists." });
      }
      if (err.code === "P2025") return res.status(404).json({ error: "Vendor not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Vendors attached to products are archived rather than deleted, so the
   * product's history keeps pointing somewhere real.
   */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { products: true } } },
      });
      if (!vendor) return res.status(404).json({ error: "Vendor not found." });

      if (vendor._count.products > 0) {
        await prisma.vendor.update({ where: { id: req.params.id }, data: { active: false } });
        return res.json({
          ok: true,
          archived: true,
          message: `${vendor.name} supplies ${vendor._count.products} products, so it's been archived rather than deleted.`,
        });
      }

      await prisma.vendor.delete({ where: { id: req.params.id } });
      res.json({ ok: true, archived: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
