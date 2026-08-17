const express = require("express");
const { scope, stamp, assertStore } = require("../tenancy");

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /**
   * Returns top-level categories with their sub-categories nested inside.
   *
   * `ownItems`   — products filed directly against that category
   * `totalItems` — for a parent, its own items plus everything in its children
   */
  router.get("/", async (req, res) => {
    try {
      const includeInactive = !!req.query.includeInactive;
      const where = includeInactive ? { ...scope(req) } : { active: true, ...scope(req) };

      const all = await prisma.category.findMany({
        where,
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      });

      const parents = all.filter((c) => !c.parentId);
      const children = all.filter((c) => c.parentId);

      const tree = parents.map((parent) => {
        const kids = children
          .filter((c) => c.parentId === parent.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            parentId: c.parentId,
            active: c.active,
            ownItems: c._count.products,
            totalItems: c._count.products,
          }));

        const ownItems = parent._count.products;
        return {
          id: parent.id,
          name: parent.name,
          parentId: null,
          active: parent.active,
          ownItems,
          totalItems: ownItems + kids.reduce((sum, k) => sum + k.ownItems, 0),
          children: kids,
        };
      });

      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Flat list — handy for dropdowns. */
  router.get("/flat", async (req, res) => {
    const all = await prisma.category.findMany({
      where: { active: true, ...scope(req) },
      orderBy: { name: "asc" },
      include: { parent: { select: { id: true, name: true } } },
    });
    res.json(
      all.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        parentName: c.parent?.name ?? null,
        label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
      }))
    );
  });

  router.post("/", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      const parentId = req.body?.parentId || null;

      if (!name) return res.status(400).json({ error: "Category name is required." });

      if (parentId) {
        const parent = await prisma.category.findFirst({ where: { id: parentId, ...scope(req) } });
        if (!parent) return res.status(400).json({ error: "That parent category doesn't exist." });
        // Only one level deep — a sub-category can't itself be a parent.
        if (parent.parentId) {
          return res.status(400).json({
            error: `${parent.name} is already a sub-category, so it can't hold sub-categories of its own.`,
          });
        }
      }

      const clash = await prisma.category.findFirst({ where: { name, parentId, ...scope(req) } });
      // A category holding products is archived rather than deleted, so the
      // name it clashes with may be one nobody can see. Revive that instead.
      if (clash && clash.active === false) {
        const revived = await prisma.category.update({
          where: { id: clash.id },
          data: { active: true },
        });
        return res.status(201).json(revived);
      }
      if (clash) {
        return res.status(409).json({
          error: parentId
            ? "That sub-category already exists here."
            : "That category already exists.",
        });
      }

      const created = await prisma.category.create({ data: { name, parentId, ...stamp(req) } });
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const existing = await prisma.category.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { children: true } } },
      });
      if (!assertStore(req, res, existing, "category")) return;

      const data = {};

      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ error: "Category name is required." });
        data.name = name;
      }

      if (req.body?.parentId !== undefined) {
        const parentId = req.body.parentId || null;

        if (parentId === req.params.id) {
          return res.status(400).json({ error: "A category can't be its own parent." });
        }

        if (parentId) {
          if (existing._count.children > 0) {
            return res.status(400).json({
              error: `${existing.name} has sub-categories, so it can't become a sub-category itself.`,
            });
          }
          const parent = await prisma.category.findFirst({ where: { id: parentId, ...scope(req) } });
          if (!parent) return res.status(400).json({ error: "That parent category doesn't exist." });
          if (parent.parentId) {
            return res.status(400).json({
              error: `${parent.name} is already a sub-category, so it can't hold sub-categories of its own.`,
            });
          }
        }

        data.parentId = parentId;
      }

      if (req.body?.active !== undefined) data.active = !!req.body.active;

      const name = data.name ?? existing.name;
      const parentId = data.parentId !== undefined ? data.parentId : existing.parentId;
      const clash = await prisma.category.findFirst({
        where: { name, parentId, NOT: { id: req.params.id }, ...scope(req) },
      });
      if (clash) return res.status(409).json({ error: "Another category already uses that name here." });

      const updated = await prisma.category.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Categories in use are archived; empty ones are deleted properly. */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const category = await prisma.category.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { products: true, children: true } } },
      });
      if (!assertStore(req, res, category, "category")) return;

      if (category._count.children > 0) {
        return res.status(409).json({
          error: `${category.name} has ${category._count.children} sub-categories. Remove those first.`,
        });
      }

      if (category._count.products > 0) {
        await prisma.category.update({ where: { id: req.params.id }, data: { active: false } });
        return res.json({
          ok: true,
          archived: true,
          message: `${category.name} holds ${category._count.products} products, so it's been archived rather than deleted.`,
        });
      }

      await prisma.category.delete({ where: { id: req.params.id } });
      res.json({ ok: true, archived: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
