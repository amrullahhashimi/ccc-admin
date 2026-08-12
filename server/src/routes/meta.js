const express = require("express");
const { scope, stamp, assertStore } = require("../tenancy");
const bcrypt = require("bcryptjs");

module.exports = (prisma, requireRole) => {
  const router = express.Router();

// Everything the forms need in one call
  router.get("/", async (req, res) => {
    const [categories, vendors, locations, brands] = await Promise.all([
      prisma.category.findMany({
        where: { active: true, ...scope(req) },
        orderBy: { name: "asc" },
        include: { parent: { select: { id: true, name: true } } },
      }),
      prisma.vendor.findMany({
        where: { active: true, ...scope(req) },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.location.findMany({
        where: { active: true, ...scope(req) },
        orderBy: { name: "asc" },
      }),
      prisma.brand.findMany({
        where: { active: true, ...scope(req) },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    res.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
      })),
      vendors,
      locations,
      brands,
    });
  });

  router.post("/locations", requireRole("OWNER", "MANAGER"), async (req, res) => {
    const { name, address } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Location name is required." });
    try {
      res.status(201).json(
        await prisma.location.create({ data: { name: name.trim(), address: address || null, ...stamp(req) } })
      );
    } catch (err) {
      if (err.code === "P2002") return res.status(409).json({ error: "That location already exists." });
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------ staff ------------------------------ */

  router.get("/users", requireRole("OWNER", "MANAGER"), async (req, res) => {
    const users = await prisma.user.findMany({
      where: scope(req),
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    res.json(users);
  });

  router.post("/users", requireRole("OWNER"), async (req, res) => {
    const { name, email, password, role } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!["OWNER", "MANAGER", "STAFF", "TECH"].includes(role)) {
      return res.status(400).json({ error: "Pick a valid role." });
    }
    try {
      const user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          role,
          passwordHash: await bcrypt.hash(password, 12),
          ...stamp(req),
        },
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      res.status(201).json(user);
    } catch (err) {
      if (err.code === "P2002") return res.status(409).json({ error: "That email is already registered." });
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/users/:id", requireRole("OWNER"), async (req, res) => {
    const { name, role, active, password } = req.body || {};
    const data = {};
    if (name) data.name = name.trim();
    if (role && ["OWNER", "MANAGER", "STAFF", "TECH"].includes(role)) data.role = role;
    if (active !== undefined) data.active = !!active;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    // Don't let the last owner lock themselves out.
    if (req.params.id === req.session.user.id && (data.active === false || (data.role && data.role !== "OWNER"))) {
      return res.status(400).json({ error: "You can't remove your own owner access." });
    }

    try {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
      if (!assertStore(req, res, target, "user")) return;

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      res.json(user);
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "User not found." });
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
