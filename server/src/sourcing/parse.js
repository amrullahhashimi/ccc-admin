/**
 * Turns a vendor's message into structured offers.
 *
 * Vendors type these by hand into a chat window, so the input is genuinely
 * messy: no fixed column order, missing dollar signs, "Ipad" and "iPad" and
 * "IPAD" in the same list, quantity rebates announced in a heading two lines
 * above the prices they apply to.
 *
 * Two rules shape everything here:
 *
 *   Never invent. If a line doesn't say what condition the stock is in, the
 *   condition is null. A parser that fills blanks with plausible defaults
 *   produces a catalogue nobody can trust.
 *
 *   Never guess a number into a price. "iPad 8" ends in a number that is part
 *   of the model, and reading it as an $8 iPad would be worse than reading no
 *   price at all. A bare number only becomes a price when the line gives a
 *   reason to think so — see priceFrom().
 *
 * The output is a proposal. Nothing here writes to the database; the import
 * route re-validates every field after the user has reviewed it.
 */

const {
  BRANDS,
  brandFromModel,
  normalizeAttributes,
  normalizeGrade,
  normalizeSize,
  repairTypo,
  sizeToMb,
  typeFromModel,
} = require("./normalize");

/* ----------------------------- vocabularies ----------------------------- */

const CONNECTIVITY_RULES = [
  [/\bwi[\s.-]?fi\s*(?:\+|\/|&|and)\s*cell(?:ular)?\b/i, "WiFi + Cellular"],
  [/\bcell(?:ular)?\s*(?:\+|\/|&|and)\s*wi[\s.-]?fi\b/i, "WiFi + Cellular"],
  [/\b(?:wi[\s.-]?fi|wf)\s+cell(?:ular)?\b/i, "WiFi + Cellular"],
  [/\bwi[\s.-]?fi\s*\+\s*lte\b/i, "WiFi + Cellular"],
  // A watch states GPS or GPS + Cellular; that is the variant being sold, and
  // it outranks whatever the vendor typed in a Carrier column.
  [/\bgps\s*(?:\+|\/|&|and)\s*cell(?:ular)?\b/i, "GPS + Cellular"],
  [/\bgps\b/i, "GPS"],
  [/\bcell(?:ular)?\b|\blte\b/i, "Cellular"],
  [/\bwi[\s.-]?fi\b|\bwifi\s*only\b/i, "WiFi"],
  [/\b5g\b/i, "5G"],
];

/**
 * The state stock is in.
 *
 * Two vocabularies live here because vendors use both under the same heading:
 * how it was sold (New, Open box, Refurbished) and how it looks (Mint, Good,
 * Fair). Neither is translated into the other, and both keep two rows apart —
 * condition is part of a product's signature.
 */
const CONDITION_RULES = [
  [/\b(?:brand\s*new|bnib|new\s*sealed|sealed)\b/i, "New"],
  [/\bopen\s*box\b|\bopenbox\b/i, "Open box"],
  [/\brefurb(?:ished)?\b|\brenewed\b|\bcpo\b/i, "Refurbished"],
  [/\bfor\s*parts\b|\bparts\s*only\b/i, "For parts"],
  [/\bused\b|\bpre[\s-]?owned\b|\bsecond\s*hand\b/i, "Used"],
  [/\b(mint|pristine|excellent|very\s+good|good|fair|poor|damaged)\b/i, (m) =>
    m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()],
  [/\bnew\b/i, "New"],
];

const CARRIER_RULES = [
  [/\b(?:factory\s*)?unlocked\b/i, "Unlocked"],
  [/\brogers\b/i, "Rogers"],
  [/\bbell\b/i, "Bell"],
  [/\btelus\b/i, "Telus"],
  [/\bfido\b/i, "Fido"],
  [/\bkoodo\b/i, "Koodo"],
  [/\bfreedom\b/i, "Freedom"],
  [/\bcarrier\s*locked\b|\blocked\b/i, "Locked"],
];

const CPU_RULES = [
  [/\b(i[3579])[\s-]?(\d{1,2})(?:th|st|nd|rd)?\s*gen(?:eration)?\b/i, (m) => `${m[1].toLowerCase()}-${m[2]}th Gen`],
  [/\b(i[3579])[\s-]?(\d{4,5}[a-z]?)\b/i, (m) => `${m[1].toLowerCase()}-${m[2].toUpperCase()}`],
  [/\bryzen\s*([3579])\b/i, (m) => `Ryzen ${m[1]}`],
  [/\bsnapdragon\s*(\d{3}[a-z]*)\b/i, (m) => `Snapdragon ${m[1]}`],
  [/\b(m[1234])\s*(pro|max|ultra)\b/i, (m) => `${m[1].toUpperCase()} ${m[2][0].toUpperCase()}${m[2].slice(1)}`],
];

const COLORS = [
  "space grey", "space gray", "midnight", "starlight", "graphite", "sierra blue",
  "rose gold", "gold", "silver", "black", "white", "blue", "green", "red",
  "purple", "pink", "yellow", "grey", "gray", "titanium",
];

/** Words that carry no product meaning and are stripped before naming. */
const NOISE_WORDS = /\b(?:each|ea|per\s*unit|pcs?|pieces?|units?|available|avail|in\s*stock|price[sd]?|only|left|approx|approximately|new\s*arrival|hot)\b/gi;

/** Lines that are talking about the list rather than listing a product. */
const HEADING_ONLY = [
  /^[-=*_~\s]+$/,
  /^(?:hi|hello|hey|good\s*(?:morning|afternoon|evening))\b/i,
  /^(?:thanks|thank\s*you|regards|cheers)\b/i,
  /^(?:price\s*list|list|stock\s*list|availability|today'?s?\s*(?:list|prices?))\s*:?\s*$/i,
  /^(?:quantity|qty)\s*rebates?\s*:?\s*$/i,
  /^(?:call|text|whatsapp|dm)\b/i,
];

/* ------------------------------- helpers ------------------------------- */

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** Dollars as written by a human → integer cents. */
function centsFrom(text) {
  const n = Number(String(text).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Quantity wording, wherever it appears.
 *
 * Returns { minQuantity, maxQuantity, matched } — `matched` is the text to cut
 * out of the line so it can't be mistaken for part of the product name.
 */
function quantityFrom(text) {
  let m;

  if ((m = /\b(?:if\s*you\s*)?(?:take|buy|order|for)\s*(\d+)\s*(?:\+|or\s*more|and\s*(?:up|over))\b/i.exec(text))) {
    return { minQuantity: Number(m[1]), maxQuantity: null, matched: m[0] };
  }
  if ((m = /\bmin(?:imum)?\.?\s*(?:qty|quantity|order)?\s*[:=]?\s*(\d+)\b/i.exec(text))) {
    return { minQuantity: Number(m[1]), maxQuantity: null, matched: m[0] };
  }
  if ((m = /\b(\d+)\s*(?:\+|or\s*more|and\s*(?:up|over))\b/i.exec(text))) {
    return { minQuantity: Number(m[1]), maxQuantity: null, matched: m[0] };
  }
  if ((m = /\b(\d+)\s*(?:-|–|to)\s*(\d+)\b(?!\s*(?:gb|tb|mb|inch|"))/i.exec(text))) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (hi >= lo && hi <= 100000) return { minQuantity: lo, maxQuantity: hi, matched: m[0] };
  }
  return null;
}

/**
 * The price on a line, if there is one.
 *
 * A number is a *stated* price when it wears a currency mark or has cents.
 * Anything else is only a price when nothing else explains it: it must sit at
 * the end of the line, be at least 10, and not follow a word that makes it part
 * of the model ("iPad 8", "Pixel 9"). That last rule is what keeps a model
 * number from being read as eight dollars.
 */
function priceFrom(text) {
  const candidates = [];
  const re = /(\$|CAD|USD|C\$|US\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(\$|CAD|USD)?/gi;

  let m;
  while ((m = re.exec(text)) !== null) {
    const [full, pre, whole, cents, post] = m;
    const start = m.index + full.indexOf(whole);
    const end = start + whole.length + (cents ? cents.length + 1 : 0);

    const before = text.slice(0, start);
    const after = text.slice(end);

    // Part of a bigger token: "16e", "128gb", "i5", "11th".
    if (/[A-Za-z]/.test(after.charAt(0) || "")) continue;
    if (/[A-Za-z]$/.test(before)) continue;

    const marked = !!(pre || post);
    const hasCents = !!cents;
    const value = Number(`${whole.replace(/,/g, "")}.${cents || 0}`);
    if (!Number.isFinite(value) || value <= 0) continue;

    const currency = /us/i.test(pre || post || "") ? "USD" : /cad|c\$/i.test(pre || post || "") ? "CAD" : null;
    const trailing = clean(after.replace(NOISE_WORDS, "").replace(/[.,;:!)\]]+/g, ""));
    const priorWord = (clean(before).split(/\s+/).pop() || "").toLowerCase();

    candidates.push({
      value,
      cents: Math.round(value * 100),
      currency,
      strong: marked || hasCents,
      atEnd: trailing === "",
      priorWord,
      text: full.trim(),
      start,
      end,
      // The whole run including any "$" or "CAD", so cutting the price out of
      // the line doesn't leave the currency mark behind to be read as a model.
      cutStart: m.index,
      cutEnd: m.index + full.length,
    });
  }

  const strong = candidates.filter((c) => c.strong);
  if (strong.length) return strong[strong.length - 1];

  // No currency mark anywhere on the line — fall back, carefully.
  const modelWord = /^(ipad|iphone|ipod|macbook|imac|watch|pixel|galaxy|note|tab|oneplus|nord|surface|moto|xperia|thinkpad|redmi|air|mini|pro|max|plus|gen|generation|series|version|v)$/i;
  const weak = candidates.filter(
    (c) => c.atEnd && c.value >= 10 && !modelWord.test(c.priorWord)
  );
  return weak.length ? weak[weak.length - 1] : null;
}

/** Pulls the first match of any rule out of the line, returning [value, rest]. */
function takeRule(text, rules) {
  for (const [re, value] of rules) {
    const m = re.exec(text);
    if (m) {
      const resolved = typeof value === "function" ? value(m) : value;
      return [resolved, text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)];
    }
  }
  return [null, text];
}

/** Every "128GB"-shaped token, cut out of the line. */
function takeSizes(text) {
  const sizes = [];
  let rest = text;
  const re = /\b(\d+(?:\.\d+)?)\s*(gb|tb|mb)\b/gi;
  let m;
  const cuts = [];
  while ((m = re.exec(text)) !== null) {
    const labelled = /\bram\b/i.test(text.slice(Math.max(0, m.index - 6), m.index)) ||
      /^\s*ram\b/i.test(text.slice(m.index + m[0].length));
    sizes.push({ value: normalizeSize(`${m[1]}${m[2]}`), mb: sizeToMb(`${m[1]}${m[2]}`), labelledRam: labelled });
    cuts.push([m.index, m.index + m[0].length]);
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    rest = rest.slice(0, cuts[i][0]) + " " + rest.slice(cuts[i][1]);
  }
  return [sizes, rest.replace(/\bram\b/gi, " ")];
}

/**
 * Grade, when the line says so.
 *
 * "Grade A" is unambiguous. A bare "A" is only read as a grade when it stands
 * alone at the end of the description, because a lone letter is otherwise as
 * likely to be part of a model name.
 */
/**
 * Grade, when the line says "grade".
 *
 * The word is what makes it a grade: "Grade A" and "Grade Good" land here,
 * while a bare "Good" is read as the condition — that is how vendors label it
 * on their own lists, and guessing the other way puts the value in a column the
 * sender never used.
 */
function takeGrade(text) {
  const cut = (m, value) => [value, text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)];

  let m = /\bgr(?:a)?d(?:e)?\s*[-:.]?\s*([a-d][+-]?)\b/i.exec(text);
  if (m) return cut(m, m[1].toUpperCase());

  m = /\bgr(?:a)?d(?:e)?\s*[-:.]?\s*(mint|pristine|excellent|very\s+good|good|fair|poor|damaged)\b/i.exec(text);
  if (m) return cut(m, normalizeGrade(m[1]));

  // A lone A–D at the end of the description, as in "iPad 8 32GB A $145".
  m = /\s([a-d])\s*$/i.exec(text.replace(/[.,;:]+\s*$/, ""));
  if (m && clean(text).split(/\s+/).length > 1) return cut(m, m[1].toUpperCase());

  return [null, text];
}

function takeColor(text) {
  for (const color of COLORS) {
    const re = new RegExp(`\\b${color.replace(/\s/g, "\\s*")}\\b`, "i");
    const m = re.exec(text);
    if (m) return [color.replace(/\bgray\b/, "grey"), text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)];
  }
  return [null, text];
}

function takeScreen(text) {
  const m = /\b(\d{1,2}(?:\.\d)?)\s*(?:inch|in\b|")/i.exec(text);
  if (m) return [`${m[1]}"`, text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)];
  return [null, text];
}

/**
 * What's left after everything else has been cut out: the product's name.
 *
 * "iPad 8th Generation" and "iPad 8" have to come out the same, so ordinals and
 * the word "generation" are folded away here rather than kept as noise.
 */
function cleanModel(text) {
  let out = String(text || "")
    .replace(NOISE_WORDS, " ")
    .replace(/[|/\\]+/g, " ")
    .replace(/[.,;:]+/g, " ")
    // "iPhone 14 - eSim Only" — the dash is punctuation, not part of the name.
    .replace(/\s+[-–]\s+/g, " ")
    .replace(/\s*[-–]\s*$/g, " ")
    .replace(/^\s*[-–]\s*/g, " ")
    .replace(/\(\s*\)/g, " ");

  // "8th generation" / "gen 8" / "8th gen" → "8"
  out = out.replace(/\b(\d+)\s*(?:st|nd|rd|th)\b\s*(?:gen(?:eration)?)?/gi, "$1");
  out = out.replace(/\bgen(?:eration)?\s*(\d+)\b/gi, "$1");
  out = out.replace(/\bgen(?:eration)?\b/gi, " ");

  return clean(out)
    .split(/\s+/)
    .map((w) => repairTypo(w))
    .join(" ");
}

/**
 * Manufacturers whose name is written *in front of* a model that stands on its
 * own: "Apple iPad 8" is the same product as "iPad 8".
 *
 * OnePlus, Moto and the like are missing on purpose — there is no "Open" without
 * the "OnePlus", so their name stays part of the model and only the display name
 * avoids saying it twice.
 */
const BRAND_PREFIXES = ["apple", "samsung", "google", "microsoft", "sony", "lenovo", "dell", "asus", "acer"];

/** Pulls a leading manufacturer off the model, when it can be spared. */
function splitBrand(model) {
  const words = clean(model).split(/\s+/).filter(Boolean);
  if (words.length < 2) return [null, model];

  const first = words[0].toLowerCase();
  if (!BRAND_PREFIXES.includes(first)) return [null, model];

  const hit = BRANDS.find((b) => b.aliases.includes(first) || b.name.toLowerCase() === first);
  return hit ? [hit.name, words.slice(1).join(" ")] : [null, model];
}

/* ------------------------------ line parsing ------------------------------ */

/** A vendor writing "Phone 16e" means an iPhone — but say so out loud. */
const IPHONE_SHAPE = /^(?:\d{1,2}\s*(?:e|s)?(?:\s+(?:pro|plus|max|mini))*|xr|xs(?:\s*max)?|se(?:\s*\d)?)$/i;

/**
 * One line → one proposed offer, or null when the line isn't one.
 *
 * `context` carries a quantity rebate announced on an earlier line.
 */
function parseLine(rawLine, context = {}, options = {}) {
  const warnings = [];
  const original = clean(rawLine);
  if (!original) return null;
  if (HEADING_ONLY.some((re) => re.test(original))) return null;

  let rest = ` ${original} `;

  /* Price first: it's the most reliable landmark, and cutting it out stops its
     digits confusing storage and quantity. Skipped when the caller already has
     the price from its own column — a screen size of 9.7" would otherwise read
     as $9.70. */
  const price = options.skipPrice ? null : priceFrom(rest);
  if (price) rest = rest.slice(0, price.cutStart) + " " + rest.slice(price.cutEnd);

  // Quantity, either from this line or announced above it.
  const own = options.skipQuantity ? null : quantityFrom(rest);
  if (own) rest = rest.replace(own.matched, " ");
  const minQuantity = own?.minQuantity ?? context.minQuantity ?? 1;
  const maxQuantity = own?.maxQuantity ?? context.maxQuantity ?? null;

  let grade;
  let condition;
  let connectivity;
  let carrier;
  let cpu;
  let color;
  let screenSize;
  let sizes;

  [cpu, rest] = takeRule(rest, CPU_RULES);
  [screenSize, rest] = takeScreen(rest);
  [connectivity, rest] = takeRule(rest, CONNECTIVITY_RULES);
  // Grade before condition: "Grade Good" is a grade, a bare "Good" is a
  // condition, and the condition rules would otherwise swallow the word first.
  [grade, rest] = takeGrade(rest);
  [condition, rest] = takeRule(rest, CONDITION_RULES);
  [carrier, rest] = takeRule(rest, CARRIER_RULES);
  [sizes, rest] = takeSizes(rest);
  [color, rest] = takeColor(rest);

  let model = cleanModel(rest);

  // A line that is only a price, or only punctuation, isn't a product.
  if (!model && !sizes.length) return null;

  let brand = null;
  let assumedBrand = false;

  // "Phone 16e" — the vendor's shorthand for an iPhone.
  const phoneShorthand = /^phone\s+(.+)$/i.exec(model);
  if (phoneShorthand && IPHONE_SHAPE.test(clean(phoneShorthand[1]))) {
    model = `iPhone ${clean(phoneShorthand[1])}`;
    brand = "Apple";
    assumedBrand = true;
    warnings.push('Read "Phone" as iPhone — check this is right.');
  }

  if (!brand) {
    const [prefix, remainder] = splitBrand(model);
    if (prefix) {
      brand = prefix;
      model = remainder;
    }
  }

  if (!brand) brand = brandFromModel(model);

  /* Storage vs RAM. Two sizes on a computer means RAM and disk; on a phone it
     usually means the vendor listed two variants, so only the larger is taken
     as storage and the rest is kept as a note rather than invented into RAM. */
  let storage = null;
  let ram = null;
  const specifications = {};

  if (sizes.length === 1) {
    storage = sizes[0].labelledRam ? null : sizes[0].value;
    if (sizes[0].labelledRam) ram = sizes[0].value;
  } else if (sizes.length > 1) {
    const labelled = sizes.find((s) => s.labelledRam);
    const sorted = [...sizes].sort((a, b) => (a.mb ?? 0) - (b.mb ?? 0));
    const isComputer = !!cpu || ["Laptop", "Desktop"].includes(typeFromModel(model));

    if (labelled) {
      ram = labelled.value;
      const others = sizes.filter((s) => s !== labelled).sort((a, b) => (b.mb ?? 0) - (a.mb ?? 0));
      storage = others[0]?.value ?? null;
    } else if (isComputer) {
      ram = sorted[0].value;
      storage = sorted[sorted.length - 1].value;
    } else {
      storage = sorted[sorted.length - 1].value;
      specifications.otherSizes = sorted.slice(0, -1).map((s) => s.value);
      warnings.push(`More than one size on this line — took ${storage} as the storage.`);
    }
  }

  const attributes = normalizeAttributes({
    brand,
    model,
    productType: typeFromModel(model),
    storage,
    ram,
    connectivity,
    carrier,
    condition,
    grade,
    color,
    cpu,
    screenSize,
    specifications,
  });

  /* Confidence in the *reading of the line* — not in any product match. */
  let confidence = 100;
  if (!attributes.brand) {
    confidence -= 30;
    warnings.push("Brand not recognised from this line.");
  }
  if (!attributes.model || attributes.model.length < 2) {
    confidence -= 30;
    warnings.push("Could not make out a model name.");
  }
  if (assumedBrand) confidence -= 15;
  if (!price && !options.skipPrice) {
    confidence -= 25;
    warnings.push("No price on this line — fill it in or drop the row.");
  }
  if (specifications.otherSizes) confidence -= 10;

  return {
    raw: original,
    ...attributes,
    priceCents: price ? price.cents : null,
    currency: price?.currency ?? null,
    minQuantity,
    maxQuantity,
    confidence: Math.max(0, Math.min(100, confidence)),
    warnings,
  };
}

/* ----------------------------- tabular lists ----------------------------- */
/*
 * Plenty of vendors don't type a message at all — they paste a spreadsheet:
 *
 *   Device                 Condition  Carrier            In Stock  Price
 *   Apple iPad 5 128GB     Good       Wi-Fi              4         $150.00
 *
 * Read as prose, "Good" and "4" end up inside the product name and the header
 * row becomes a product. Read as columns, every field lands where it belongs —
 * and the columns are *authoritative*: a value under "Carrier" is the carrier,
 * not a guess made from matching words.
 */

/**
 * What each column heading means. Order matters: first match wins.
 *
 * Condition and grade are separate roles on purpose. Whatever a vendor files
 * under their own "Condition" heading is the condition, even when the words
 * they use ("Good", "Fair") could equally be read as a cosmetic grade — the
 * label they chose is better evidence than our guess about their vocabulary.
 */
const HEADER_ROLES = [
  ["price", /\b(price|cost|wholesale|sell|amount|rate|\$)\b/i],
  ["stock", /\b(stock|qty|quantity|available|avail|count|units|on hand)\b/i],
  ["grade", /\b(grade|cosmetic)\b/i],
  ["condition", /\b(condition|cond)\b/i],
  ["carrier", /\b(carrier|network|lock|status|sim)\b/i],
  ["storage", /\b(storage|capacity|memory)\b/i],
  ["color", /\b(colou?r)\b/i],
  ["device", /\b(device|product|item|model|description|handset|phone|name)\b/i],
];

const SEPARATORS = [
  ["\t", /\t/],
  ["pipe", /\s*\|\s*/],
  ["spaces", / {2,}/],
  ["semicolon", /\s*;\s*/],
];

const splitOn = (line, sep) => line.split(sep).map((c) => c.trim());

/**
 * Is this message a table, and if so where are the columns?
 *
 * Wants at least two rows agreeing on a separator and a column count, so a
 * single line with a stray double-space isn't mistaken for a spreadsheet.
 */
function detectTable(lines) {
  const filled = lines.filter((l) => clean(l));
  if (!filled.length) return null;

  let best = null;
  for (const [name, sep] of SEPARATORS) {
    const counts = filled.map((l) => splitOn(l, sep).filter(Boolean).length);
    const common = counts
      .filter((c) => c >= 3)
      .sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    if (!common) continue;

    const agreeing = counts.filter((c) => c === common).length;
    /* Two rows have to agree before spacing is read as columns — except for a
       literal tab, which nobody types into a chat window. One tabbed line is a
       spreadsheet paste, and reading it as prose puts the stock count in the
       product's name. */
    const enough = name === "\t" ? 1 : 2;
    if (agreeing < enough || agreeing / filled.length < 0.6) continue;
    if (!best || agreeing > best.agreeing) best = { name, sep, columns: common, agreeing };
  }
  return best;
}

/** Reads the heading row, if there is one, into a column → role map. */
function readHeader(cells) {
  const roles = {};
  let matched = 0;

  cells.forEach((cell, index) => {
    if (!cell) return;
    // A heading never carries a price of its own.
    if (/\d+\.\d{2}\s*$/.test(cell)) return;
    for (const [role, test] of HEADER_ROLES) {
      if (test.test(cell) && roles[role] === undefined) {
        roles[role] = index;
        matched++;
        return;
      }
    }
  });

  // Two recognised headings is enough to trust the row; one could be a coincidence.
  return matched >= 2 ? roles : null;
}

/**
 * Works out the columns from the data itself, for a table pasted without its
 * heading row.
 */
function inferRoles(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  const roles = {};

  const columnValues = (i) => rows.map((r) => r[i] ?? "").filter(Boolean);
  const share = (i, test) => {
    const values = columnValues(i);
    return values.length ? values.filter((v) => test(v)).length / values.length : 0;
  };

  const isMoney = (v) => /^\$?\s*[\d,]+\.\d{2}\s*\$?$/.test(v) || /[$]/.test(v);
  const isCount = (v) => /^\d{1,5}$/.test(v);

  const numeric = [];

  for (let i = 0; i < width; i++) {
    // Money announces itself with a currency mark or with cents. A bare integer
    // does not: "15" is as likely to be a stock count as a price, so those are
    // collected and settled afterwards.
    if (roles.price === undefined && share(i, isMoney) > 0.8) {
      roles.price = i;
    } else if (share(i, isCount) > 0.8) {
      numeric.push(i);
    } else if (
      roles.condition === undefined &&
      share(i, (v) => /^(mint|pristine|excellent|very good|good|fair|poor|damaged|new|used|refurb\w*|open box|[a-d])$/i.test(v)) > 0.6
    ) {
      roles.condition = i;
    } else if (
      roles.carrier === undefined &&
      share(
        i,
        (v) =>
          /^(unlocked|locked|wi[\s-]?fi|cellular|gps|wi[\s-]?fi\s*[&+]\s*cellular|[a-z-]*(vzn|verizon|att|at&t|t-mobile|tracfone|rogers|bell|telus|fido|koodo|freedom)[a-z-]*)$/i.test(v)
      ) > 0.6
    ) {
      roles.carrier = i;
    } else if (roles.device === undefined && share(i, (v) => /[a-z]{3,}/i.test(v) && v.length > 5) > 0.7) {
      roles.device = i;
    }
  }

  /* Bare-integer columns. With no currency mark anywhere, the rightmost one is
     the price — every price list in this shape puts money last — and anything
     to its left is the stock count. */
  if (numeric.length) {
    if (roles.price === undefined) {
      roles.price = numeric[numeric.length - 1];
      if (numeric.length > 1) roles.stock = numeric[numeric.length - 2];
    } else {
      roles.stock = numeric[numeric.length - 1];
    }
  }

  return roles.device !== undefined && roles.price !== undefined ? roles : null;
}

/** "Wi-Fi & Cellular" in a Carrier column is connectivity, not a network. */
function splitCarrierCell(value) {
  for (const [re, connectivity] of CONNECTIVITY_RULES) {
    if (re.test(value)) {
      const leftover = clean(value.replace(re, " "));
      return { connectivity, carrier: leftover && !/^[&+/,-]+$/.test(leftover) ? leftover : null };
    }
  }
  return { connectivity: null, carrier: clean(value) || null };
}

/** Title case for a column value we keep as the vendor wrote it. */
const asWritten = (value) => {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

/**
 * A spreadsheet row → a proposed offer.
 *
 * The device cell still goes through the ordinary line parser (it is where the
 * storage, screen size and CPU hide), but with price and quantity extraction
 * turned off — 9.7" and (2016) are not money, and a stock count is not a
 * minimum order.
 */
function parseTableRow(cells, roles, context) {
  const cell = (role) => (roles[role] === undefined ? "" : (cells[roles[role]] ?? "").trim());

  const device = cell("device");
  if (!device) return null;

  const priceText = cell("price");
  const price = priceText ? priceFrom(` ${priceText} `) : null;

  const parsed = parseLine(device, context, { skipPrice: true, skipQuantity: true });
  if (!parsed) return null;

  const columnStorage = cell("storage");
  const columnColor = cell("color");
  const carrierCell = cell("carrier");

  const carrier = carrierCell ? splitCarrierCell(carrierCell) : { connectivity: null, carrier: null };
  // Each goes under the heading the vendor filed it under.
  const columnCondition = asWritten(cell("condition"));
  const columnGrade = cell("grade") ? normalizeGrade(cell("grade")) : null;

  const stockText = cell("stock");
  const stock = /^\d{1,6}$/.test(stockText) ? Number(stockText) : null;

  const attributes = normalizeAttributes({
    ...parsed,
    storage: parsed.storage ?? (columnStorage || null),
    color: parsed.color ?? (columnColor || null),
    // What the device cell states about itself wins: an Apple Watch that says
    // "GPS" is a GPS watch whatever the vendor put under Carrier.
    connectivity: parsed.connectivity ?? carrier.connectivity,
    carrier: parsed.carrier ?? carrier.carrier,
    condition: parsed.condition ?? columnCondition,
    grade: parsed.grade ?? columnGrade,
    specifications: parsed.specifications,
  });

  const warnings = [...parsed.warnings];
  let confidence = parsed.confidence;
  if (!price) {
    confidence -= 25;
    warnings.push("No price in the price column — fill it in or drop the row.");
  }

  return {
    raw: cells.filter(Boolean).join(" · "),
    ...attributes,
    priceCents: price ? price.cents : null,
    currency: price?.currency ?? null,
    minQuantity: context.minQuantity ?? 1,
    maxQuantity: context.maxQuantity ?? null,
    availableQuantity: stock,
    confidence: Math.max(0, Math.min(100, confidence)),
    warnings,
  };
}

/* ---------------------------- message parsing ---------------------------- */

/** Heading that sets a quantity rebate for the lines beneath it. */
function contextFrom(line) {
  if (/\b(?:quantity|qty|volume)\s*(?:rebates?|discounts?|pricing|breaks?)\b/i.test(line)) {
    const qty = quantityFrom(line);
    return { minQuantity: qty?.minQuantity ?? null, maxQuantity: qty?.maxQuantity ?? null, heading: true };
  }
  if (/^\s*(?:if\s*you\s*)?(?:take|buy|order)\b/i.test(line)) {
    const qty = quantityFrom(line);
    if (qty) return { minQuantity: qty.minQuantity, maxQuantity: qty.maxQuantity, heading: true };
  }
  return null;
}

/** "5-9 $125" or "25+ $115" — a further tier for the product named above. */
function tierFrom(line) {
  const text = clean(line);
  let m = /^(\d+)\s*(?:-|–|to)\s*(\d+)\s*[:\s@-]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*\$?\s*(?:each|ea)?$/i.exec(text);
  if (m) return { minQuantity: Number(m[1]), maxQuantity: Number(m[2]), priceCents: centsFrom(m[3]) };

  m = /^(\d+)\s*\+\s*[:\s@-]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*\$?\s*(?:each|ea)?$/i.exec(text);
  if (m) return { minQuantity: Number(m[1]), maxQuantity: null, priceCents: centsFrom(m[2]) };

  return null;
}

/**
 * A whole vendor message.
 *
 * Returns every line's fate, so the review screen can show what was skipped and
 * why rather than silently dropping half a price list.
 */
function parseMessage(raw) {
  const text = String(raw || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const items = [];
  const skipped = [];
  let context = { minQuantity: null, maxQuantity: null };
  let lastItem = null;

  /* A pasted spreadsheet is a different kind of document and gets read as one.
     Anything above the table — a greeting, a rebate heading — is still read as
     prose, so a message that is half note and half table works. */
  const table = detectTable(lines);
  if (table) {
    const rows = lines
      .map((line, index) => ({ lineNumber: index + 1, raw: clean(line), cells: splitOn(line, table.sep) }))
      .filter((r) => r.raw);

    let roles = null;
    for (const row of rows) {
      if (!roles) {
        const header = readHeader(row.cells);
        if (header) {
          roles = header;
          continue; // the heading row is not a product
        }
      }
    }
    if (!roles) roles = inferRoles(rows.map((r) => r.cells));

    if (roles) {
      let headerSeen = false;
      for (const row of rows) {
        if (!headerSeen && readHeader(row.cells)) {
          headerSeen = true;
          continue;
        }

        const heading = contextFrom(row.raw);
        if (heading) {
          context = { minQuantity: heading.minQuantity, maxQuantity: heading.maxQuantity };
          continue;
        }

        const item = parseTableRow(row.cells, roles, context);
        if (!item) {
          skipped.push({ lineNumber: row.lineNumber, raw: row.raw, reason: "No product in the device column." });
          continue;
        }
        items.push({ ...item, lineNumber: row.lineNumber });
      }

      return { items, skipped, lineCount: rows.length, format: "table", columns: roles };
    }
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = clean(line);
    if (!trimmed) return;

    // A heading may share its line with the first product ("Quantity Rebates
    // If you take 10 or more iPad 8 119.99 Each"), so headings are stripped
    // rather than skipped, and whatever survives is parsed as a product.
    let working = trimmed;
    const heading = contextFrom(working);
    if (heading) {
      context = { minQuantity: heading.minQuantity, maxQuantity: heading.maxQuantity };
      working = working
        .replace(/\b(?:quantity|qty|volume)\s*(?:rebates?|discounts?|pricing|breaks?)\b\s*:?/i, " ")
        .replace(/\b(?:if\s*you\s*)?(?:take|buy|order)\s*\d+\s*(?:\+|or\s*more|and\s*(?:up|over))\b/i, " ");
      working = clean(working);
      if (!working) return;
    }

    const tier = tierFrom(working);
    if (tier) {
      if (!lastItem) {
        skipped.push({ lineNumber, raw: trimmed, reason: "Quantity tier with no product above it." });
        return;
      }
      if (tier.priceCents == null) {
        skipped.push({ lineNumber, raw: trimmed, reason: "Could not read the price on this tier." });
        return;
      }
      items.push({
        ...lastItem,
        raw: trimmed,
        lineNumber,
        priceCents: tier.priceCents,
        minQuantity: tier.minQuantity,
        maxQuantity: tier.maxQuantity,
        warnings: [`Quantity tier for ${lastItem.model ?? "the line above"}.`],
      });
      return;
    }

    const parsed = parseLine(working, context);
    if (!parsed) {
      if (HEADING_ONLY.some((re) => re.test(trimmed)) || heading) return;
      skipped.push({ lineNumber, raw: trimmed, reason: "No product could be read from this line." });
      return;
    }

    const item = { ...parsed, lineNumber, raw: trimmed };
    items.push(item);
    lastItem = item;
  });

  return { items, skipped, lineCount: lines.filter((l) => clean(l)).length, format: "text" };
}

module.exports = {
  parseMessage,
  parseLine,
  parseTableRow,
  detectTable,
  readHeader,
  splitBrand,
  priceFrom,
  quantityFrom,
  tierFrom,
  cleanModel,
  centsFrom,
};
