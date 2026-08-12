/**
 * Store scoping.
 *
 * Every signed-in user belongs to exactly one store, and every query below the
 * API layer must be filtered by it. A store sees its own data and nothing else —
 * the only exception is the read-only sharing described in routes/stores.js,
 * which never writes and never touches sales, customers or service tickets.
 *
 * The rule of thumb for a route:
 *   - reading a list      → spread `scope(req)` into the `where`
 *   - reading one row     → find it, then `assertStore(req, row)` before replying
 *   - creating            → spread `stamp(req)` into the `data`
 *   - updating / deleting → load it first, `assertStore`, then write
 *
 * Prefer findFirst({ where: { id, ...scope(req) } }) over findUnique for
 * anything reachable by id: it makes the scope part of the query rather than an
 * afterthought a later edit could forget.
 */

const storeId = (req) => req.session?.user?.storeId || null;

/** Filter fragment for the caller's store. */
const scope = (req) => ({ storeId: storeId(req) });

/** Creator fragment, so new rows land in the caller's store. */
const stamp = (req) => ({ storeId: storeId(req) });

/** True when the row belongs to the caller's store. */
const owns = (req, row) => !!row && row.storeId === storeId(req);

/**
 * Guard for a row already loaded. Answers the request and returns false when
 * the row belongs to another store — reported as "not found" rather than
 * "forbidden", so one store can't probe another's ids.
 */
function assertStore(req, res, row, what = "record") {
  if (!row) {
    res.status(404).json({ error: `That ${what} was not found.` });
    return false;
  }
  if (!owns(req, row)) {
    res.status(404).json({ error: `That ${what} was not found.` });
    return false;
  }
  return true;
}

/** Only the platform owner may add or remove stores. */
function requireSuperAdmin(req, res, next) {
  if (!req.session?.user?.superAdmin) {
    return res.status(403).json({ error: "Only a system administrator can manage stores." });
  }
  next();
}

/**
 * Next number in a per-store sequence (ticket, sale, layaway, invoice).
 * Numbering restarts at 1 for each new store.
 */
async function nextNumber(prisma, model, req) {
  const last = await prisma[model].findFirst({
    where: scope(req),
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number || 0) + 1;
}

module.exports = { storeId, scope, stamp, owns, assertStore, requireSuperAdmin, nextNumber };
