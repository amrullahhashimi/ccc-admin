/**
 * Working out who is actually cheapest.
 *
 * The subtlety is quantity. A vendor's $119.99 may only exist if you take ten,
 * and comparing it against another vendor's single-unit price is how a buyer
 * talks themselves into an order they didn't want. Every comparison here is
 * therefore made *at a quantity*: each vendor is asked what they'd charge for
 * that many, and vendors with no tier covering it simply don't appear.
 *
 * Colours follow one rule the UI never re-decides:
 *   one vendor lowest        → green
 *   several vendors tied low → yellow for all of them, never green
 *   anything above           → red
 */

/**
 * The tier a vendor would actually bill at for `quantity`.
 *
 * Where tiers overlap, the cheaper one wins: a buyer taking 10 gets the 10+
 * price even if the 1+ tier also technically covers it.
 */
function tierForQuantity(offers, quantity) {
  const applicable = (offers || []).filter((o) => {
    if (o.active === false) return false;
    if (o.priceCents == null) return false;
    const min = o.minQuantity ?? 1;
    const max = o.maxQuantity ?? Infinity;
    return quantity >= min && quantity <= max;
  });
  if (!applicable.length) return null;

  return applicable.reduce((best, o) => (o.priceCents < best.priceCents ? o : best));
}

/**
 * One product across every vendor, at one quantity.
 *
 * `savingsCents` is against the *next* cheapest vendor — the question a buyer
 * is really asking is "how much does choosing this one save me", and against
 * the most expensive vendor that number flatters itself.
 */
function compareProduct(product, offersByVendor, quantity = 1) {
  const rows = [];

  for (const [vendorId, entry] of Object.entries(offersByVendor || {})) {
    const offers = Array.isArray(entry) ? entry : entry.offers;
    const vendorName = Array.isArray(entry) ? null : entry.vendorName ?? null;
    const tier = tierForQuantity(offers, quantity);
    if (!tier) continue;

    rows.push({
      vendorId,
      vendorName,
      offerId: tier.id ?? null,
      priceCents: tier.priceCents,
      currency: tier.currency ?? "CAD",
      minQuantity: tier.minQuantity ?? 1,
      maxQuantity: tier.maxQuantity ?? null,
      condition: tier.condition ?? null,
      grade: tier.grade ?? null,
      /** What the vendor said they hold, when their list says. */
      availableQuantity: tier.availableQuantity ?? null,
      lastSeenAt: tier.lastSeenAt ?? null,
      sourceMessageId: tier.sourceMessageId ?? null,
      /** True when this price only exists because of a quantity rebate. */
      quantityBreak: (tier.minQuantity ?? 1) > 1,
      tone: "higher",
    });
  }

  if (!rows.length) {
    return { productId: product?.id ?? null, quantity, vendors: [], cheapestCents: null, savingsCents: null, tied: false };
  }

  rows.sort((a, b) => a.priceCents - b.priceCents);

  const cheapestCents = rows[0].priceCents;
  const cheapest = rows.filter((r) => r.priceCents === cheapestCents);
  const tied = cheapest.length > 1;

  /* Green means "cheapest of several". With a single quote there is nothing to
     be cheaper than, and colouring it green would paint a whole one-vendor
     table in a green that means nothing. */
  const alone = rows.length === 1;

  for (const row of rows) {
    row.tone = alone ? "only" : row.priceCents === cheapestCents ? (tied ? "tied" : "cheapest") : "higher";
  }

  const next = rows.find((r) => r.priceCents > cheapestCents) ?? null;

  return {
    productId: product?.id ?? null,
    quantity,
    vendors: rows,
    cheapestCents,
    /** Null when everyone is level — there is nothing to save by choosing. */
    savingsCents: next ? next.priceCents - cheapestCents : null,
    tied,
    vendorCount: rows.length,
  };
}

/** Shapes the rows a Prisma query returns into what compareProduct wants. */
function groupOffersByVendor(offers) {
  const byVendor = {};
  for (const offer of offers || []) {
    const id = offer.vendorId;
    if (!byVendor[id]) byVendor[id] = { vendorName: offer.vendor?.name ?? null, offers: [] };
    byVendor[id].offers.push(offer);
  }
  return byVendor;
}

module.exports = { compareProduct, groupOffersByVendor, tierForQuantity };
