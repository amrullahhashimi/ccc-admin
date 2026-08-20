const express = require("express");
const cloverStore = require("../clover-store");
const cloverConfig = require("../clover-config");
const { importOrder } = require("../clover-orders");

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

  /**
   * The store that connected this merchant account. cloverMerchantId is unique,
   * so the payload's merchant id is enough to know whose order this is — and
   * whose credentials may read it.
   */
  const storeForMerchant = (merchantId) =>
    prisma.store.findFirst({ where: { cloverMerchantId: merchantId } });

  async function fetchOrder(store, merchantId, orderId) {
    const cfg = cloverConfig.configForStore(store);
    // A shop still configured through /oauth/connect has no token on its row.
    const token = cfg.token || (await cloverStore.getAccessToken());
    const resp = await fetch(
      `${cfg.apiBase}/v3/merchants/${merchantId}/orders/${orderId}?expand=lineItems,payments.tender,payments.cardTransaction,refunds`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }
    );
    if (!resp.ok) throw new Error(`Clover order fetch failed (${resp.status}).`);
    return resp.json();
  }

  /**
   * Fetch the order and hand it to the shared importer — the same one the
   * poller uses, so a shop on webhooks and a shop on polling get identical
   * results and there is only one place to fix a matching bug.
   */
  async function processCloverOrder(merchantId, orderId) {
    const store = await storeForMerchant(merchantId);
    if (!store) return; // no store has connected this account — nothing to file it under

    const order = await fetchOrder(store, merchantId, orderId);
    const result = await importOrder({ prisma, store, order });
    if (result.imported) {
      console.log(`[clover webhook] order ${orderId} -> sale ${result.reference}`);
    }
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
