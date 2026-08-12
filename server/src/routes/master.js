const express = require("express");
const { ah } = require("../async-route");
const bcrypt = require("bcryptjs");
const { requireSuperAdmin } = require("../tenancy");

/**
 * The master area — system administration across every store.
 *
 * The master belongs to no store and owns no data. They can look into any
 * store's inventory, service tickets and customers, and they can set up stores
 * and staff accounts. They cannot change or delete a store's records: there is
 * no update or delete route for store data in this file at all, which is what
 * makes it read-only rather than a UI that merely hides the buttons.
 */

const ROLES = ["OWNER", "MANAGER", "STAFF", "TECH"];

module.exports = (prisma) => {
  const router = express.Router();

  // Nothing here is reachable without the master flag.
  router.use(requireSuperAdmin);

  /** Every store, with enough numbers to see at a glance who's busy. */
  router.get("/stores", ah(async (_req, res) => {
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: { users: true, products: true, customers: true, tickets: true, sales: true },
        },
      },
    });
    res.json(stores);
  }));

  router.post("/stores", ah(async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const ownerName = String(req.body?.ownerName ?? "").trim();
    const ownerEmail = String(req.body?.ownerEmail ?? "").toLowerCase().trim();
    const password = String(req.body?.password ?? "");

    if (!name) return res.status(400).json({ error: "Give the store a name." });
    if (!ownerName || !ownerEmail) {
      return res.status(400).json({ error: "The store needs an owner name and email." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "The owner's password must be at least 8 characters." });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const store = await tx.store.create({ data: { name } });
        const owner = await tx.user.create({
          data: {
            name: ownerName,
            email: ownerEmail,
            role: "OWNER",
            passwordHash: await bcrypt.hash(password, 12),
            storeId: store.id,
          },
          select: { id: true, name: true, email: true, role: true },
        });
        // A shop with nowhere to put stock can't add its first item.
        await tx.location.create({ data: { name: "Main", storeId: store.id } });
        return { store, owner };
      });
      res.status(201).json(created);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "That email is already registered." });
      }
      res.status(500).json({ error: err.message });
    }
  }));

  /** Switch a store on or off. The only store-level change the master can make. */
  router.patch("/stores/:id", ah(async (req, res) => {
    const data = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "Give the store a name." });
      data.name = name;
    }
    if (req.body?.active !== undefined) data.active = !!req.body.active;

    try {
      res.json(await prisma.store.update({ where: { id: req.params.id }, data }));
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Store not found." });
      res.status(500).json({ error: err.message });
    }
  }));

  /* --------------------- looking inside one store --------------------- */

  /** Confirms the store exists before any of the reads below. */
  async function findStore(req, res) {
    const store = await prisma.store.findUnique({ where: { id: req.params.id } });
    if (!store) {
      res.status(404).json({ error: "Store not found." });
      return null;
    }
    return store;
  }

  router.get("/stores/:id", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    const [users, products, customers, tickets, openTickets, sales] = await Promise.all([
      prisma.user.count({ where: { storeId: store.id } }),
      prisma.product.count({ where: { storeId: store.id, active: true } }),
      prisma.customer.count({ where: { storeId: store.id } }),
      prisma.ticket.count({ where: { storeId: store.id } }),
      prisma.ticket.count({
        where: { storeId: store.id, status: { notIn: ["COLLECTED", "CANCELLED"] } },
      }),
      prisma.sale.count({ where: { storeId: store.id } }),
    ]);

    res.json({ store, counts: { users, products, customers, tickets, openTickets, sales } });
  }));

  router.get("/stores/:id/inventory", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    const q = req.query.q;
    const where = { storeId: store.id };
    if (!req.query.includeInactive) where.active = true;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { sku: { contains: q } },
        { upc: { contains: q } },
        { brand: { name: { contains: q } } },
        { units: { some: { serial: { contains: q } } } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: 500,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        vendor: { select: { name: true } },
        stockEntries: { select: { quantity: true, costCents: true } },
        units: { select: { status: true } },
      },
    });

    res.json(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand: p.brand?.name ?? null,
        category: p.category?.name ?? null,
        vendor: p.vendor?.name ?? null,
        costCents: p.costCents,
        salePriceCents: p.salePriceCents,
        active: p.active,
        quantity: p.stockEntries.reduce((sum, e) => sum + e.quantity, 0),
        inStockSerials: p.units.filter((u) => u.status === "IN_STOCK").length,
      }))
    );
  }));

  router.get("/stores/:id/customers", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    const q = req.query.q;
    const where = { storeId: store.id };
    if (q) {
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { company: { contains: q } },
      ];
    }

    res.json(
      await prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          phone: true,
          email: true,
          city: true,
          createdAt: true,
          _count: { select: { sales: true, tickets: true } },
        },
      })
    );
  }));

  router.get("/stores/:id/tickets", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    const { q, status } = req.query;
    const where = { storeId: store.id };
    if (status) where.status = status;
    if (q) {
      const asNum = parseInt(String(q).replace(/\D/g, ""), 10);
      where.OR = [
        { deviceMake: { contains: q } },
        { deviceModel: { contains: q } },
        { deviceImei: { contains: q } },
        { issue: { contains: q } },
        { customer: { firstName: { contains: q } } },
        { customer: { lastName: { contains: q } } },
      ];
      if (Number.isFinite(asNum)) where.OR.push({ number: asNum });
    }

    res.json(
      await prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          number: true,
          status: true,
          deviceMake: true,
          deviceModel: true,
          deviceImei: true,
          issue: true,
          estimateCents: true,
          labourCents: true,
          createdAt: true,
          completedAt: true,
          customer: { select: { firstName: true, lastName: true, phone: true } },
          technician: { select: { name: true } },
        },
      })
    );
  }));

  /* ------------------------- staff accounts ------------------------- */

  router.get("/stores/:id/users", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    res.json(
      await prisma.user.findMany({
        where: { storeId: store.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      })
    );
  }));

  /** Add a staff account to a store. */
  router.post("/stores/:id/users", ah(async (req, res) => {
    const store = await findStore(req, res);
    if (!store) return;

    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    const password = String(req.body?.password ?? "");
    const role = String(req.body?.role ?? "STAFF").toUpperCase();

    if (!name || !email) return res.status(400).json({ error: "Name and email are required." });
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Pick a valid role." });

    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          role,
          passwordHash: await bcrypt.hash(password, 12),
          storeId: store.id,
        },
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      });
      res.status(201).json(user);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "That email is already registered." });
      }
      res.status(500).json({ error: err.message });
    }
  }));

  /**
   * Switching a staff account on or off, and password resets. Deliberately no
   * delete: staff are attached to sales and tickets, so history would break.
   */
  router.patch("/users/:userId", ah(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, superAdmin: true },
    });
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.superAdmin) {
      return res.status(400).json({ error: "Master accounts can't be changed from here." });
    }

    const data = {};
    if (req.body?.active !== undefined) data.active = !!req.body.active;
    if (req.body?.role !== undefined) {
      const role = String(req.body.role).toUpperCase();
      if (!ROLES.includes(role)) return res.status(400).json({ error: "Pick a valid role." });
      data.role = role;
    }
    if (req.body?.password) {
      const password = String(req.body.password);
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      }
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    res.json(user);
  }));

  return router;
};
