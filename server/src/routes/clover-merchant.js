const express = require("express");
const { ah } = require("../async-route");
const { storeId } = require("../tenancy");
const clover = require("../clover-config");
const { pollStore } = require("../clover-poll");

/**
 * A read-through window onto the connected Clover merchant account.
 *
 * The Merchant inventory tab renders straight from these — nothing is copied
 * into our database, so what the shop sees here is whatever Clover holds right
 * now. Local inventory (ProductUnit, serials, costs) stays in routes/products.
 *
 * The API token never leaves the server: the browser asks us, we ask Clover.
 * That is the whole reason this route exists rather than the page calling
 * api.clover.com directly.
 */

/** Clover caps a page at 1000; 50 keeps the table responsive. */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /**
   * The caller's Clover credentials, or a 501 explaining where to set them up.
   * Returns null once it has answered, so handlers read as `if (!cfg) return;`.
   */
  async function configOr501(req, res) {
    const store = await prisma.store.findUnique({ where: { id: storeId(req) } });
    const cfg = clover.configForStore(store);
    if (!clover.isConnected(cfg)) {
      res.status(501).json({
        error: "This store isn't connected to Clover yet — set it up in Store settings.",
        notConnected: true,
      });
      return null;
    }
    return cfg;
  }

  /**
   * One call to the merchant's REST API.
   *
   * Clover reports a dead or revoked token as 401, which is worth translating:
   * to the shop it means "reconnect", not "something went wrong".
   */
  async function cloverGet(cfg, path, params = {}) {
    const url = new URL(`${cfg.apiBase}/v3/merchants/${cfg.merchantId}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    let resp;
    try {
      resp = await fetch(url, {
        headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
      });
    } catch {
      const e = new Error("Couldn't reach Clover. Check the server's internet connection.");
      e.status = 502;
      throw e;
    }

    if (resp.status === 401 || resp.status === 403) {
      const e = new Error("Clover refused the saved token — reconnect the account in Store settings.");
      e.status = 502;
      throw e;
    }
    if (!resp.ok) {
      const e = new Error(`Clover answered ${resp.status}.`);
      e.status = 502;
      throw e;
    }
    return resp.json();
  }

  /**
   * Flatten one Clover item into what the table draws.
   *
   * Two quantities matter and they are not the same thing: `itemStock.quantity`
   * is what stock tracking says is on the shelf, while `stockCount` on the item
   * is often 0 for anything Clover doesn't track. Prefer the former, fall back
   * to the latter, and let null mean "not tracked" rather than "none left".
   */
  function shapeItem(item) {
    const tracked = item.itemStock?.quantity ?? item.itemStock?.stockCount;

    return {
      id: item.id,
      name: item.name ?? "",
      // The barcode/SKU staff actually scan. Clover splits these across two fields.
      code: item.code ?? item.sku ?? null,
      priceCents: typeof item.price === "number" ? item.price : null,
      // VARIABLE means the price is keyed in at the register, so a 0 here isn't free.
      variablePrice: item.priceType === "VARIABLE",
      quantity: typeof tracked === "number" ? tracked : null,
      categories: (item.categories?.elements ?? []).map((c) => c.name).filter(Boolean),
      hidden: !!item.hidden,
      available: item.available !== false,
      modifiedAt: item.modifiedTime ?? null,
    };
  }

  /* ----------------------------- inventory ----------------------------- */

  /**
   * A page of the merchant's items, newest changes first.
   *
   * Clover's list endpoints return no total, so paging is "did we get a full
   * page?" rather than a page count — hence `hasMore` instead of `pages`.
   */
  router.get("/inventory", ah(async (req, res) => {
    const cfg = await configOr501(req, res);
    if (!cfg) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const search = String(req.query.search ?? "").trim();

    // Clover's filter grammar wants a SQL-ish LIKE with its own wildcards; the
    // URL builder handles escaping, so the raw string goes in as typed.
    const filter = search ? `name LIKE %${search}%` : undefined;

    const data = await cloverGet(cfg, "items", {
      limit,
      offset,
      filter,
      expand: "categories,itemStock",
    });

    const elements = data.elements ?? [];
    res.json({
      items: elements.map(shapeItem),
      offset,
      limit,
      hasMore: elements.length === limit,
      merchantId: cfg.merchantId,
      env: cfg.env,
    });
  }));

  /**
   * Headline counts for the tab.
   *
   * Clover won't total a collection, so this pages through ids to get a real
   * number. It's a handful of requests at 1000 per page and the page asks for
   * it once on load, separately from the table, so a slow count never holds up
   * the rows.
   */
  router.get("/inventory/summary", ah(async (req, res) => {
    const cfg = await configOr501(req, res);
    if (!cfg) return;

    const PAGE = 1000;
    // A ceiling so a runaway account can't hold the request open indefinitely.
    const MAX_PAGES = 30;

    let total = 0;
    let tracked = 0;
    let inStock = 0;
    let complete = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await cloverGet(cfg, "items", {
        limit: PAGE,
        offset: page * PAGE,
        expand: "itemStock",
      });
      const elements = data.elements ?? [];

      for (const item of elements) {
        total++;
        const qty = item.itemStock?.quantity ?? item.itemStock?.stockCount;
        if (typeof qty === "number") {
          tracked++;
          if (qty > 0) inStock++;
        }
      }

      if (elements.length < PAGE) {
        complete = true;
        break;
      }
    }

    res.json({ total, tracked, inStock, complete, merchantId: cfg.merchantId, env: cfg.env });
  }));


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
