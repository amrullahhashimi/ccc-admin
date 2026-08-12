/**
 * Rebuilds the bundled TAC database (server/data/tac.csv.gz).
 *
 *   node scripts/build-tacdb.js
 *
 * Pulls the latest TAC list, normalises it, and writes a gzipped
 * `tac,brand,model,details` file. Run it once or twice a year to pick up new
 * phones — the committed file works fine until then.
 *
 * Source: https://github.com/MoazEb/tac-database (MIT) — see data/README.md.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SOURCE = "https://raw.githubusercontent.com/MoazEb/tac-database/main/tac_full.csv";
const OUT = path.join(__dirname, "..", "data", "tac.csv.gz");

/** CSV line split that respects double quotes. */
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

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

async function main() {
  console.log("Downloading", SOURCE);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const csv = await res.text();

  const lines = csv.split(/\r?\n/);
  const seen = new Set();
  const rows = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [rawBrand, rawTac, rawSpecs] = splitCsv(line);

    // Excel ate the leading zeros on some TACs (01… became 1…), so pad them back.
    const tac = clean(rawTac);
    if (!/^\d{1,8}$/.test(tac)) {
      skipped++;
      continue;
    }
    const key = tac.padStart(8, "0");
    if (seen.has(key)) continue;

    const specs = clean(rawSpecs);
    const brand = clean(rawBrand);
    if (!brand || brand === "N/A") {
      skipped++;
      continue;
    }

    // specs is "MARKETING NAME, vendor model, variant, year" — the first part is
    // the name staff actually recognise; keep the rest as details.
    const parts = specs.split(",").map(clean).filter(Boolean);
    const model = parts[0] && parts[0] !== "N/A" ? parts[0] : "";
    const details = parts.slice(1).filter((p) => p !== "N/A").join(", ");
    if (!model) {
      skipped++;
      continue;
    }

    seen.add(key);
    rows.push([key, brand, model, details]);
  }

  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const quote = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body =
    "tac,brand,model,details\n" +
    rows.map((r) => r.map(quote).join(",")).join("\n") +
    "\n";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zlib.gzipSync(Buffer.from(body, "utf8"), { level: 9 }));

  console.log(`Wrote ${rows.length} TACs (${skipped} rows skipped) → ${OUT}`);
  console.log(`Size: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB gzipped`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
