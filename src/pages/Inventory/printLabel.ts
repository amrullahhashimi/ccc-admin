import { conditionLabel, type Product, type ProductUnit } from "../../lib/api";

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
export function printUnitLabel(product: Product, unit: ProductUnit) {
  const topLine = [product.name, unit.storage, conditionLabel(unit.condition), unit.note]
    .filter(Boolean)
    .join(" · ");
  // Prefer the vendor recorded on this specific unit; fall back to the product's default.
  const vendorName = unit.vendor?.name ?? product.vendor?.name ?? null;
  const code = buildCode(vendorName, unit.labelCostCents, new Date(unit.createdAt));
  const salePrice = product.salePriceCents != null ? "$" + (product.salePriceCents / 100).toFixed(2) : "";
  const win = window.open("", "_blank", "width=520,height=240");
  if (!win) {
    alert("Allow pop-ups for this site to print labels.");
    return;
  }

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Label ${escapeHtml(unit.serial)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
    @page { size: 3.5in 1.125in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
        width: 3.5in; height: 1.125in;
        box-sizing: border-box; padding: 0.05in calc(0.12in + 3px);
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

/**
 * Data a service label needs. Map your ticket into this before calling
 * printServiceLabel — that keeps this function independent of the exact
 * Ticket/TicketPart shape.
 *
 *   serviceNumber : the auto-incrementing service number (e.g. 1001)
 *   customerName  : usually `${firstName} ${lastName}`.trim()
 *   passcode      : device passcode / unlock PIN (optional)
 *   totalCents    : full service total in cents (parts + labour) (optional)
 */
export interface ServiceLabelData {
  serviceNumber: number | string;
  customerName: string;
  passcode?: string | null;
  totalCents?: number | null;
}

/**
 * A single 3.5" x 1.125" service label, three rows:
 *   1. customer name
 *   2. barcode of the service number, with "#1001" as text under it
 *   3. passcode (left) and total price (right)
 */
export function printServiceLabel(data: ServiceLabelData) {
  const numberStr = String(data.serviceNumber);
  const total = data.totalCents != null ? "$" + (data.totalCents / 100).toFixed(2) : "";
  const passcode = data.passcode ? "PIN " + data.passcode : "";

  const win = window.open("", "_blank", "width=520,height=240");
  if (!win) {
    alert("Allow pop-ups for this site to print labels.");
    return;
  }

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Service ${escapeHtml(numberStr)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
    @page { size: 3.5in 1.125in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
        width: 3.5in; height: 1.125in;
        box-sizing: border-box; padding: 0.05in calc(0.12in + 3px);
        display: flex; flex-direction: column;
        align-items: center; justify-content: space-between;
        text-align: center;
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
    }
    .top { font-size: 8pt; font-weight: 700; line-height: 1.1;
        width: 100%; height: 0.16in; overflow: hidden;
        white-space: nowrap; text-overflow: ellipsis; }
    .barcode { display: flex; flex-direction: column; align-items: center;
        width: 100%; height: 0.62in; }
    svg { width: 100%; height: 100%; }
    .serial { font-size: 7pt; font-weight: 700; letter-spacing: 0.4px; line-height: 1; margin-top: 2px; }
    .bottom { display: flex; align-items: baseline; justify-content: space-between;
        width: 100%; }
    .code { font-size: 11pt; font-weight: 700; line-height: 1; }
    .price { font-size: 13pt; font-weight: 700; line-height: 1; }
</style>
</head>
<body>
  <div class="label">
    <div class="top">${escapeHtml(data.customerName)}</div>
    <div class="barcode">
      <svg id="bc"></svg>
      <div class="serial">#${escapeHtml(numberStr)}</div>
    </div>
    <div class="bottom">
      <span class="code">${escapeHtml(passcode)}</span>
      <span class="price">${escapeHtml(total)}</span>
    </div>
  </div>
  <script>
    JsBarcode("#bc", ${JSON.stringify(numberStr)}, {
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}