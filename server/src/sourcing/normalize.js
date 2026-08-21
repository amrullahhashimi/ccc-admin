/**
 * The shared vocabulary for vendor price lists.
 *
 * Everything that decides "are these two lines the same product?" lives here,
 * so the parser, the matcher and the importer can never disagree about it.
 *
 * Two ideas do the work:
 *
 *   normalizeAttributes()  puts a parsed line into one house spelling —
 *                          "ipad"/"IPAD"/"Ipad" all become "iPad", "wifi+cell"
 *                          becomes "WiFi + Cellular".
 *
 *   buildMatchKey()        reduces those attributes to a signature. Same
 *                          signature means same product, full stop. Different
 *                          signature is never merged on its own; a person has
 *                          to say so.
 *
 * Which attributes count towards the signature is the whole safety argument:
 * storage, connectivity, grade and condition are in it, because a shop buying
 * "iPad 8 32GB WiFi Grade A" cannot be handed "iPad 8 64GB WiFi+Cellular Grade
 * B" instead. Colour is deliberately out — vendors leave it off constantly, and
 * having it in would split one product into a dozen half-empty ones.
 */

/* ------------------------------ spelling ------------------------------ */

/// Words vendors write however they like, and the one spelling we keep.
const WORD_SPELLING = new Map(
  Object.entries({
    ipad: "iPad",
    ipads: "iPad",
    iphone: "iPhone",
    iphones: "iPhone",
    ipod: "iPod",
    imac: "iMac",
    macbook: "MacBook",
    mac: "Mac",
    airpods: "AirPods",
    airpod: "AirPods",
    watch: "Watch",
    oneplus: "OnePlus",
    onepluss: "OnePlus",
    pixel: "Pixel",
    galaxy: "Galaxy",
    surface: "Surface",
    thinkpad: "ThinkPad",
    xperia: "Xperia",
    moto: "Moto",
    motorola: "Motorola",
    nokia: "Nokia",
    huawei: "Huawei",
    xiaomi: "Xiaomi",
    redmi: "Redmi",
    oppo: "OPPO",
    vivo: "Vivo",
    realme: "realme",
    zte: "ZTE",
    lg: "LG",
    tcl: "TCL",
    asus: "ASUS",
    acer: "Acer",
    dell: "Dell",
    hp: "HP",
    lenovo: "Lenovo",
    air: "Air",
    mini: "Mini",
    pro: "Pro",
    max: "Max",
    plus: "Plus",
    ultra: "Ultra",
    fold: "Fold",
    flip: "Flip",
    open: "Open",
    note: "Note",
    gen: "Gen",
    se: "SE",
    xr: "XR",
    xs: "XS",
    nord: "Nord",
    fe: "FE",
    tab: "Tab",
    book: "Book",
    go: "Go",
    studio: "Studio",
    laptop: "Laptop",
    esim: "eSIM",
    gps: "GPS",
    xp: "XP",
    active: "Active",
    series: "Series",
  })
);

/// Model words a vendor may fat-finger. Repaired only within edit distance 1,
/// and only against this list — never against arbitrary text.
const TYPO_TARGETS = [
  "fold",
  "flip",
  "plus",
  "max",
  "mini",
  "pro",
  "ultra",
  "air",
  "gen",
  "note",
  "open",
  "nord",
  "wifi",
  "cell",
  "cellular",
  "grade",
  "each",
];

/**
 * Real words that must never be "corrected" into a model word.
 *
 * Without this, "Fair" in a condition column is one edit away from "Air" and
 * quietly turns an iPhone XR into an iPhone XR Air. Repair only ever adds a
 * character now (fol → fold), never removes one.
 */
const NEVER_REPAIR = new Set([
  "fair",
  "good",
  "mint",
  "poor",
  "used",
  "new",
  "each",
  "cell",
  "grade",
  "wifi",
  "gold",
  "gray",
  "grey",
  "blue",
  "pink",
  "red",
  "case",
  "port",
  "plan",
  "note",
  "open",
]);

/* ------------------------------- brands ------------------------------- */

const BRANDS = [
  { name: "Apple", aliases: ["apple"] },
  { name: "Samsung", aliases: ["samsung"] },
  { name: "Google", aliases: ["google"] },
  { name: "OnePlus", aliases: ["oneplus", "one plus"] },
  { name: "Microsoft", aliases: ["microsoft"] },
  { name: "Motorola", aliases: ["motorola", "moto"] },
  { name: "Sony", aliases: ["sony"] },
  { name: "LG", aliases: ["lg"] },
  { name: "Nokia", aliases: ["nokia"] },
  { name: "Huawei", aliases: ["huawei"] },
  { name: "Xiaomi", aliases: ["xiaomi", "redmi"] },
  { name: "OPPO", aliases: ["oppo"] },
  { name: "Vivo", aliases: ["vivo"] },
  { name: "realme", aliases: ["realme"] },
  { name: "ZTE", aliases: ["zte"] },
  { name: "TCL", aliases: ["tcl"] },
  { name: "ASUS", aliases: ["asus"] },
  { name: "Acer", aliases: ["acer"] },
  { name: "Dell", aliases: ["dell"] },
  { name: "HP", aliases: ["hp"] },
  { name: "Lenovo", aliases: ["lenovo", "thinkpad"] },
  { name: "Sonim", aliases: ["sonim"] },
  { name: "Kyocera", aliases: ["kyocera"] },
  { name: "BlackBerry", aliases: ["blackberry"] },
  { name: "CAT", aliases: ["cat", "caterpillar"] },
  { name: "Nothing", aliases: ["nothing"] },
  { name: "Honor", aliases: ["honor"] },
  { name: "Alcatel", aliases: ["alcatel"] },
];

/**
 * Model words that give the brand away on their own. A vendor writing
 * "iPad 8" never adds "Apple", and a price list is not the place to guess.
 */
const MODEL_BRAND = [
  { test: /^(ipad|iphone|ipod|macbook|imac|airpods|apple watch)\b/i, brand: "Apple" },
  { test: /^(galaxy|note\b)/i, brand: "Samsung" },
  { test: /^pixel\b/i, brand: "Google" },
  { test: /^(oneplus|nord)\b/i, brand: "OnePlus" },
  { test: /^surface\b/i, brand: "Microsoft" },
  { test: /^(moto|razr|edge)\b/i, brand: "Motorola" },
  { test: /^xperia\b/i, brand: "Sony" },
  { test: /^thinkpad\b/i, brand: "Lenovo" },
  { test: /^(redmi|poco)\b/i, brand: "Xiaomi" },
  { test: /^(sonim|xp\s*\d)\b/i, brand: "Sonim" },
  { test: /^(blackberry)\b/i, brand: "BlackBerry" },
];

/** What kind of thing it is, from the model words. */
const TYPE_RULES = [
  { test: /\b(ipad|tab|tablet)\b/i, type: "Tablet" },
  { test: /\b(iphone|pixel|galaxy s|galaxy z|galaxy a|nord|moto|razr|xperia|phone)\b/i, type: "Phone" },
  { test: /\b(macbook|surface|thinkpad|laptop|notebook)\b/i, type: "Laptop" },
  { test: /\b(imac|desktop)\b/i, type: "Desktop" },
  { test: /\b(watch)\b/i, type: "Watch" },
  { test: /\b(airpods|buds|case|charger|cable|adapter)\b/i, type: "Accessory" },
];

/* ---------------------------- vocabularies ---------------------------- */

const CONNECTIVITY = [
  { value: "WiFi + Cellular", test: /\b(wi[\s-]?fi|wf)\s*(\+|and|\/|&)\s*(cell(ular)?|lte|4g|5g)\b|\bcellular\s*(\+|and|\/|&)\s*wi[\s-]?fi\b|\bwifi\s*cell(ular)?\b/i },
  { value: "WiFi + Cellular", test: /\b(wifi|wi-fi)\+cell(ular)?\b/i },
  { value: "Cellular", test: /\b(cell(ular)?|lte)\b/i },
  { value: "5G", test: /\b5g\b/i },
  { value: "WiFi", test: /\b(wi[\s-]?fi|wifi only)\b/i },
];

const CONDITIONS = [
  { value: "New", test: /\b(brand\s*new|bnib|new\s*sealed|sealed|new)\b/i },
  { value: "Open box", test: /\b(open\s*box|openbox|ob)\b/i },
  { value: "Refurbished", test: /\b(refurb(ished)?|renewed|cpo)\b/i },
  { value: "For parts", test: /\b(for\s*parts|parts\s*only|broken|faulty)\b/i },
  { value: "Used", test: /\b(used|pre[\s-]?owned|second\s*hand)\b/i },
];

const CARRIERS = [
  { value: "Unlocked", test: /\b(unlocked|factory\s*unlocked)\b/i },
  { value: "Rogers", test: /\brogers\b/i },
  { value: "Bell", test: /\bbell\b/i },
  { value: "Telus", test: /\btelus\b/i },
  { value: "Fido", test: /\bfido\b/i },
  { value: "Koodo", test: /\bkoodo\b/i },
  { value: "Freedom", test: /\bfreedom\b/i },
  { value: "Locked", test: /\block(ed)?\b/i },
];

/** Noise that carries no product meaning. */
const NOISE = /\b(each|ea|per\s*unit|pcs?|pieces?|units?|available|avail|in\s*stock|stock|price|prices|only|left|qty|quantity)\b/gi;

/* ------------------------------ helpers ------------------------------ */

/** Levenshtein, capped — used only for one-character model typos. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      last = tmp;
    }
  }
  return prev[b.length];
}

/**
 * "fol" → "fold".
 *
 * Only ever completes a word: the target must be longer than what was typed,
 * so a real word is never eaten by a shorter model word it happens to sit one
 * edit away from.
 */
function repairTypo(word) {
  const lower = word.toLowerCase();
  if (lower.length < 3) return word;
  if (TYPO_TARGETS.includes(lower)) return word;
  if (NEVER_REPAIR.has(lower) || WORD_SPELLING.has(lower)) return word;

  for (const target of TYPO_TARGETS) {
    if (target.length === lower.length + 1 && editDistance(lower, target) === 1) return target;
  }
  return word;
}

/**
 * House spelling for one word of a model name.
 *
 * Bare numbers and things like "16e", "XR", "i5-11th" keep their shape; known
 * words get their canonical casing; anything else is capitalised.
 */
function spellWord(word) {
  const lower = word.toLowerCase();
  if (WORD_SPELLING.has(lower)) return WORD_SPELLING.get(lower);

  const repaired = repairTypo(lower);
  if (repaired !== lower && WORD_SPELLING.has(repaired)) return WORD_SPELLING.get(repaired);

  if (/^\d+(st|nd|rd|th)?$/i.test(word)) return lower;
  if (/^\d/.test(word)) return lower; // 16e, 11th, 256gb
  if (/^[A-Z0-9]{2,4}$/.test(word)) return word.toUpperCase(); // XR, XS, SE, 5G
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** The whole model string in house spelling. */
function spellModel(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(spellWord)
    .join(" ")
    .trim();
}

/** "128gb" / "128 GB" / "1tb" → "128GB" / "1TB". */
function normalizeSize(text) {
  if (!text) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(gb|tb|mb)$/i.exec(String(text).trim());
  if (!m) return String(text).trim().toUpperCase();
  return `${Number(m[1])}${m[2].toUpperCase()}`;
}

/** Sizes compare as megabytes so 1TB sorts above 512GB. */
function sizeToMb(text) {
  const m = /^(\d+(?:\.\d+)?)\s*(gb|tb|mb)$/i.exec(String(text || "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === "tb" ? n * 1024 * 1024 : unit === "gb" ? n * 1024 : n;
}

/**
 * Cosmetic grade, on whichever scale the vendor uses.
 *
 * Two scales are in circulation and both mean the same kind of thing: letters
 * (Grade A/B/C) and words (Mint, Excellent, Good, Fair, Poor). Both are kept as
 * written rather than translated into each other — a vendor's "Good" is their
 * own standard, and pretending it equals somebody else's "B" would merge stock
 * that was never the same.
 */
const GRADE_WORDS = ["Mint", "Pristine", "Excellent", "Very good", "Good", "Fair", "Poor", "Damaged"];

function normalizeGrade(text) {
  if (!text) return null;
  const raw = String(text).trim();

  const letter = /^(?:grade\s*[-:]?\s*)?([a-d][+-]?)$/i.exec(raw);
  if (letter) return letter[1].toUpperCase();

  const word = GRADE_WORDS.find((g) => g.toLowerCase() === raw.toLowerCase().replace(/\s+/g, " "));
  if (word) return word;

  const stockGrade = /^([a-d])\s*[-/]?\s*stock$/i.exec(raw);
  if (stockGrade) return stockGrade[1].toUpperCase();

  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** "Grade A" for a letter, but just "Good" for a word — "Grade Good" reads wrong. */
const gradeLabel = (grade) =>
  !grade ? null : /^[a-d][+-]?$/i.test(String(grade)) ? `Grade ${String(grade).toUpperCase()}` : String(grade);

/** Brand written the house way, if we know it at all. */
function normalizeBrand(text) {
  if (!text) return null;
  const lower = String(text).trim().toLowerCase();
  const hit = BRANDS.find((b) => b.aliases.includes(lower) || b.name.toLowerCase() === lower);
  return hit ? hit.name : spellModel(text);
}

/** The brand a model name implies, or null. Never guessed from anything else. */
function brandFromModel(model) {
  const text = String(model || "").trim();
  for (const rule of MODEL_BRAND) if (rule.test.test(text)) return rule.brand;
  return null;
}

function typeFromModel(model) {
  const text = String(model || "");
  for (const rule of TYPE_RULES) if (rule.test.test(text)) return rule.type;
  return null;
}

/* ---------------------------- the two exports ---------------------------- */

/**
 * One parsed line, tidied into house spelling. Anything absent stays null —
 * a price list that doesn't mention condition doesn't mean "New".
 */
function normalizeAttributes(input = {}) {
  const model = input.model ? spellModel(input.model) : null;
  const brand = input.brand ? normalizeBrand(input.brand) : brandFromModel(model);

  return {
    brand: brand || null,
    model: model || null,
    generation: input.generation ? String(input.generation).trim() : null,
    productType: input.productType || typeFromModel(model) || null,
    storage: input.storage ? normalizeSize(input.storage) : null,
    ram: input.ram ? normalizeSize(input.ram) : null,
    connectivity: input.connectivity || null,
    carrier: input.carrier || null,
    condition: input.condition || null,
    grade: input.grade ? normalizeGrade(input.grade) : null,
    color: input.color ? spellModel(input.color) : null,
    cpu: input.cpu ? String(input.cpu).trim() : null,
    screenSize: input.screenSize ? String(input.screenSize).trim() : null,
    specifications: input.specifications && Object.keys(input.specifications).length ? input.specifications : null,
  };
}

/**
 * The attributes that make two rows the same product.
 *
 * Colour is not here (vendors omit it constantly, and splitting on it would
 * shatter the catalogue). Everything else is: buying a 64GB when you priced a
 * 32GB, or a Grade B when you priced a Grade A, is a real loss of money.
 */
const KEY_FIELDS = [
  "brand",
  "model",
  "generation",
  "storage",
  "ram",
  "connectivity",
  "carrier",
  "condition",
  "grade",
  "cpu",
];

/** Attributes that must never be silently reconciled. See match.js. */
const SIGNIFICANT_FIELDS = ["storage", "ram", "connectivity", "carrier", "condition", "grade", "cpu"];

function buildMatchKey(attrs = {}) {
  return KEY_FIELDS.map((f) => String(attrs[f] ?? "").trim().toLowerCase())
    .join("|")
    .replace(/\s+/g, " ");
}

/**
 * Brand and model, without saying the brand twice.
 *
 * "OnePlus Open" and "Sonim XP 9900" already carry their maker's name; only a
 * brand that sits outside the model name gets prepended.
 */
function productLabel(attrs = {}) {
  const saysBrand =
    attrs.brand && attrs.model && new RegExp(`^${attrs.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(attrs.model);
  return [saysBrand ? null : attrs.brand, attrs.model].filter(Boolean).join(" ").trim();
}

/** What the product is called everywhere in the UI. */
function displayName(attrs = {}) {
  const parts = [];
  const label = productLabel(attrs);
  if (label) parts.push(label);
  if (attrs.generation) parts.push(attrs.generation);
  if (attrs.cpu) parts.push(attrs.cpu);
  if (attrs.ram) parts.push(`${attrs.ram} RAM`);
  if (attrs.storage) parts.push(attrs.storage);
  if (attrs.connectivity) parts.push(attrs.connectivity);
  if (attrs.carrier) parts.push(attrs.carrier);
  if (attrs.color) parts.push(attrs.color);
  if (attrs.condition) parts.push(attrs.condition);
  if (attrs.grade) parts.push(`Grade ${attrs.grade}`);
  const name = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return name || "Unnamed product";
}

module.exports = {
  BRANDS,
  GRADE_WORDS,
  gradeLabel,
  CARRIERS,
  CONDITIONS,
  CONNECTIVITY,
  KEY_FIELDS,
  NOISE,
  SIGNIFICANT_FIELDS,
  brandFromModel,
  buildMatchKey,
  displayName,
  productLabel,
  editDistance,
  normalizeAttributes,
  normalizeBrand,
  normalizeGrade,
  normalizeSize,
  repairTypo,
  sizeToMb,
  spellModel,
  typeFromModel,
};
