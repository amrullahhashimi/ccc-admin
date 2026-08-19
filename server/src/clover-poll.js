const clover = require("./clover-config");
const { importOrder } = require("./clover-orders");

/**
 * Watches the connected Clover accounts for sales rung up on the register and
 * brings them back into this app.
 *
 * Polling rather than webhooks, and not by preference: Clover only calls back
 * to an installed developer app, and a merchant API token is not a webhook
 * subscriber. Asking is the only option a token alone gives us.
 * routes/clover-webhook.js still works and shares the same importer, so a shop
 * that does install a developer app gets the faster path for free.
 *
 * Missing a sale is much worse than importing one late, so the window reaches
 * back further than the interval and every order is deduped on cloverOrderId.
 * Overlapping reads are the point, not an accident.
 */

const INTERVAL_MS = Number(process.env.CLOVER_POLL_SECONDS || 60) * 1000;

/**
 * Re-read a little before where we finished last time. A sale can be modified
 * moments after this window closes, and an order that lands on PAID a second
 * late would otherwise be skipped forever.
 */
const OVERLAP_MS = 5 * 60 * 1000;

/**
 * How far back to look when a store has never been polled — the overlap and no
 * more.
 *
 * Deliberately not a long backfill. Reaching back days would import register
 * sales from before the shop switched this on, inventing app sales for
 * handsets that were reconciled by hand long ago. Starting from roughly now
 * means what appears from here is only what actually happens from here.
 */
const FIRST_RUN_MS = OVERLAP_MS;

/** Clover caps a page at 1000; orders arrive far slower than that. */
const PAGE_SIZE = 100;

async function fetchOrders(cfg, since) {
  const url = new URL(`${cfg.apiBase}/v3/merchants/${cfg.merchantId}/orders`);
  url.searchParams.set("filter", `modifiedTime>${since}`);
  url.searchParams.set("expand", "lineItems,payments");
  url.searchParams.set("limit", String(PAGE_SIZE));
  // Oldest first, so a batch is imported in the order the sales happened.
  url.searchParams.set("orderBy", "modifiedTime ASC");

  const resp = await fetch(url, {
    headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Clover answered ${resp.status}.`);
  const data = await resp.json();
  return data.elements ?? [];
}

/** One pass over one store. Errors are contained here so a bad store can't stop the rest. */
async function pollStore(prisma, store) {
  const cfg = clover.configForStore(store);
  if (!clover.isConnected(cfg)) return;

  const since = store.cloverPolledAt
    ? store.cloverPolledAt.getTime() - OVERLAP_MS
    : Date.now() - FIRST_RUN_MS;

  // Stamped before the work, not after: an order that arrives while this pass
  // is running would otherwise fall in the gap between reading and saving.
  const startedAt = new Date();

  const orders = await fetchOrders(cfg, since);
  let imported = 0;

  for (const order of orders) {
    try {
      const result = await importOrder({ prisma, store, order });
      if (result.imported) {
        imported++;
        console.log(
          `[clover poll] ${store.name}: order ${order.id} -> sale ${result.reference} ` +
            `(${result.matched} serial${result.matched === 1 ? "" : "s"} matched` +
            `${result.reviewed ? ", needs review" : ""})`
        );
      }
    } catch (err) {
      // One unimportable order must not block the ones behind it. It stays
      // unimported, and the overlap means the next pass tries again.
      console.error(`[clover poll] ${store.name}: order ${order.id} failed: ${err.message}`);
    }
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { cloverPolledAt: startedAt },
  });

  return imported;
}

async function pollOnce(prisma) {
  const stores = await prisma.store.findMany({
    where: { active: true, cloverApiToken: { not: null } },
  });

  for (const store of stores) {
    try {
      await pollStore(prisma, store);
    } catch (err) {
      console.error(`[clover poll] ${store.name}: ${err.message}`);
    }
  }
}

/**
 * Start polling. Returns a stop function, mostly so tests can shut it down.
 *
 * Passes never overlap: the next one is scheduled after the current finishes,
 * so a slow Clover backs the interval off instead of stacking up requests.
 */
function startPolling(prisma) {
  if (INTERVAL_MS <= 0) {
    console.log("[clover poll] disabled (CLOVER_POLL_SECONDS is 0)");
    return () => {};
  }

  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await pollOnce(prisma);
    } catch (err) {
      console.error("[clover poll] pass failed:", err.message);
    }
    if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
  };

  console.log(`[clover poll] watching for register sales every ${INTERVAL_MS / 1000}s`);
  timer = setTimeout(tick, INTERVAL_MS);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { startPolling, pollOnce, pollStore };
