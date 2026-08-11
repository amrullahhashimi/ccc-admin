const express = require("express");
const cloverStore = require("../clover-store");

const METHODS = ["CASH", "CARD", "ETRANSFER", "OTHER"];
const GST_RATE = 0.05;

/**
 * A sale is customer-attached, has line items (each either a serialized unit,
 * a quantity-tracked product, or a free-form line), and one or more payments.
 * Completing a sale marks serialized units SOLD and writes a negative stock
 * entry for quantity items. Numbers are assigned in code (max + 1) like tickets.
 */
module.exports = (prisma, requireRole) => {
  const router = express.Router();

  const totalsOf = (lines) => {
    const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const taxableBase = lines
      .filter((l) => l.taxable)
      .reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const taxCents = Math.round(taxableBase * GST_RATE);
    return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  };

  /* ------------------------------- list ------------------------------- */

  router.get("/", async (req, res) => {
    try {
      const { q, status } = req.query;
      const where = {};
      if (status) where.status = status;
      if (q) {
        const asNum = parseInt(q, 10);
        where.OR = [
          { customer: { firstName: { contains: q } } },
          { customer: { lastName: { contains: q } } },
          { customer: { phone: { contains: q } } },
          ...(Number.isFinite(asNum) ? [{ number: asNum }] : []),
        ];
      }
      const sales = await prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      res.json(sales);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          location: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!sale) return res.status(404).json({ error: "Sale not found." });
      res.json(sale);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ------------------------------ create ------------------------------ */

  router.post("/", async (req, res) => {
    try {
      const { customerId, locationId, items, payments } = req.body;

      if (!customerId) return res.status(400).json({ error: "A customer is required." });
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) return res.status(400).json({ error: "That customer no longer exists." });

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Add at least one item to the sale." });
      }

      // Normalise the incoming lines.
      const lines = items.map((raw) => {
        const name = String(raw.name ?? "").trim();
        if (!name) throw new Error("Every line needs a name.");
        const unitId = raw.unitId || null;
        const quantity = unitId ? 1 : Math.max(1, parseInt(raw.quantity, 10) || 1);
        return {
          productId: raw.productId || null,
          unitId,
          name,
          quantity,
          unitPriceCents: Math.round(Number(raw.unitPriceCents)) || 0,
          costCents: Math.round(Number(raw.costCents)) || 0,
          taxable: raw.taxable !== false,
        };
      });

      const { subtotalCents, taxCents, totalCents } = totalsOf(lines);

      const pays = (Array.isArray(payments) ? payments : []).map((p) => ({
        amountCents: Math.round(Number(p.amountCents)) || 0,
        method: METHODS.includes(p.method) ? p.method : "CASH",
        reference: p.reference ? String(p.reference).trim() : null,
      }));
      const paidCents = pays.reduce((s, p) => s + p.amountCents, 0);
      const status = totalCents > 0 && paidCents >= totalCents ? "PAID" : "OPEN";

      const sale = await prisma.$transaction(async (tx) => {
        // Move stock: serials → SOLD, quantity products → negative stock entry.
        for (const l of lines) {
          if (l.unitId) {
            const unit = await tx.productUnit.findUnique({ where: { id: l.unitId } });
            if (!unit) throw new Error(`A serial on "${l.name}" no longer exists.`);
            if (unit.status !== "IN_STOCK") {
              throw new Error(`Serial ${unit.serial} is no longer in stock.`);
            }
            await tx.productUnit.update({ where: { id: l.unitId }, data: { status: "SOLD" } });
          } else if (l.productId) {
            await tx.stockEntry.create({
              data: {
                productId: l.productId,
                quantity: -l.quantity,
                costCents: l.costCents,
                note: "Sale",
              },
            });
          }
        }

        const last = await tx.sale.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
        const number = (last?.number ?? 1000) + 1;

        return tx.sale.create({
          data: {
            number,
            customerId,
            locationId: locationId || null,
            userId: req.user?.id ?? null,
            subtotalCents,
            taxCents,
            totalCents,
            status,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                name: l.name,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                costCents: l.costCents,
              })),
            },
            payments: pays.length
              ? { create: pays.map((p) => ({ amountCents: p.amountCents, method: p.method, reference: p.reference })) }
              : undefined,
          },
          include: {
            customer: true,
            location: { select: { id: true, name: true } },
            items: true,
            payments: { orderBy: { createdAt: "asc" } },
          },
        });
      });

      res.status(201).json(sale);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------- payments ---------------------------- */

  /** Add a payment to an existing sale; flips it to PAID once fully covered. */
  router.post("/:id/payments", async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: req.params.id },
        include: { payments: true },
      });
      if (!sale) return res.status(404).json({ error: "Sale not found." });
      if (sale.status === "VOID") return res.status(409).json({ error: "That sale is void." });

      const amountCents = Math.round(Number(req.body.amountCents)) || 0;
      if (amountCents === 0) return res.status(400).json({ error: "Enter a payment amount." });

      await prisma.payment.create({
        data: {
          saleId: sale.id,
          amountCents,
          method: METHODS.includes(req.body.method) ? req.body.method : "CASH",
          reference: req.body.reference ? String(req.body.reference).trim() : null,
        },
      });

      const paid = sale.payments.reduce((s, p) => s + p.amountCents, 0) + amountCents;
      const status = paid >= sale.totalCents ? "PAID" : "OPEN";

      const updated = await prisma.sale.update({
        where: { id: sale.id },
        data: { status },
        include: {
          customer: true,
          location: { select: { id: true, name: true } },
          items: true,
          payments: { orderBy: { createdAt: "asc" } },
        },
      });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ------------------------------ void ------------------------------ */

  /**
   * Void a sale — reverses stock (serials back to IN_STOCK, a positive stock
   * entry for quantity lines) so nothing is lost. Owners/managers only.
   */
  router.post("/:id/void", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!sale) return res.status(404).json({ error: "Sale not found." });
      if (sale.status === "VOID") return res.status(409).json({ error: "Already void." });

      const updated = await prisma.$transaction(async (tx) => {
        for (const item of sale.items) {
          if (item.productId) {
            // Put the quantity back on the shelf.
            await tx.stockEntry.create({
              data: {
                productId: item.productId,
                quantity: item.quantity,
                costCents: item.costCents,
                note: `Void of sale #${sale.number}`,
              },
            });
          }
        }
        return tx.sale.update({ where: { id: sale.id }, data: { status: "VOID" } });
      });

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* --------------------------- card (Clover Flex) --------------------------- */

  /**
   * Push an amount to the Clover Flex over the cloud (REST Pay Display / Cloud
   * Pay Display) and, on approval, record it as a CARD payment.
   *
   * CONFIG — set these in the server's .env. The OAuth token MUST stay
   * server-side, never shipped to the browser:
   *   CLOVER_BASE_URL     sandbox: https://scl-sandbox.dev.clover.com
   *                       production: https://scl.clover.com
   *   CLOVER_RAID         your semi-integrated app's Remote App ID  -> X-POS-Id
   *   CLOVER_DEVICE_ID    the Flex serial number                    -> X-Clover-Device-Id
   *   CLOVER_OAUTH_TOKEN  merchant OAuth access token               -> Authorization: Bearer
   *
   * Until those exist the route returns 501, so the "Pay by card" button
   * degrades gracefully instead of erroring hard.
   */
  /**
   * Charge the balance on the Clover Flex via REST Pay Display (cloud), then
   * return the Clover payment id. This is a SERVER-SIDE, SYNCHRONOUS call: the
   * HTTP request resolves only once the customer taps/inserts on the Flex, so
   * expect it to hang for a while and don't set a short timeout. Cloud Pay
   * Display must be installed and OPEN (foreground) on the Flex.
   *
   * ENV:
   *   CLOVER_API_BASE   sandbox: https://apisandbox.dev.clover.com
   *                     production: https://api.clover.com
   *   CLOVER_RAID       Remote App ID       -> X-POS-Id header
   *   CLOVER_DEVICE_ID  Flex serial number  -> X-Clover-Device-Id header
   * The OAuth access token comes from the /oauth/connect flow (clover-store),
   * falling back to a CLOVER_OAUTH_TOKEN env var if you set one manually.
   */
  async function chargeOnClover({ amountCents, externalId }) {
    const apiBase = process.env.CLOVER_API_BASE || "https://apisandbox.dev.clover.com";
    const raid = process.env.CLOVER_RAID;
    const deviceId = process.env.CLOVER_DEVICE_ID;

    let token;
    try {
      token = await cloverStore.getAccessToken();
    } catch {
      token = process.env.CLOVER_OAUTH_TOKEN; // manual fallback for a token set outside the OAuth flow
    }

    if (!raid || !deviceId || !token) {
      const e = new Error(
        "Clover isn't ready. Set CLOVER_RAID and CLOVER_DEVICE_ID, and connect the account at /oauth/connect."
      );
      e.status = 501;
      throw e;
    }

    // Every /connect call needs these headers. Idempotency-Key stops a dropped
    // response from double-charging on retry.
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "x-clover-device-id": deviceId,
      "x-pos-id": raid,
      "idempotency-key": externalId,
      authorization: `Bearer ${token}`,
    };

    // CONFIRM this resource + body against your REST Pay Display API reference
    // (docs.clover.com/dev/docs/rest-pay-overview). All calls are POST to
    // `${apiBase}/connect/v1/...`; the Sale body carries the amount in cents.
    const resp = await fetch(`${apiBase}/connect/v1/payments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ amount: amountCents, externalPaymentId: externalId }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || `Clover declined or errored (${resp.status}).`);

    // Pull the payment id however your reference returns it (id / paymentId).
    const paymentId = data.paymentId || data.id || (data.payment && data.payment.id) || null;
    return { paymentId };
  }

  router.post("/:id/clover-pay", async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: req.params.id },
        include: { payments: true },
      });
      if (!sale) return res.status(404).json({ error: "Sale not found." });
      if (sale.status === "VOID") return res.status(409).json({ error: "That sale is void." });

      const paid = sale.payments.reduce((s, p) => s + p.amountCents, 0);
      const balance = sale.totalCents - paid;
      const amountCents = Math.round(Number(req.body.amountCents)) || balance;
      if (amountCents <= 0) return res.status(400).json({ error: "Nothing left to charge." });

      const result = await chargeOnClover({ amountCents, externalId: `sale-${sale.number}-${Date.now()}` });

      await prisma.payment.create({
        data: { saleId: sale.id, amountCents, method: "CARD", reference: result.paymentId || null },
      });

      const newPaid = paid + amountCents;
      const status = newPaid >= sale.totalCents ? "PAID" : "OPEN";
      const updated = await prisma.sale.update({
        where: { id: sale.id },
        data: { status },
        include: {
          customer: true,
          location: { select: { id: true, name: true } },
          items: true,
          payments: { orderBy: { createdAt: "asc" } },
        },
      });
      res.json(updated);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
};