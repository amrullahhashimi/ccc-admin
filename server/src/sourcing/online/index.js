/**
 * Looking a product up online.
 *
 * The shop's own vendors quote wholesale; this is the other half of the
 * question — what the thing sells for retail in Canada, and what the local
 * market is asking — so a buyer can see the margin before committing to a box
 * of them.
 *
 * Canadian national retail is searched first, the local market second, exactly
 * in that order of trust: a Best Buy listing is a price anyone can walk in and
 * pay, while a classified ad is one person's asking price.
 *
 * Results are cached against the product, because a price list is read many
 * times a day and none of these sites deserve to be asked more than once every
 * few hours for the same thing.
 */

const { PER_PROVIDER, links, live } = require("./providers");

/** How long a cached lookup stands before it is worth asking again. */
const TTL_MINUTES = 12 * 60;

/**
 * What to type into a search box for this product.
 *
 * Deliberately short: brand, model and the one attribute that changes the price
 * most. Adding grade or carrier ("Good", "Unlocked-VZN") only narrows a retail
 * search down to nothing.
 */
function queryFor(product) {
  const model = product.model ?? "";
  // "Sonim XP 9900" already says Sonim; searching "Sonim Sonim XP 9900" finds less.
  const brand =
    product.brand && !new RegExp(`^${escapeRegExp(product.brand)}\\b`, "i").test(model) ? product.brand : null;

  const query = [brand, model, product.storage].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return query || product.normalizedName || "";
}

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokens = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

/**
 * Cases, chargers and screen protectors, which match a phone's name perfectly
 * and cost fifteen dollars. Left in, they would take over "cheapest online" and
 * quietly tell a buyer an iPad sells for $13.
 */
const ACCESSORY =
  /\b(case|cover|screen\s*protector|protector|tempered|charger|charging|cable|adapter|glass|holder|stand|mount|skin|film|sleeve|keyboard|pencil|stylus|strap|band|dock|bumper)\b/i;

/**
 * Is this listing plausibly the same product?
 *
 * A keyword search returns whatever shares words with the query. Requiring
 * every distinctive word of the model to appear keeps "iPhone XR" from
 * matching an ad for an iPhone 6, without pretending to be a matcher — this
 * only decides what is worth showing, never what anything is.
 */
function isRelevant(title, product) {
  const wanted = tokens(product.model).filter((t) => t.length > 1 || /\d/.test(t));
  if (!wanted.length) return true;

  const found = new Set(tokens(title));
  /* Spacing is not agreed on: a vendor writes "Sonim XP 9900", Best Buy writes
     "XP9900". Words are matched on their own, and neighbouring words are also
     tried joined together, so the same phone is recognised either way. */
  const squashed = String(title).toLowerCase().replace(/[^a-z0-9]/g, "");

  const covered = new Set();
  wanted.forEach((token, i) => {
    if (found.has(token)) covered.add(i);
    // A run-together word ("xp9900") is distinctive enough to trust as a substring.
    else if (token.length >= 4 && /\d/.test(token) && squashed.includes(token)) covered.add(i);
  });

  for (let i = 0; i < wanted.length - 1; i++) {
    if (found.has(wanted[i] + wanted[i + 1])) {
      covered.add(i);
      covered.add(i + 1);
    }
  }

  if (!wanted.every((_, i) => covered.has(i))) return false;

  const sellsAccessories = product.productType === "Accessory";
  return sellsAccessories || !ACCESSORY.test(title);
}

/** Which of them ran, what came back, and what fell over. */
async function searchOnline(product) {
  const query = queryFor(product);
  if (!query) return { query, results: [], failures: [] };

  const attempts = await Promise.allSettled(
    live().map(async (provider) => {
      const found = await provider.search(query);
      return found
        .filter((result) => isRelevant(result.title, product))
        .slice(0, PER_PROVIDER)
        .map((result) => ({
          ...result,
          source: provider.id,
          sourceLabel: provider.label,
          tier: provider.tier,
        }));
    })
  );

  const results = [];
  const failures = [];

  attempts.forEach((attempt, index) => {
    const provider = live()[index];
    if (attempt.status === "fulfilled") {
      results.push(...attempt.value);
    } else {
      // One site being unreachable is ordinary; it must not take the rest down.
      failures.push({ source: provider.id, label: provider.label, reason: String(attempt.reason?.message ?? attempt.reason) });
    }
  });

  // National retail first, then the local market; cheapest first within each.
  const rank = { retail: 0, local: 1 };
  results.sort((a, b) => (rank[a.tier] - rank[b.tier]) || a.priceCents - b.priceCents);

  return { query, results, failures };
}

/** The one-click searches for sites that refuse to be read automatically. */
const searchLinks = (product) => {
  const query = queryFor(product);
  return links().map((provider) => ({
    source: provider.id,
    label: provider.label,
    tier: provider.tier,
    url: provider.searchUrl(query),
  }));
};

module.exports = { TTL_MINUTES, isRelevant, queryFor, searchLinks, searchOnline };
