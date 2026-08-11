const express = require("express");
const cloverStore = require("../clover-store");

/**
 * Inbound sync: a sale rung up directly on the Clover register (not through
 * this app) reaches us here. Staff type/scan the serial into the line
 * item's note at checkout; we match that note against ProductUnit.serial,
 * flip the unit to SOLD, and record a Sale so revenue/reports stay accurate
 * without double entry.
 *
 * SETUP (Clover Developer Dashboard → your app → Settings → Webhooks):
 *   1. Callback URL: {CLOVER_SITE_URL}/oauth/webhook
 *   2. Click "Send Verification Code" — watch this server's log for the
 *      code, paste it back into the dashboard to confirm the URL.
 *   3. Subscribe to "Orders" events. The OAuth connection (/oauth/connect)
 *      must include Orders read permission, or these calls will 401.
 *
 * Clover's webhook contract (docs.clover.com/dev/docs/webhooks):
 *   - One-time handshake: POST { verificationCode } — we store it and log it.
 *   - Ongoing: POST { appId, merchants: { [merchantId]: [{ objectId, type, ts }] } }
 *     with header X-Clover-Auth — the same value on every call after
 *     validation, which we use as a lightweight authenticity check (not
 *     cryptographic; Clover's docs don't specify HMAC verification).
 *   - objectId is prefixed by type: "O:<id>" for Orders. We only act on those.
 *   - Must always respond 200, so we do that first and process afterward.
 */
module.exports = (prisma) => {
  const router = express.Router();

  const apiBase = () => process.env.CLOVER_API_BASE || "https://apisandbox.dev.clover.com";

  async function fetchOrder(merchantId, orderId) {
    const token = await cloverStore.getAccessToken();
    const resp = await fetch(
      `${apiBase()}/v3/merchants/${merchantId}/orders/${orderId}?expand=lineItems,payments`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }
    );
    if (!resp.ok) throw new Error(`Clover order fetch failed (${resp.status}).`);
    return resp.json();
  }

  /** Clover's unitQty is fixed-point, scaled by 1000 (1000 = qty 1). */
  const qtyOf = (li) => {
    const n = Math.round((li.unitQty ?? 1000) / 1000);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  async function processCloverOrder(merchantId, orderId) {
    const already = await prisma.sale.findUnique({ where: { cloverOrderId: orderId } });
    if (already) return; // already synced — webhook retries/duplicates are a no-op

    const order = await fetchOrder(merchantId, orderId);
    if (order.paymentState !== "PAID") return; // wait for the UPDATE event that lands on PAID

    const lineItems = order.lineItems?.elements ?? [];
    const payments = order.payments?.elements ?? [];

    let needsReview = false;
    const lineData = [];
    const unitIdsToMark = [];

    for (const li of lineItems) {
      const note = String(li.note ?? "").trim();
      const quantity = qtyOf(li);
      const unitPriceCents = Math.round(li.price ?? 0);

      const unit = note
        ? await prisma.productUnit.findFirst({ where: { serial: note }, include: { product: true } })
        : null;

      if (unit && unit.status === "IN_STOCK") {
        unitIdsToMark.push(unit.id);
        lineData.push({
          productId: unit.productId,
          name: unit.product.name,
          quantity,
          unitPriceCents,
          costCents: unit.product.costCents,
        });
      } else if (unit) {
        // Serial matched but the unit isn't sellable (already sold/reserved elsewhere).
        needsReview = true;
        lineData.push({
          productId: null,
          name: `${li.name || "Item"} (serial ${note} already ${unit.status.toLowerCase()})`,
          quantity,
          unitPriceCents,
          costCents: 0,
        });
      } else {
        // No note, or it didn't match any serial on file.
        needsReview = true;
        lineData.push({
          productId: null,
          name: note ? `${li.name || "Item"} (serial "${note}" not found)` : li.name || "Clover item",
          quantity,
          unitPriceCents,
          costCents: 0,
        });
      }
    }

    const totalCents = Math.round(order.total ?? 0);
    const subtotalCents = lineData.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const taxCents = Math.max(0, totalCents - subtotalCents);

    const pays = payments.length
      ? payments.map((p) => ({ amountCents: Math.round(p.amount ?? 0), method: "CARD", reference: p.id || null }))
      : [{ amountCents: totalCents, method: "CARD", reference: null }];

    await prisma.$transaction(async (tx) => {
      for (const unitId of unitIdsToMark) {
        await tx.productUnit.update({ where: { id: unitId }, data: { status: "SOLD" } });
      }

      const last = await tx.sale.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 1000) + 1;

      await tx.sale.create({
        data: {
          number,
          source: "CLOVER",
          cloverOrderId: orderId,
          status: "PAID",
          needsReview,
          subtotalCents,
          taxCents,
          totalCents,
          items: { create: lineData },
          payments: { create: pays },
        },
      });
    });
  }

  // server.js already mounts express.json() globally before this router.
  router.post("/webhook", async (req, res) => {
    // One-time handshake — store the code so it can be pasted into the dashboard.
    if (req.body?.verificationCode) {
      cloverStore.patch({ webhookVerificationCode: req.body.verificationCode });
      console.log(`[clover webhook] verification code: ${req.body.verificationCode}`);
      return res.sendStatus(200);
    }

    const merchants = req.body?.merchants;
    if (!merchants || typeof merchants !== "object") return res.sendStatus(200);

    // Trust-on-first-use: remember the auth header the first time we see one,
    // then require it to match on every later call.
    const authHeader = req.get("X-Clover-Auth");
    const known = cloverStore.read()?.webhookAuth;
    if (known && authHeader && known !== authHeader) {
      console.warn("[clover webhook] X-Clover-Auth mismatch — ignoring payload.");
      return res.sendStatus(200);
    }
    if (!known && authHeader) cloverStore.patch({ webhookAuth: authHeader });

    res.sendStatus(200); // Clover just wants a fast 200 — process after responding.

    for (const [merchantId, updates] of Object.entries(merchants)) {
      for (const u of Array.isArray(updates) ? updates : []) {
        if (typeof u.objectId !== "string" || !u.objectId.startsWith("O:")) continue;
        const orderId = u.objectId.slice(2);
        try {
          await processCloverOrder(merchantId, orderId);
        } catch (err) {
          console.error(`[clover webhook] failed to process order ${orderId}:`, err.message);
        }
      }
    }
  });

  router.processCloverOrder = processCloverOrder; // exposed for testing
  return router;
};
