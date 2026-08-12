const express = require("express");
const { scope, stamp, assertStore } = require("../tenancy");

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { q, includeInactive } = req.query;

    const where = { ...scope(req) };
    if (!includeInactive) where.active = true;
    if (q) where.name = { contains: q };

    const brands = await prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json(brands);
  });

  router.post("/", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "Brand name is required." });

      const notes = String(req.body?.notes ?? "").trim() || null;
      const created = await prisma.brand.create({ data: { name, notes, ...stamp(req) } });
      res.status(201).json(created);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "That brand already exists." });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const data = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ error: "Brand name is required." });
        data.name = name;
      }
      if (req.body?.notes !== undefined) {
        data.notes = String(req.body.notes).trim() || null;
      }
      if (req.body?.active !== undefined) data.active = !!req.body.active;

      const existing = await prisma.brand.findUnique({
        where: { id: req.params.id },
        select: { storeId: true },
      });
      if (!assertStore(req, res, existing, "brand")) return;

      const updated = await prisma.brand.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "Another brand already uses that name." });
      }
      if (err.code === "P2025") return res.status(404).json({ error: "Brand not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /** Brands in use are archived; unused ones are deleted properly. */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const brand = await prisma.brand.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { products: true } } },
      });
      if (!assertStore(req, res, brand, "brand")) return;

      if (brand._count.products > 0) {
        await prisma.brand.update({ where: { id: req.params.id }, data: { active: false } });
        return res.json({
          ok: true,
          archived: true,
          message: `${brand.name} is on ${brand._count.products} products, so it's been archived rather than deleted.`,
        });
      }

      await prisma.brand.delete({ where: { id: req.params.id } });
      res.json({ ok: true, archived: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};