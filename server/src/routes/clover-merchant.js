const express = require("express");
const { ah } = require("../async-route");
const { storeId } = require("../tenancy");
const clover = require("../clover-config");
const { pollStore } = require("../clover-poll");
const { methodOf } = require("../clover-orders");

/**
 * The connected Clover account, as far as this app needs to reach it.
 *
 * Only the register-sale sync lives here now: where the automatic pass has
 * got to, and a manual run. Browsing the merchant's own catalogue was dropped
 * — Clover's own dashboard does that better, and mirroring it here meant a
 * second place to keep in step.
 *
 * The API token never leaves the server: the browser asks us, we ask Clover.
 */

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /* --------------------------- register sales --------------------------- */

  /**
   * Where the automatic sync has got to.
   *
   * A background timer is invisible from the outside, and a hosted app can be
   * restarted or idled without anyone noticing it stopped. Showing the last
   * pass makes the difference between "no sales yet" and "nothing is running"
   * something you can see rather than guess at.
   */
  router.get("/sync", ah(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { id: storeId(req) } });
    if (!store) return res.status(404).json({ error: "Store not found." });

    const imported = await prisma.sale.count({
      where: { storeId: store.id, source: "CLOVER" },
    });

    res.json({
      connected: clover.isConnected(clover.configForStore(store)),
      lastPolledAt: store.cloverPolledAt,
      intervalSeconds: Number(process.env.CLOVER_POLL_SECONDS || 60),
      importedTotal: imported,
    });
  }));

  /**
   * Pull register sales in now, looking back further than the automatic pass.
   *
   * Reports what it saw rather than just a count: an order that was skipped
   * says why, which is the difference between diagnosing this and guessing.
   * The automatic cursor is left alone so a manual catch-up can't cause the
   * background pass to skip a window.
   */
  router.post("/sync", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { id: storeId(req) } });
    if (!store) return res.status(404).json({ error: "Store not found." });

    const cfg = clover.configForStore(store);
    if (!clover.isConnected(cfg)) {
      return res.status(501).json({
        error: "This store isn't connected to Clover yet — set it up in Store settings.",
        notConnected: true,
      });
    }

    // Capped so one click can't drag in months of history by accident.
    const hours = Math.min(Math.max(parseInt(req.body?.hours, 10) || 24, 1), 168);

    const report = await pollStore(prisma, store, {
      sinceMs: hours * 60 * 60 * 1000,
      advanceCursor: false,
    });

    res.json({ ...report, hours });
  }));


  /**
   * Re-read how already-imported sales were actually paid.
   *
   * Every register sale used to be filed as CARD regardless of tender, so a
   * drawer full of cash reads back as card takings. Each of those rows kept
   * its Clover payment id, so the truth can be fetched and put right rather
   * than guessed at.
   *
   * Deliberately its own button, not folded into Sync now: this rewrites
   * records that already exist, and that should be something you asked for
   * rather than a side effect of checking for new sales.
   */
  router.post("/payments/repair", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { id: storeId(req) } });
    if (!store) return res.status(404).json({ error: "Store not found." });

    const cfg = clover.configForStore(store);
    if (!clover.isConnected(cfg)) {
      return res.status(501).json({
        error: "This store isn't connected to Clover yet — set it up in Store settings.",
        notConnected: true,
      });
    }

    const rows = await prisma.payment.findMany({
      where: {
        reference: { not: null },
        sale: { storeId: store.id, source: "CLOVER" },
      },
      select: { id: true, reference: true, method: true, details: true },
    });

    // Fetched a page at a time rather than one request per row. Asking Clover
    // for each payment separately earns a 429 within a dozen calls — measured,
    // not guessed — and a repair that gives up half way through is worse than
    // none, because the half it managed looks like the whole job.
    const wanted = new Set(rows.map((r) => r.reference));
    const byId = new Map();
    const PAGE = 100;
    const MAX_PAGES = 50;

    for (let page = 0; page < MAX_PAGES && wanted.size; page++) {
      const url = new URL(`${cfg.apiBase}/v3/merchants/${cfg.merchantId}/payments`);
      url.searchParams.set("expand", "tender,cardTransaction");
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("offset", String(page * PAGE));

      const resp = await fetch(url, {
        headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `Clover answered ${resp.status} while reading payments.` });
      }

      const elements = (await resp.json()).elements ?? [];
      for (const payment of elements) {
        if (wanted.delete(payment.id)) byId.set(payment.id, payment);
      }
      if (elements.length < PAGE) break; // reached the end of the account
    }

    let checked = 0;
    let corrected = 0;
    const missing = [];

    for (const row of rows) {
      const payment = byId.get(row.reference);
      if (!payment) {
        // Older than the pages we read, or deleted on Clover's side.
        missing.push(row.reference);
        continue;
      }

      checked++;
      const { method, details } = methodOf(payment);

      // Only write where something differs, so a second run corrects nothing
      // and the count means what it says.
      if (method !== row.method || (details ?? null) !== (row.details ?? null)) {
        await prisma.payment.update({ where: { id: row.id }, data: { method, details } });
        corrected++;
      }
    }

    res.json({ found: rows.length, checked, corrected, missing });

  }));

  return router;
};
