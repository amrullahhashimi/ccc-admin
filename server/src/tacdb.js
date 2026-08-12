/**
 * Offline TAC → device lookup.
 *
 * The first 8 digits of an IMEI (the Type Allocation Code) say which device it
 * is. GSMA's own database is licensed, but an open one covering ~255k TACs ships
 * in server/data/tac.csv.gz — see data/README.md for the source and licence.
 *
 * The file is read once, on the first lookup, so a server that never opens the
 * IMEI tool never pays for it. Refresh it with `node scripts/build-tacdb.js`.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const FILE = path.join(__dirname, "..", "data", "tac.csv.gz");

let index = null; // Map<tac, "brand,model,details"> — parsed only on a hit
let loadError = null;

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function load() {
  if (index || loadError) return;
  try {
    const csv = zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8");
    const map = new Map();
    let first = true;
    for (const line of csv.split("\n")) {
      if (first) {
        first = false;
        continue;
      }
      if (!line) continue;
      const comma = line.indexOf(",");
      if (comma !== 8) continue;
      map.set(line.slice(0, 8), line.slice(comma + 1));
    }
    index = map;
  } catch (err) {
    loadError = err.message;
    console.warn("TAC database unavailable:", err.message);
  }
}

/**
 * A standalone 4-digit year, if the row has one. Many rows glue the year onto
 * the model number ("SM-S94802026"), and splitting those would corrupt the
 * model, so those come back without a year rather than with a guess.
 */
function yearFrom(parts) {
  const now = new Date().getFullYear();
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (/^(19|20)\d{2}$/.test(p)) {
      const year = Number(p);
      if (year >= 1990 && year <= now + 1) return year;
    }
  }
  return null;
}

/*
 * Carrier-branded variants. Plenty of TACs are allocated to a network's own
 * version of a handset ("T-MOBILE REVVL 5G", "VERIZON GALAXY S5"), which tells
 * you what the phone was built for — not whether it's locked today.
 */
const CARRIERS = [
  ["T-Mobile", /^t[-\s]?mobile\b/i],
  ["Verizon", /^verizon\b/i],
  ["AT&T", /^at\s?&\s?t\b/i],
  ["Sprint", /^sprint\b/i],
  ["US Cellular", /^u\.?s\.?\s?cellular\b/i],
  ["Cricket", /^cricket\b/i],
  ["MetroPCS", /^metro\s?pcs\b/i],
  ["Boost", /^boost\b/i],
  ["TracFone", /^tracfone\b/i],
  ["Rogers", /^rogers\b/i],
  ["Bell", /^bell\s+(mobility|canada)\b/i],
  ["Telus", /^telus\b/i],
  ["Fido", /^fido\b/i],
  ["Koodo", /^koodo\b/i],
  ["Freedom Mobile", /^freedom\s+mobile\b/i],
  ["Vodafone", /^vodafone\b/i],
  ["Orange", /^orange\b/i],
  ["O2", /^o2\b/i],
  ["EE", /^ee\b/i],
  ["NTT Docomo", /^(ntt\s+)?docomo\b/i],
  ["SoftBank", /^softbank\b/i],
  ["KDDI", /^kddi\b/i],
  ["SK Telecom", /^sk\s?telecom\b/i],
  ["China Mobile", /^china\s+mobile\b/i],
  ["China Unicom", /^china\s+unicom\b/i],
  ["China Telecom", /^china\s+telecom\b/i],
  ["Claro", /^claro\b/i],
  ["Movistar", /^movistar\b/i],
  ["Telcel", /^telcel\b/i],
];

const REGIONS = [
  ["Global model", /\bglobal\s+model\b/i],
  ["EU model", /\beu\s+model\b/i],
  ["US model", /\b(us|usa)\s+model\b/i],
  ["Canadian model", /\bcanada\s+model\b/i],
  ["South Korea model", /\bsk\s+model\b/i],
  ["China model", /\bchina\s+model\b/i],
  ["India model", /\bindia\s+model\b/i],
  ["Japan model", /\bjapan\s+model\b/i],
];

/**
 * Which network's variant this is, when the TAC says so.
 *
 * Only matched at the start of the model or spec text: plenty of rows mention a
 * network mid-string for unrelated reasons ("HARMAN ROGERS CAR CONNECT"), and
 * some brands are named like networks (A-BELL phones aren't Bell Mobility), so
 * a row whose own brand is the network is left alone.
 */
function variantFrom(brand, model, details) {
  const brandKey = (brand || "").toLowerCase();
  for (const [label, pattern] of CARRIERS) {
    if (brandKey === label.toLowerCase()) continue;
    if (pattern.test(model || "") || pattern.test(details || "")) return label;
  }
  return null;
}

function regionFrom(text) {
  for (const [label, pattern] of REGIONS) if (pattern.test(text)) return label;
  return null;
}

/** Look up an 8-digit TAC. Returns null when it isn't in the database. */
function deviceFromTac(tac) {
  load();
  if (!index) return null;

  const row = index.get(String(tac || "").padStart(8, "0"));
  if (!row) return null;

  const [brand, model, details] = splitCsv(row);
  const parts = (details || "").split(",").map((p) => p.trim()).filter(Boolean);
  const year = yearFrom(parts);
  const haystack = `${model || ""} ${details || ""}`;

  return {
    brand: brand || null,
    model: model || null,
    details: details || null,
    year,
    carrierVariant: variantFrom(brand, model, details),
    region: regionFrom(haystack),
    dualSim: /\bdual\s?sim\b/i.test(haystack) ? true : null,
  };
}

function stats() {
  load();
  return { entries: index ? index.size : 0, error: loadError };
}

module.exports = { deviceFromTac, stats };
