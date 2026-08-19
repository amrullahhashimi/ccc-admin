const clover = require("./clover-config");

/**
 * Pushing a newly-added serial up to the connected Clover merchant account.
 *
 * One serial is one physical handset, so it becomes one Clover item with a
 * stock count of 1 — matching how the account is already organised, where each
 * device is its own line rather than a quantity against a shared model.
 *
 * Every function here is best-effort by design. Taking stock in has to succeed
 * whether or not Clover is reachable: a shop can't stop booking in phones
 * because an API is down. Failures are reported back to the caller, never
 * thrown into the middle of a local write.
 */

/** The register shows these, so they read as words rather than enum constants. */
const CONDITION_LABELS = {
  NEW: "New",
  OPEN_BOX: "Open box",
  USED_LIKE_NEW: "Used - like new",
  USED_GOOD: "Used - good",
  USED_FAIR: "Used - fair",
  FOR_PARTS: "For parts",
};

/**
 * The item name staff will see on the register:
 *
 *   Google Pixel 10 | 128gb | New | screen has a hairline scratch
 *
 * Device, storage, condition and the note, in that order, with blanks dropped
 * so a unit with no storage or note doesn't leave empty separators behind.
 * Pipes match the naming already used across the account.
 */
function itemNameFor(product, unit) {
  return [
    product?.name,
    unit?.storage,
    CONDITION_LABELS[unit?.condition] ?? unit?.condition,
    unit?.note,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

/**
 * The body sent to Clover, exported so it can be checked without a network call.
 *
 * The unit's sale price is deliberately never pushed. Used handsets are
 * negotiated at the counter, so a figure sent from here would be wrong as often
 * as right; VARIABLE makes the register ask every time instead of quietly
 * ringing up a stale number.
 *
 * `price` is still sent as 0 because Clover rejects the item without it
 * ("'price' is required to be non-null") — it is a placeholder that VARIABLE
 * tells the till to ignore, and it matches how the account's own items are
 * already set up.
 */
function itemPayloadFor(product, unit) {
  return {
    name: itemNameFor(product, unit),
    // The serial is the scannable code on the item — an IMEI, in practice.
    code: unit.serial,
    price: 0,
    priceType: "VARIABLE",
  };
}

async function cloverPost(cfg, path, payload) {
  let resp;
  try {
    resp = await fetch(`${cfg.apiBase}/v3/merchants/${cfg.merchantId}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach Clover.");
  }

  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Clover refused the saved token — reconnect the account in Store settings.");
  }
  if (!resp.ok) {
    throw new Error(data.message || `Clover answered ${resp.status}.`);
  }
  return data;
}

async function cloverGet(cfg, path) {
  const resp = await fetch(`${cfg.apiBase}/v3/merchants/${cfg.merchantId}/${path}`, {
    headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Clover answered ${resp.status}.`);
  return resp.json();
}

/**
 * Make the Clover item match this serial — creating it if there isn't one yet.
 *
 * The same call covers both because they are the same intent, and because a
 * unit added while the store was disconnected has no item to update. Editing
 * it afterwards is then the natural moment to put that right, rather than
 * leaving the serial permanently missing from the register.
 *
 * Resolves to { ok, itemId, error } rather than throwing: the unit is already
 * saved locally by the time this runs, and a Clover outage must not undo that.
 */
async function syncUnit({ prisma, cfg, product, unit }) {
  if (!clover.isConnected(cfg)) return { ok: false, itemId: null, error: null };

  const payload = itemPayloadFor(product, unit);

  try {
    if (unit.cloverItemId) {
      // Clover updates through POST to the item's own path, not PUT.
      await cloverPost(cfg, `items/${unit.cloverItemId}`, payload);
      return { ok: true, itemId: unit.cloverItemId, error: null };
    }

    const item = await cloverPost(cfg, "items", payload);
    if (!item?.id) throw new Error("Clover created the item but returned no id.");

    // One serial is one handset. If stock can't be set the item still exists
    // and is sellable, so this is logged rather than treated as a failure.
    try {
      await cloverPost(cfg, `item_stocks/${item.id}`, { quantity: 1 });
    } catch (err) {
      console.warn(`[clover sync] item ${item.id} created but stock not set: ${err.message}`);
    }

    await prisma.productUnit.update({
      where: { id: unit.id },
      data: { cloverItemId: item.id },
    });

    return { ok: true, itemId: item.id, error: null };
  } catch (err) {
    console.error(`[clover sync] serial ${unit.serial} not synced: ${err.message}`);
    return { ok: false, itemId: null, error: err.message };
  }
}

/**
 * Move one Clover item's stock by `delta`, leaving the item itself alone.
 *
 * The current count is read rather than assumed, so a quantity someone adjusted
 * on the register is respected instead of being flattened back to what this app
 * last believed. Stock never goes below zero.
 */
async function adjustStock({ cfg, unit, delta, verb }) {
  if (!clover.isConnected(cfg)) return { ok: false, error: null };
  if (!unit.cloverItemId) return { ok: false, error: null }; // never reached Clover

  try {
    // A unit with an item but no stock record has had its count set nowhere
    // else, so the one this app put there is the sensible starting point.
    let current = delta > 0 ? 0 : 1;
    try {
      const stock = await cloverGet(cfg, `item_stocks/${unit.cloverItemId}`);
      if (typeof stock?.quantity === "number") current = stock.quantity;
    } catch {
      // No stock record yet, or unreadable — fall back to the assumption above.
    }

    await cloverPost(cfg, `item_stocks/${unit.cloverItemId}`, {
      quantity: Math.max(0, current + delta),
    });
    return { ok: true, error: null };
  } catch (err) {
    console.error(`[clover sync] serial ${unit.serial} stock not ${verb}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Take one off the Clover item's stock — used when a serial is sold here.
 *
 * The item stays: it was sold, not imagined, and Clover's own reporting still
 * refers to it.
 */
const releaseUnit = ({ cfg, unit }) => adjustStock({ cfg, unit, delta: -1, verb: "reduced" });

/**
 * Put one back on the Clover item's stock — used when a sold serial comes back.
 *
 * The exact inverse of releaseUnit. Without it a returned handset sits on the
 * shelf while the register still shows none, and it can't be sold again.
 */
const restockUnit = ({ cfg, unit }) => adjustStock({ cfg, unit, delta: 1, verb: "restored" });

/**
 * Delete the Clover item outright — used when a serial is removed here.
 *
 * Removing a serial means it should not have been on the books at all: a typo,
 * a handset booked in twice. Selling is the case where the item has earned its
 * place in Clover's history, and that goes through releaseUnit instead.
 */
async function deleteUnit({ cfg, unit }) {
  if (!clover.isConnected(cfg)) return { ok: false, error: null };
  if (!unit.cloverItemId) return { ok: false, error: null }; // never reached Clover

  try {
    const resp = await fetch(
      `${cfg.apiBase}/v3/merchants/${cfg.merchantId}/items/${unit.cloverItemId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
      }
    );
    // Already gone is the outcome we wanted, not a failure worth reporting.
    if (!resp.ok && resp.status !== 404) throw new Error(`Clover answered ${resp.status}.`);
    return { ok: true, error: null };
  } catch (err) {
    console.error(`[clover sync] item for serial ${unit.serial} not deleted: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** The caller's Clover credentials, resolved once per batch. */
async function configFor(prisma, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  return clover.configForStore(store);
}

/**
 * Run one Clover operation over a set of serials and summarise the result.
 *
 * Sequential on purpose — a box of twenty handsets shouldn't open twenty
 * simultaneous connections to Clover, and nobody is waiting on the ordering.
 *
 * `action` is only a label for the message the browser shows if part of the
 * batch fails; it does not change what is sent. Returns:
 *   { connected, action, count, failed: [{ serial, error }] }
 */
async function runBatch({ prisma, storeId, units, action, each }) {
  const cfg = await configFor(prisma, storeId);
  if (!clover.isConnected(cfg)) return { connected: false, action, count: 0, failed: [] };

  let count = 0;
  const failed = [];

  for (const unit of units) {
    const result = await each(cfg, unit);
    if (result.ok) count++;
    else if (result.error) failed.push({ serial: unit.serial, error: result.error });
  }

  return { connected: true, action, count, failed };
}

/** Create or update the Clover items for a set of serials. */
const syncUnits = ({ prisma, storeId, product, units, action = "added" }) =>
  runBatch({
    prisma,
    storeId,
    units,
    action,
    each: (cfg, unit) => syncUnit({ prisma, cfg, product, unit }),
  });

/** Reduce the Clover stock for serials sold here. */
const releaseUnits = ({ prisma, storeId, units }) =>
  runBatch({ prisma, storeId, units, action: "sold", each: (cfg, unit) => releaseUnit({ cfg, unit }) });

/** Put stock back for serials returned to the shelf here. */
const restockUnits = ({ prisma, storeId, units }) =>
  runBatch({ prisma, storeId, units, action: "returned", each: (cfg, unit) => restockUnit({ cfg, unit }) });

/** Delete the Clover items for serials removed here. */
const deleteUnits = ({ prisma, storeId, units }) =>
  runBatch({ prisma, storeId, units, action: "removed", each: (cfg, unit) => deleteUnit({ cfg, unit }) });

module.exports = {
  syncUnits,
  syncUnit,
  releaseUnits,
  releaseUnit,
  restockUnits,
  restockUnit,
  deleteUnits,
  deleteUnit,
  itemNameFor,
  itemPayloadFor,
  CONDITION_LABELS,
};
