import { conditionLabel, type Product, type ProductUnit, type Service, type Store } from "../../lib/api";
import { notify } from "../../components/ui/notify";

/**
 * Label stock, in millimetres. Comes from Store settings; the fallback is the
 * 3.5in x 1.125in roll the shop used before settings existed.
 */
const DEFAULT_LABEL = { widthMm: 89, heightMm: 29 };

const labelSize = (store?: Store | null) => ({
  widthMm: store?.labelWidthMm || DEFAULT_LABEL.widthMm,
  heightMm: store?.labelHeightMm || DEFAULT_LABEL.heightMm,
});

/**
 * Code format: MMYY + 3 vendor letters + cost.
 *   month (02) + year (26) + first/middle/last letter of vendor + price
 *   → "0226GRE200" for a $200 unit from GoRecell received Feb 2026.
 */
function buildCode(vendorName: string | null | undefined, labelCostCents: number | null | undefined, when: Date): string {
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const yy = String(when.getFullYear()).slice(-2);

  const letters = vendorLetters(vendorName);
  const dollars = labelCostCents != null ? Math.round(labelCostCents / 100) : "";

  return `${mm}${yy}${letters}${dollars}`;
}

/** First, middle, and last letter of the vendor name (letters only). */
function vendorLetters(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (clean.length === 0) return "XXX";
  if (clean.length === 1) return clean.repeat(3);
  if (clean.length === 2) return clean[0] + clean[0] + clean[1];
  const first = clean[0];
  const middle = clean[Math.floor(clean.length / 2)];
  const last = clean[clean.length - 1];
  return first + middle + last;
}

/**
 * The unit label, sized from the label stock in Store settings. Everything
 * centered, three rows:
 *   1. name · storage · condition · note
 *   2. barcode of the serial, with the serial as text under it
 *   3. the price code and the sale price
 *
 * Like the service tag, every dimension is a multiple of `--s` — the ratio of
 * the configured stock to the 89mm x 29mm default — so the layout fills
 * whatever roll is loaded. Nothing is dropped to make it fit: the top line
 * wraps and then shrinks until it fits its box, and the barcode is stretched
 * through a viewBox rather than clipped.
 */
export function printUnitLabel(product: Product, unit: ProductUnit, store?: Store | null) {
  const { widthMm, heightMm } = labelSize(store);
  const scale = Math.min(
    widthMm / DEFAULT_LABEL.widthMm,
    heightMm / DEFAULT_LABEL.heightMm,
  ).toFixed(3);
  const topLine = [product.name, unit.storage, conditionLabel(unit.condition), unit.note]
    .filter(Boolean)
    .join(" · ");
  // Prefer the vendor recorded on this specific unit; fall back to the product's default.
  const vendorName = unit.vendor?.name ?? product.vendor?.name ?? null;
  const code = buildCode(vendorName, unit.labelCostCents, new Date(unit.createdAt));
  // Same as the vendor above: this serial's own price wins, the product's is the fallback.
  const priceCents = unit.salePriceCents ?? product.salePriceCents;
  const salePrice = priceCents != null ? "$" + (priceCents / 100).toFixed(2) : "";
  // Preview window follows the stock so the on-screen label isn't letterboxed.
  const winW = Math.round(widthMm * 6);
  const winH = Math.round(heightMm * 6) + 60;
  const win = window.open("", "_blank", `width=${winW},height=${winH}`);
  if (!win) {
    notify.warning("Pop-ups are blocked", {
      message: "Allow pop-ups for this site to print labels.",
    });
    return;
  }

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Label ${escapeHtml(unit.serial)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
        --s: ${scale};
        width: ${widthMm}mm; height: ${heightMm}mm;
        box-sizing: border-box;
        padding: calc(0.05in * var(--s)) calc(0.12in * var(--s));
        display: flex; flex-direction: column;
        align-items: center; justify-content: space-between;
        text-align: center;
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
    }
    /* Height is left to the content: one line stays one line, and the script
       below shrinks the font so this never runs past two. */
    .top { font-size: calc(14pt * var(--s)); font-weight: 700; line-height: 1.1;
        width: 100%; flex: 0 0 auto; overflow: hidden;
        overflow-wrap: anywhere; }
    .barcode { display: flex; flex-direction: column; align-items: center;
        width: 100%; flex: 1 1 auto; min-height: 0; }
    svg { display: block; width: 100%; flex: 1 1 0; min-height: 0; }
    .serial { font-size: calc(6.5pt * var(--s)); letter-spacing: calc(0.4px * var(--s));
        line-height: 1; margin-top: calc(2px * var(--s)); flex: 0 0 auto; }
    .bottom { display: flex; align-items: baseline; justify-content: space-between;
        width: 100%; gap: calc(4px * var(--s)); flex: 0 0 auto; }
    .code { font-size: calc(11pt * var(--s)); font-weight: 700; line-height: 1; }
    .price { font-size: calc(13pt * var(--s)); font-weight: 700; line-height: 1; }
</style>
</head>
<body>
  <div class="label">
    <div class="top">${escapeHtml(topLine)}</div>
    <div class="barcode">
      <svg id="bc"></svg>
      <div class="serial">${escapeHtml(unit.serial)}</div>
    </div>
    <div class="bottom">
      <span class="code">${escapeHtml(code)}</span>
      <span class="price">${escapeHtml(salePrice)}</span>
    </div>
  </div>
  <script>
    var svg = document.getElementById("bc");
    JsBarcode(svg, ${JSON.stringify(unit.serial)}, {
      format: "CODE128", displayValue: false,
      margin: 0, height: 22, width: 1.6
    });
    // JsBarcode sizes the svg in pixels. Trade those fixed attributes for a
    // viewBox so the bars stretch to whatever box the flex layout gives them.
    var bw = svg.getAttribute("width"), bh = svg.getAttribute("height");
    if (bw && bh) {
      svg.setAttribute("viewBox", "0 0 " + bw + " " + bh);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    }

    // Cap an element at maxLines by shrinking its font, never by cutting text.
    // line-height is unitless in the CSS above, so the computed value tracks
    // each smaller font size and the line budget shrinks with it.
    function fitLines(el, maxLines) {
      if (!el) return;
      var size = parseFloat(getComputedStyle(el).fontSize);
      for (var i = 0; i < 80; i++) {
        var lh = parseFloat(getComputedStyle(el).lineHeight) || size * 1.1;
        if (el.scrollHeight <= lh * maxLines + 0.5) break;
        size -= 0.25;
        if (size < 4) break;
        el.style.fontSize = size + "px";
      }
    }

    // Must run after layout exists — measuring while the document is still
    // being written reports zero heights and silently skips the shrink.
    window.onafterprint = () => window.close();
    setTimeout(() => {
      fitLines(document.querySelector(".top"), 2);
      window.focus();
      window.print();
    }, 250);
  </script>
</body>
</html>`);
  win.document.close();
}

/* ----------------------------- service tag ----------------------------- */

/** Full customer name from a service's customer record. */
function customerName(service: Service): string {
  const c = service.customer;
  if (!c) return "";
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

/** Customer phone (prefer mobile if present). */
function customerPhone(service: Service): string {
  const c = service.customer as any;
  return (c?.mobile || c?.phone || "").toString();
}

/** Device make + model as one line. */
function deviceLine(service: Service): string {
  return [service.deviceMake, service.deviceModel].filter(Boolean).join(" ").trim();
}

/**
 * Price of the service before GST: parts + labour (the subtotal).
 * GST is added on the invoice / tracking page, not here.
 *
 * Labour lines are stored as ticket parts with no product attached, so
 * `labourCents` is a slice of `parts`, not a separate charge — adding the two
 * together billed labour twice. Use the server's total, exactly as the invoice
 * does, and only fall back to summing the lines if it isn't loaded.
 */
function serviceSubtotalCents(service: Service): number {
  if (typeof service.totalCents === "number") return service.totalCents;
  return (service.parts ?? []).reduce(
    (sum, p) => sum + (p.priceCents ?? 0) * (p.quantity ?? 1),
    0,
  );
}

/**
 * The service tag, sized from the label stock in Store settings.
 * Two columns:
 *   Left  — customer name, phone, device, passcode, PROBLEM + reported problem
 *   Right — #number and the price
 *
 * Every dimension is a multiple of `--s`, the ratio of the configured stock to
 * the 89mm x 29mm default, so the same layout fills whatever roll the machine
 * is loaded with instead of overflowing small stock or stranding big stock.
 *
 * Leaves printUnitLabel untouched.
 */
export function printServiceTag(service: Service, store?: Store | null) {
  const { widthMm, heightMm } = labelSize(store);
  const scale = Math.min(
    widthMm / DEFAULT_LABEL.widthMm,
    heightMm / DEFAULT_LABEL.heightMm,
  ).toFixed(3);
  const name = customerName(service);
  const phone = customerPhone(service);
  const device = deviceLine(service);
  const numberStr = String(service.number);
  const passcode = service.passcode ?? "";
  const problem = service.issue ?? "";
  const price = "$" + (serviceSubtotalCents(service) / 100).toFixed(2);

  // Preview window follows the stock so the on-screen tag isn't letterboxed.
  const winW = Math.round(widthMm * 6);
  const winH = Math.round(heightMm * 6) + 60;
  const win = window.open("", "_blank", `width=${winW},height=${winH}`);
  if (!win) {
    notify.warning("Pop-ups are blocked", {
      message: "Allow pop-ups for this site to print labels.",
    });
    return;
  }

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Service ${escapeHtml(numberStr)}</title>
<style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
        --s: ${scale};
        width: ${widthMm}mm; height: ${heightMm}mm;
        box-sizing: border-box;
        padding: calc(0.05in * var(--s)) calc(6px * var(--s))
                 calc(0.05in * var(--s)) calc(3px * var(--s));
        display: flex; gap: calc(6px * var(--s));
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
    }
    .left { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .right { flex: 0 0 auto; max-width: 34%; display: flex; flex-direction: column;
        align-items: center; justify-content: center; text-align: center;
        gap: calc(4px * var(--s)); }
    /* Wraps to a second line the moment it runs into the price column. */
    .name { font-size: calc(9pt * var(--s)); font-weight: 700; line-height: 1.15;
        overflow-wrap: anywhere;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .phone { font-size: calc(7pt * var(--s)); line-height: 1.2; }
    .device { font-size: calc(8pt * var(--s)); font-weight: 700; line-height: 1.2;
        overflow-wrap: anywhere;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .pass { font-size: calc(7.5pt * var(--s)); line-height: 1.2; }
    .lbl { font-size: calc(6pt * var(--s)); color: #888;
        letter-spacing: calc(0.5px * var(--s)); margin-top: calc(1px * var(--s)); }
    .problem { font-size: calc(7.5pt * var(--s)); line-height: 1.05;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .num { font-size: calc(14pt * var(--s)); font-weight: 700; line-height: 1; }
    .tl { font-size: calc(6pt * var(--s)); color: #888;
        letter-spacing: calc(0.5px * var(--s)); line-height: 1; }
    .tv { font-size: calc(15pt * var(--s)); font-weight: 700; line-height: 1.1; }
</style>
</head>
<body>
  <div class="label">
    <div class="left">
      <div class="name">${escapeHtml(name)}</div>
      ${phone ? `<div class="phone">${escapeHtml(phone)}</div>` : ""}
      ${device ? `<div class="device">${escapeHtml(device)}</div>` : ""}
      ${passcode ? `<div class="pass"><b>Pass:</b> ${escapeHtml(passcode)}</div>` : ""}
      <div class="lbl">PROBLEM</div>
      <div class="problem">${escapeHtml(problem || "—")}</div>
    </div>
    <div class="right">
      <div class="num">#${escapeHtml(numberStr)}</div>
      <div>
        <div class="tl">PRICE</div>
        <div class="tv">${escapeHtml(price)}</div>
      </div>
    </div>
  </div>
  <script>
    window.onafterprint = () => window.close();
    setTimeout(() => { window.focus(); window.print(); }, 250);
  </script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}