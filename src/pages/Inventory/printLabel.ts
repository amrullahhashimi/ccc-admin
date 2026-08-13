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
 * A single 3.5" x 1.125" label, everything centered, three rows:
 *   1. name · storage · condition · note   (one line)
 *   2. barcode of the serial, with the serial as text under it
 *   3. the price code
 */
export function printUnitLabel(product: Product, unit: ProductUnit, store?: Store | null) {
  const { widthMm, heightMm } = labelSize(store);
  const topLine = [product.name, unit.storage, conditionLabel(unit.condition), unit.note]
    .filter(Boolean)
    .join(" · ");
  // Prefer the vendor recorded on this specific unit; fall back to the product's default.
  const vendorName = unit.vendor?.name ?? product.vendor?.name ?? null;
  const code = buildCode(vendorName, unit.labelCostCents, new Date(unit.createdAt));
  // Same as the vendor above: this serial's own price wins, the product's is the fallback.
  const priceCents = unit.salePriceCents ?? product.salePriceCents;
  const salePrice = priceCents != null ? "$" + (priceCents / 100).toFixed(2) : "";
  const win = window.open("", "_blank", "width=520,height=240");
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
        width: ${widthMm}mm; height: ${heightMm}mm;
        box-sizing: border-box; padding: 0.05in 0.12in;
        display: flex; flex-direction: column;
        align-items: center; justify-content: space-between;
        text-align: center;
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
    }
    .top { font-size: 7pt; font-weight: 700; line-height: 1.1;
        width: 100%; height: 0.16in; overflow: hidden;
        white-space: nowrap; text-overflow: ellipsis; }
    .barcode { display: flex; flex-direction: column; align-items: center;
        width: 100%; height: 0.62in; }
    svg { width: 100%; height: 100%; }
    .serial { font-size: 6.5pt; letter-spacing: 0.4px; line-height: 1; margin-top: 2px; }
    .bottom { display: flex; align-items: baseline; justify-content: space-between;
        width: 100%; }
    .code { font-size: 11pt; font-weight: 700; line-height: 1; }
    .price { font-size: 13pt; font-weight: 700; line-height: 1; }
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
    JsBarcode("#bc", ${JSON.stringify(unit.serial)}, {
      format: "CODE128", displayValue: false,
      margin: 0, height: 44, width: 1.6
    });
    window.onafterprint = () => window.close();
    setTimeout(() => { window.focus(); window.print(); }, 250);
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
 * A single 3.5" x 1.125" service tag with 3px side margins.
 * Two columns:
 *   Left  — customer name, phone, device, passcode, PROBLEM + reported problem
 *   Right — #number, Code128 barcode of the number, TOTAL (GST included)
 *
 * Leaves printUnitLabel untouched.
 */
export function printServiceTag(service: Service, store?: Store | null) {
  const { widthMm, heightMm } = labelSize(store);
  const name = customerName(service);
  const phone = customerPhone(service);
  const device = deviceLine(service);
  const numberStr = String(service.number);
  const passcode = service.passcode ?? "";
  const problem = service.issue ?? "";
  const price = "$" + (serviceSubtotalCents(service) / 100).toFixed(2);

  const win = window.open("", "_blank", "width=520,height=240");
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
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
        width: ${widthMm}mm; height: ${heightMm}mm;
        box-sizing: border-box; padding: 0.05in 6px 0.05in 3px;
        display: flex; gap: 6px;
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
    }
    .left { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .right { width: 1.2in; display: flex; flex-direction: column;
        align-items: center; justify-content: space-between; text-align: center; }
    .name { font-size: 9pt; font-weight: 700; line-height: 1.15;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .phone { font-size: 7pt; line-height: 1.2; }
    .device { font-size: 8pt; font-weight: 700; line-height: 1.2;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pass { font-size: 7.5pt; line-height: 1.2; }
    .lbl { font-size: 6pt; color: #888; letter-spacing: 0.5px; margin-top: 1px; }
    .problem { font-size: 7.5pt; line-height: 1.05;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .num { font-size: 11pt; font-weight: 700; line-height: 1; }
    .bcwrap { width: 100%; height: 0.42in; }
    .bcwrap svg { width: 100%; height: 100%; }
    .tl { font-size: 6pt; color: #888; letter-spacing: 0.5px; line-height: 1; }
    .tv { font-size: 12pt; font-weight: 700; line-height: 1.1; }
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
      <div class="bcwrap"><svg id="bc"></svg></div>
      <div>
        <div class="tl">PRICE</div>
        <div class="tv">${escapeHtml(price)}</div>
      </div>
    </div>
  </div>
  <script>
    JsBarcode("#bc", ${JSON.stringify(numberStr)}, {
      format: "CODE128", displayValue: false,
      margin: 0, height: 34, width: 1.6
    });
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