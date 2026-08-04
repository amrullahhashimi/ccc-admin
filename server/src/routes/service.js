const express = require("express");

// Stored enum (the DB model is still `Ticket`) ← → what the UI shows.
const STATUSES = ["INTAKE", "DIAGNOSING", "WAITING_PARTS", "READY", "COLLECTED", "CANCELLED"];

const lineTotal = (p) => (p.quantity || 0) * (p.priceCents || 0);

/** Split line items into parts (from inventory) vs labour (manual), with totals. */
function withTotals(t) {
  const parts = t.parts ?? [];
  const partsCents = parts.filter((p) => p.productId).reduce((s, p) => s + lineTotal(p), 0);
  const labourCents = parts.filter((p) => !p.productId).reduce((s, p) => s + lineTotal(p), 0);
  return { ...t, partsCents, labourCents, totalCents: partsCents + labourCents };
}

function shapeService(body) {
  const d = {};
  ["deviceMake", "deviceModel", "deviceImei", "passcode", "issue", "diagnosis",
   "receiptNote", "externalNote", "internalNote"].forEach((k) => {
    if (body[k] !== undefined) d[k] = body[k] === "" ? null : String(body[k]).trim();
  });
  if (body.status !== undefined && STATUSES.includes(body.status)) d.status = body.status;
  if (body.warranty !== undefined) d.warranty = !!body.warranty;
  if (body.technicianId !== undefined) d.technicianId = body.technicianId || null;
  if (body.locationId !== undefined) d.locationId = body.locationId || null;
  if (body.dateIn !== undefined) d.dateIn = body.dateIn ? new Date(body.dateIn) : null;
  if (body.promisedAt !== undefined) d.promisedAt = body.promisedAt ? new Date(body.promisedAt) : null;
  if (body.estimate !== undefined && body.estimate !== "") {
    d.estimateCents = Math.round(parseFloat(body.estimate) * 100) || 0;
  }
  if (body.deposit !== undefined && body.deposit !== "") {
    d.depositCents = Math.round(parseFloat(body.deposit) * 100) || 0;
  }
  if (body.status === "COLLECTED") d.completedAt = new Date();
  return d;
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  const include = {
    customer: { select: { id: true, firstName: true, lastName: true, phone: true, mobile: true } },
    technician: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
    parts: {
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { id: "asc" },
    },
  };

  /* ------------------------------- list ------------------------------- */
  router.get("/", async (req, res) => {
    try {
      const { q, status, customerId } = req.query;
      const where = {};
      if (status && STATUSES.includes(status)) where.status = status;
      if (customerId) where.customerId = customerId;
      if (q) {
        const asNum = parseInt(String(q).replace(/\D/g, ""), 10);
        where.OR = [
          { deviceMake: { contains: q } },
          { deviceModel: { contains: q } },
          { deviceImei: { contains: q } },
          { issue: { contains: q } },
          { customer: { firstName: { contains: q } } },
          { customer: { lastName: { contains: q } } },
          { customer: { phone: { contains: q } } },
        ];
        if (Number.isFinite(asNum)) where.OR.push({ number: asNum });
      }

      const rows = await prisma.ticket.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      res.json(rows.map(withTotals));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------- one ------------------------------- */
  router.get("/:id", async (req, res) => {
    const t = await prisma.ticket.findUnique({ where: { id: req.params.id }, include });
    if (!t) return res.status(404).json({ error: "Service order not found." });
    res.json(withTotals(t));
  });

  /* ------------------------------ create ------------------------------ */
  router.post("/", async (req, res) => {
    try {
      if (!req.body?.customerId) return res.status(400).json({ error: "Pick a customer." });
      const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
      if (!customer) return res.status(400).json({ error: "That customer no longer exists." });

      // Next service number — sequence starts at 1001.
      const last = await prisma.ticket.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 1000) + 1;

      const created = await prisma.ticket.create({
        data: {
          number,
          customerId: req.body.customerId,
          ...shapeService(req.body),
          issue: (req.body.issue ?? "").toString().trim(),
          status: STATUSES.includes(req.body.status) ? req.body.status : "INTAKE",
        },
        include,
      });
      res.status(201).json(withTotals(created));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------ update ------------------------------ */
  router.patch("/:id", async (req, res) => {
    try {
      const updated = await prisma.ticket.update({
        where: { id: req.params.id },
        data: shapeService(req.body),
        include,
      });
      res.json(withTotals(updated));
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Service order not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /* --------------------------- line items --------------------------- */

  // Add a part (from inventory, has productId) or a labour line (no productId).
  router.post("/:id/lines", async (req, res) => {
    try {
      const t = await prisma.ticket.findUnique({ where: { id: req.params.id } });
      if (!t) return res.status(404).json({ error: "Service order not found." });

      const isPart = !!req.body?.productId;
      let name = String(req.body?.name ?? "").trim();
      let priceCents =
        req.body?.price !== undefined && req.body.price !== ""
          ? Math.round(parseFloat(req.body.price) * 100) || 0
          : 0;

      if (isPart) {
        const product = await prisma.product.findUnique({ where: { id: req.body.productId } });
        if (!product) return res.status(400).json({ error: "That product no longer exists." });
        if (!name) name = product.name;
        if (req.body.price === undefined || req.body.price === "") priceCents = product.salePriceCents;
      }
      if (!name) return res.status(400).json({ error: isPart ? "Pick a product." : "Describe the labour." });

      const quantity = Math.max(1, parseInt(req.body?.quantity, 10) || 1);

      const line = await prisma.ticketPart.create({
        data: {
          ticketId: req.params.id,
          productId: isPart ? req.body.productId : null,
          name,
          quantity,
          priceCents,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
      res.status(201).json(line);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/lines/:lineId", async (req, res) => {
    try {
      const data = {};
      if (req.body?.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body?.quantity !== undefined) data.quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
      if (req.body?.price !== undefined) {
        data.priceCents = req.body.price === "" ? 0 : Math.round(parseFloat(req.body.price) * 100) || 0;
      }
      const line = await prisma.ticketPart.update({
        where: { id: req.params.lineId },
        data,
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
      res.json(line);
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Line not found." });
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/lines/:lineId", async (req, res) => {
    try {
      await prisma.ticketPart.delete({ where: { id: req.params.lineId } });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Line not found." });
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------ delete ------------------------------ */
  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const t = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: { sale: true } });
      if (!t) return res.status(404).json({ error: "Service order not found." });
      if (t.sale) {
        return res.status(409).json({ error: "This service order has a sale attached — it can't be deleted." });
      }
      await prisma.ticket.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};