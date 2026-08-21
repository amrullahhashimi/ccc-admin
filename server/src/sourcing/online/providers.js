/**
 * Where an online price can be looked up, and how.
 *
 * Two kinds of source live here:
 *
 *   live  — the site hands back structured data (a JSON API, or JSON embedded
 *           in the page), so a name, a price and a link can be read out of it
 *           without guessing at markup.
 *
 *   link  — the site blocks automated requests or renders prices in JavaScript.
 *           Rather than pretend, these produce a ready-made search URL: one
 *           click, the right query, no invented numbers.
 *
 * Nothing here costs anything per lookup, which is the standing rule for the
 * shop's tools. If a paid search API is ever wanted it slots in as another
 * provider — but off by default, never billing quietly in the background.
 *
 * Everything a provider returns is treated as untrusted: prices must be sane
 * numbers, and links must belong to that provider's own domain. A page that
 * changes shape produces no results rather than wrong ones.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const TIMEOUT_MS = 12000;
const PER_PROVIDER = 5;
const MAX_PRICE_CENTS = 2000000; // $20,000 — anything above is a parsing mistake

/** One fetch, with a timeout and a browser-shaped set of headers. */
async function get(url, { json = false } = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-CA,en;q=0.9",
      Accept: json ? "application/json" : "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return json ? res.json() : res.text();
}

/** The handful of entities that turn up in retail titles. */
const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", "#39": "'", "#x27": "'" };

const decode = (text) =>
  String(text ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (/^#\d+$/.test(key)) return String.fromCharCode(Number(key.slice(1)));
    if (/^#x[0-9a-f]+$/.test(key)) return String.fromCharCode(parseInt(key.slice(2), 16));
    return whole;
  });

/** Keeps a result only if it is plausible and points where it claims to. */
function accept(result, domain) {
  const title = String(result.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) return null;

  let url;
  try {
    url = new URL(result.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) return null;

  const priceCents = Number(result.priceCents);
  if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > MAX_PRICE_CENTS) return null;

  return {
    title: title.slice(0, 200),
    url: url.toString(),
    priceCents,
    currency: "CAD",
    location: result.location ? String(result.location).slice(0, 80) : null,
    inStock: typeof result.inStock === "boolean" ? result.inStock : null,
  };
}

/* --------------------------- national retail --------------------------- */

/**
 * Best Buy Canada.
 *
 * Their storefront reads its own search results from this endpoint, so the data
 * is the same JSON the site itself renders: name, price, availability and the
 * product path. No key, no scraping of markup.
 */
const bestBuy = {
  id: "BESTBUY_CA",
  label: "Best Buy Canada",
  tier: "retail",
  kind: "live",
  domain: "bestbuy.ca",
  searchUrl: (q) => `https://www.bestbuy.ca/en-ca/search?search=${encodeURIComponent(q)}`,

  async search(query) {
    const url =
      "https://www.bestbuy.ca/api/v2/json/search" +
      `?query=${encodeURIComponent(query)}&page=1&pageSize=${PER_PROVIDER * 2}&lang=en-CA`;
    const data = await get(url, { json: true });

    return (data?.products ?? [])
      .map((p) =>
        accept(
          {
            title: p.name,
            url: p.productUrl?.startsWith("http") ? p.productUrl : `https://www.bestbuy.ca${p.productUrl ?? ""}`,
            priceCents: Math.round(Number(p.salePrice ?? p.regularPrice) * 100),
            inStock: p.isMarketplace ? null : !!(p.availabilityOnline?.purchasable ?? p.isAvailableOnline),
          },
          "bestbuy.ca"
        )
      )
      .filter(Boolean);
  },
};

/**
 * Amazon.ca.
 *
 * There is no free product API — the affiliate one needs an approved account —
 * so this reads the search page the same way a browser would. It is the only
 * provider here parsed out of markup rather than structured data, so it is
 * written to fail closed: a result is kept only when its id, its name and its
 * price all come out cleanly, and a bot check throws rather than quietly
 * returning nothing, so the screen can say Amazon could not be reached.
 *
 * Links are built from the ASIN rather than lifted out of the page, which skips
 * the tracking parameters and can't be pointed anywhere but Amazon.
 *
 * /s and /dp are both permitted by their robots.txt, and a lookup happens at
 * most once every twelve hours per product.
 */
const amazon = {
  id: "AMAZON_CA",
  label: "Amazon.ca",
  tier: "retail",
  kind: "live",
  domain: "amazon.ca",
  searchUrl: (q) => `https://www.amazon.ca/s?k=${encodeURIComponent(q)}`,

  async search(query) {
    const html = await get(amazon.searchUrl(query));

    // Amazon shows this instead of results when it doesn't like the request.
    if (/Enter the characters you see|api-services-support@amazon/i.test(html)) {
      throw new Error("asked to verify a human");
    }

    const marks = [...html.matchAll(/data-component-type="s-search-result"/g)].map((m) => m.index);

    /* Amazon occasionally answers a perfectly ordinary request with a page that
       carries no results markup at all — a quiet throttle. That is not the same
       as "nothing matched", and saying so lets the screen report Amazon as
       unreachable instead of implying they don't stock it. */
    if (!marks.length) {
      if (/No results for|did not match any products/i.test(html)) return [];
      throw new Error("no results markup — likely throttled");
    }

    const results = [];

    marks.forEach((start, i) => {
      const block = html.slice(start, marks[i + 1] ?? start + 60000);

      // The id sits in the enclosing tag, just before the marker.
      const asin = [...html.slice(Math.max(0, start - 600), start).matchAll(/data-asin="([A-Z0-9]{10})"/g)].pop()?.[1];
      const title = decode((/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? "").replace(/<[^>]+>/g, "")).trim();
      const price = /<span class="a-offscreen">\s*\$?([\d,]+\.\d{2})\s*<\/span>/.exec(block)?.[1];

      if (!asin || !title || !price) return; // half a result is no result

      const accepted = accept(
        {
          title,
          url: `https://www.amazon.ca/dp/${asin}`,
          priceCents: Math.round(Number(price.replace(/,/g, "")) * 100),
        },
        "amazon.ca"
      );
      if (accepted) results.push(accepted);
    });

    return results;
  },
};

/* ---------------------------- the local market ---------------------------- */

/**
 * Kijiji — the second tier, and the one that answers "what are shops near me
 * actually charging". Its listings carry a town, so each row can say where it
 * is rather than pretending a national average exists.
 *
 * The page ships its data as a Next.js payload, which is stable enough to read
 * directly; if the shape ever changes, the parse yields nothing and the section
 * simply shows no local results.
 */
const kijiji = {
  id: "KIJIJI",
  label: "Kijiji",
  tier: "local",
  kind: "live",
  domain: "kijiji.ca",
  searchUrl: (q) => `https://www.kijiji.ca/b-canada/${encodeURIComponent(q.replace(/\s+/g, "-").toLowerCase())}/k0l0`,

  async search(query) {
    const html = await get(kijiji.searchUrl(query));
    const blob = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (!blob) return [];

    const state = JSON.parse(blob[1])?.props?.pageProps?.__APOLLO_STATE__;
    if (!state || typeof state !== "object") return [];

    return Object.entries(state)
      .filter(([key]) => key.startsWith("StandardListing:"))
      .slice(0, PER_PROVIDER * 3)
      .map(([, listing]) =>
        accept(
          {
            title: listing?.title,
            url: listing?.url,
            // Kijiji already counts in cents.
            priceCents: listing?.price?.amount,
            location: listing?.location?.name,
          },
          "kijiji.ca"
        )
      )
      .filter(Boolean);
  },
};

/* ------------------------ the ones that say no ------------------------ */
/*
 * These answer automated requests with a challenge page, or build their prices
 * in the browser. A search link is the honest offering: it costs one click and
 * never shows a number nobody checked.
 */

const linkOnly = [
  {
    // Walmart answers every automated request with a "Verify Your Identity"
    // challenge. Getting round that is not something this will do, so the
    // search opens in a tab like the rest of them.
    id: "WALMART_CA",
    label: "Walmart Canada",
    tier: "retail",
    kind: "link",
    domain: "walmart.ca",
    searchUrl: (q) => `https://www.walmart.ca/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "EBAY_CA",
    label: "eBay Canada",
    tier: "retail",
    kind: "link",
    domain: "ebay.ca",
    searchUrl: (q) => `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_PrefLoc=1`,
  },
  {
    id: "STAPLES_CA",
    label: "Staples Canada",
    tier: "retail",
    kind: "link",
    domain: "staples.ca",
    searchUrl: (q) => `https://www.staples.ca/search?query=${encodeURIComponent(q)}`,
  },
  {
    id: "CANADA_COMPUTERS",
    label: "Canada Computers",
    tier: "retail",
    kind: "link",
    domain: "canadacomputers.com",
    searchUrl: (q) => `https://www.canadacomputers.com/en/search?s=${encodeURIComponent(q)}`,
  },
  {
    id: "FB_MARKETPLACE",
    label: "Facebook Marketplace",
    tier: "local",
    kind: "link",
    domain: "facebook.com",
    searchUrl: (q) => `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}`,
  },
];

const PROVIDERS = [bestBuy, amazon, kijiji, ...linkOnly];

const live = () => PROVIDERS.filter((p) => p.kind === "live");
const links = () => PROVIDERS.filter((p) => p.kind === "link");
const byId = (id) => PROVIDERS.find((p) => p.id === id) ?? null;

module.exports = { PROVIDERS, PER_PROVIDER, accept, byId, decode, links, live };
