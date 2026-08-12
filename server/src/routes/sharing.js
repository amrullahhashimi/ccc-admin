const express = require("express");
const { ah } = require("../async-route");
const { storeId } = require("../tenancy");

/**
 * Sharing between stores.
 *
 * The store that owns the data drives everything: they look another shop up by a
 * staff email address, then tick exactly which fields to hand over. There is no
 * directory to browse — you can't see a store exists unless you already know an
 * address there — and no approval step, because a store is giving away its own
 * records and can withdraw them at any moment.
 *
 * Every read below is filtered *server-side* against the grant. A field that
 * isn't ticked never leaves the database, so hiding a column in the UI is not
 * what's protecting it.
 */

/**
 * The catalogue of what can be shared. The UI renders its checkboxes straight
 * from this, so the two can't drift apart.
 */
const PERMISSIONS = {
  inventory: {
    label: "Inventory",
    fields: {
      details: "Item details (name, SKU, brand, category, quantity)",
      costPrice: "Cost price",
      onlinePrice: "Online price",
      salePrice: "Sale price",
      vendors: "Vendors they buy from",
    },
  },
  customers: {
    label: "Customers",
    fields: {
      name: "Name",
      company: "Company",
      phone: "Phone",
      mobile: "Mobile",
      email: "Email",
      address: "Address",
      city: "City and postal code",
      notes: "Notes",
    },
  },
  service: {
    label: "Service tickets",
    fields: {
      details: "Ticket details (number, device, issue, status, dates)",
      imei: "Device IMEI",
      diagnosis: "Diagnosis and notes",
      costs: "Estimate, labour and deposit",
      customer: "Which customer it belongs to",
    },
  },
};

/** Strip anything the client invented; keep only real, ticked fields. */
function sanitise(input) {
  const clean = {};
  for (const [group, spec] of Object.entries(PERMISSIONS)) {
    const given = input?.[group];
    if (!given || typeof given !== "object") continue;
    const picked = {};
    for (const field of Object.keys(spec.fields)) {
      if (given[field] === true) picked[field] = true;
    }
    if (Object.keys(picked).length) clean[group] = picked;
  }
  return clean;
}

const granted = (permissions, group, field) => permissions?.[group]?.[field] === true;

/** Does this grant open anything at all in a group? */
const groupOpen = (permissions, group) =>
  !!permissions?.[group] && Object.values(permissions[group]).some(Boolean);

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /** So the UI can draw the same checkboxes the server enforces. */
  router.get("/catalogue", (_req, res) => res.json(PERMISSIONS));

  /* --------------------------- grants I've made --------------------------- */

  router.get("/", ah(async (req, res) => {
    const me = storeId(req);
    const [outgoing, incoming] = await Promise.all([
      prisma.storeShare.findMany({
        where: { ownerStoreId: me },
        include: { viewerStore: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.storeShare.findMany({
        where: { viewerStoreId: me },
        include: { ownerStore: { select: { id: true, name: true, phone: true, website: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ outgoing, incoming });
  }));

  /**
   * Find a store by one of its staff email addresses. Returns the name only on
   * an exact match, so this can't be used to wander through the store list.
   */
  router.post("/lookup", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Enter the email of someone at that store." });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { store: { select: { id: true, name: true, active: true } } },
    });

    if (!user?.store || !user.store.active) {
      return res.status(404).json({ error: "No store is registered to that email address." });
    }
    if (user.store.id === storeId(req)) {
      return res.status(400).json({ error: "That's your own store." });
    }

    const existing = await prisma.storeShare.findUnique({
      where: {
        ownerStoreId_viewerStoreId: { ownerStoreId: storeId(req), viewerStoreId: user.store.id },
      },
    });

    res.json({
      store: { id: user.store.id, name: user.store.name },
      existing: existing ? { id: existing.id, permissions: existing.permissions } : null,
    });
  }));

  /** Grant, or replace an existing grant, for one store. */
  router.put("/", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    const viewerStoreId = String(req.body?.storeId ?? "").trim();
    if (!viewerStoreId) return res.status(400).json({ error: "Pick a store to share with." });
    if (viewerStoreId === storeId(req)) {
      return res.status(400).json({ error: "That's your own store." });
    }

    const target = await prisma.store.findFirst({ where: { id: viewerStoreId, active: true } });
    if (!target) return res.status(404).json({ error: "That store was not found." });

    const permissions = sanitise(req.body?.permissions);
    if (!Object.keys(permissions).length) {
      return res.status(400).json({ error: "Tick at least one thing to share." });
    }

    const share = await prisma.storeShare.upsert({
      where: {
        ownerStoreId_viewerStoreId: { ownerStoreId: storeId(req), viewerStoreId },
      },
      create: { ownerStoreId: storeId(req), viewerStoreId, permissions },
      update: { permissions },
      include: { viewerStore: { select: { id: true, name: true } } },
    });
    res.json(share);
  }));

  /** Withdraw a grant. Only the store whose data it is may do this. */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    const share = await prisma.storeShare.findUnique({ where: { id: req.params.id } });
    if (!share || share.ownerStoreId !== storeId(req)) {
      return res.status(404).json({ error: "That share was not found." });
    }
    await prisma.storeShare.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  /* ------------------------ reading what I was given ------------------------ */

  /** The grant covering me and this store, or null. */
  async function grantFrom(req, ownerStoreId) {
    const share = await prisma.storeShare.findUnique({
      where: {
        ownerStoreId_viewerStoreId: { ownerStoreId, viewerStoreId: storeId(req) },
      },
      include: { ownerStore: { select: { id: true, name: true, phone: true, website: true } } },
    });
    return share || null;
  }

  async function open(req, res, group) {
    const share = await grantFrom(req, req.params.id);
    if (!share || !groupOpen(share.permissions, group)) {
      res.status(403).json({ error: "That store isn't sharing this with you." });
      return null;
    }
    return share;
  }

  /** Stores sharing something with me, and what each has opened up. */
  router.get("/received", ah(async (req, res) => {
    const shares = await prisma.storeShare.findMany({
      where: { viewerStoreId: storeId(req) },
      include: { ownerStore: { select: { id: true, name: true, phone: true, website: true } } },
    });
    res.json(
      shares
        .filter((s) => Object.keys(s.permissions || {}).length)
        .map((s) => ({ store: s.ownerStore, permissions: s.permissions }))
    );
  }));

  router.get("/:id/inventory", ah(async (req, res) => {
    const share = await open(req, res, "inventory");
    if (!share) return;
    const p = share.permissions;

    const q = req.query.q;
    const where = { storeId: req.params.id, active: true };
    if (q && granted(p, "inventory", "details")) {
      where.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: 500,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        vendor: { select: { name: true } },
        stockEntries: { select: { quantity: true } },
      },
    });

    // Built field by field — anything not ticked never reaches the response.
    res.json(
      products.map((item) => {
        const row = { id: item.id };
        if (granted(p, "inventory", "details")) {
          row.name = item.name;
          row.sku = item.sku;
          row.brand = item.brand?.name ?? null;
          row.category = item.category?.name ?? null;
          row.quantity = item.stockEntries.reduce((sum, e) => sum + e.quantity, 0);
        }
        if (granted(p, "inventory", "costPrice")) row.costCents = item.costCents;
        if (granted(p, "inventory", "onlinePrice")) row.onlinePriceCents = item.onlinePriceCents;
        if (granted(p, "inventory", "salePrice")) row.salePriceCents = item.salePriceCents;
        if (granted(p, "inventory", "vendors")) row.vendor = item.vendor?.name ?? null;
        return row;
      })
    );
  }));

  router.get("/:id/customers", ah(async (req, res) => {
    const share = await open(req, res, "customers");
    if (!share) return;
    const p = share.permissions;

    const customers = await prisma.customer.findMany({
      where: { storeId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json(
      customers.map((c) => {
        const row = { id: c.id };
        if (granted(p, "customers", "name")) {
          row.firstName = c.firstName;
          row.lastName = c.lastName;
        }
        if (granted(p, "customers", "company")) row.company = c.company;
        if (granted(p, "customers", "phone")) row.phone = c.phone;
        if (granted(p, "customers", "mobile")) row.mobile = c.mobile;
        if (granted(p, "customers", "email")) row.email = c.email;
        if (granted(p, "customers", "address")) row.address = c.address;
        if (granted(p, "customers", "city")) {
          row.city = c.city;
          row.postal = c.postal;
        }
        if (granted(p, "customers", "notes")) row.notes = c.notes;
        return row;
      })
    );
  }));

  router.get("/:id/service", ah(async (req, res) => {
    const share = await open(req, res, "service");
    if (!share) return;
    const p = share.permissions;

    const tickets = await prisma.ticket.findMany({
      where: { storeId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { customer: { select: { firstName: true, lastName: true, phone: true } } },
    });

    res.json(
      tickets.map((t) => {
        const row = { id: t.id };
        if (granted(p, "service", "details")) {
          row.number = t.number;
          row.deviceMake = t.deviceMake;
          row.deviceModel = t.deviceModel;
          row.issue = t.issue;
          row.status = t.status;
          row.createdAt = t.createdAt;
          row.completedAt = t.completedAt;
        }
        if (granted(p, "service", "imei")) row.deviceImei = t.deviceImei;
        if (granted(p, "service", "diagnosis")) {
          row.diagnosis = t.diagnosis;
          row.externalNote = t.externalNote;
        }
        if (granted(p, "service", "costs")) {
          row.estimateCents = t.estimateCents;
          row.labourCents = t.labourCents;
          row.depositCents = t.depositCents;
        }
        if (granted(p, "service", "customer") && t.customer) {
          row.customer = [t.customer.firstName, t.customer.lastName].filter(Boolean).join(" ");
          row.customerPhone = t.customer.phone;
        }
        return row;
      })
    );
  }));

  return router;
};

module.exports.PERMISSIONS = PERMISSIONS;
