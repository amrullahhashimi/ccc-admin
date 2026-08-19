const express = require("express");
const { ah } = require("../async-route");
const { storeId } = require("../tenancy");
const clover = require("../clover-config");
const { pollStore } = require("../clover-poll");

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

  return router;
};
