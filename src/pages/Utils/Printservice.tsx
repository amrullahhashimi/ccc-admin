import type { Service } from "../../lib/api";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const money = (c?: number | null) => (c == null ? "$0.00" : "$" + (c / 100).toFixed(2));

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const deviceOf = (s: Service) => [s.deviceMake, s.deviceModel].filter(Boolean).join(" ") || "—";
const customerOf = (s: Service) =>
  s.customer ? [s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ") : "—";
const phoneOf = (s: Service) => s.customer?.phone || s.customer?.mobile || "—";

// Open a print window, write HTML, print, and close.
function printHtml(html: string) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) { alert("Please allow pop-ups to print."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the browser a moment to lay out (and load the QR image) before printing.
  setTimeout(() => { w.print(); }, 400);
}

/* ------------------------------- TAG (DYMO 1.125" x 3.5") ------------------------------- */
export function printTag(s: Service) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tag ${esc(s.number)}</title>
  <style>
    @page { size: 3.5in 1.125in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .tag { width: 3.5in; height: 1.125in; padding: 0.06in 0.1in; font-family: Arial, sans-serif; color: #000; overflow: hidden; }
    .row { display: flex; justify-content: space-between; align-items: baseline; }
    .num { font-size: 13pt; font-weight: 700; }
    .phone { font-size: 10pt; font-weight: 700; }
    .device { font-size: 10pt; font-weight: 600; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .problem { font-size: 8pt; margin-top: 2px; line-height: 1.15; max-height: 0.42in; overflow: hidden; }
    .lbl { font-size: 6pt; color: #444; text-transform: uppercase; letter-spacing: .04em; }
  </style></head>
  <body>
    <div class="tag">
      <div class="row"><span class="num">#${esc(s.number)}</span><span class="phone">${esc(phoneOf(s))}</span></div>
      <div class="device">${esc(deviceOf(s))}</div>
      <div class="lbl">Problem</div>
      <div class="problem">${esc(s.issue || "—")}</div>
    </div>
  </body></html>`;
  printHtml(html);
}

/* ------------------------------- INVOICE (A4) ------------------------------- */
export function printInvoice(s: Service, opts?: { trackUrl?: string; storeName?: string }) {
  const storeName = opts?.storeName ?? "Canadian Cellular Communication";
  const parts = (s.parts ?? []).map((l) => ({
    name: l.name, qty: l.quantity, each: l.priceCents, total: l.quantity * l.priceCents,
  }));
  const subtotal = s.totalCents ?? 0;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;
  const deposit = s.depositCents ?? 0;
  const balance = total - deposit;

  const qr = opts?.trackUrl
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(opts.trackUrl)}" width="120" height="120" alt="Track" />`
    : "";

  const rows = parts.length
    ? parts.map((p) => `<tr>
        <td>${esc(p.name)}</td>
        <td class="c">${esc(p.qty)}</td>
        <td class="r">${money(p.each)}</td>
        <td class="r">${money(p.total)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="muted">No items yet.</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(s.number)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; }
    .store { font-size: 20px; font-weight: 800; letter-spacing: -.2px; }
    .sub { color: #666; font-size: 11px; margin-top: 2px; }
    .title { text-align: right; }
    .title h1 { margin: 0; font-size: 22px; letter-spacing: 2px; color: #111; }
    .title .no { color: #666; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .meta h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #999; margin: 0 0 4px; }
    .meta p { margin: 0; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #888; border-bottom: 1px solid #ddd; padding: 8px 6px; }
    td { padding: 9px 6px; border-bottom: 1px solid #f0f0f0; }
    td.c, th.c { text-align: center; }
    td.r, th.r { text-align: right; }
    .muted { color: #999; text-align: center; padding: 18px; }
    .totals { width: 260px; margin-left: auto; }
    .totals .line { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 10px; font-size: 15px; font-weight: 800; }
    .foot { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .track { text-align: center; font-size: 10px; color: #666; }
    .track .lbl { margin-bottom: 6px; }
    .thanks { color: #888; font-size: 11px; }
  </style></head>
  <body>
    <div class="head">
      <div>
        <div class="store">${esc(storeName)}</div>
        <div class="sub">Cellphone Sales &amp; Repair</div>
      </div>
      <div class="title">
        <h1>INVOICE</h1>
        <div class="no">Service #${esc(s.number)}</div>
      </div>
    </div>

    <div class="meta">
      <div>
        <h3>Customer</h3>
        <p>${esc(customerOf(s))}<br>${esc(phoneOf(s))}</p>
      </div>
      <div>
        <h3>Device</h3>
        <p>${esc(deviceOf(s))}${s.deviceImei ? "<br>IMEI: " + esc(s.deviceImei) : ""}${s.warranty ? "<br>Under warranty" : ""}</p>
      </div>
      <div>
        <h3>Dates</h3>
        <p>In: ${esc(fmt(s.dateIn))}<br>Due: ${esc(fmt(s.promisedAt))}</p>
      </div>
    </div>

    <table>
      <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="line"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="line"><span>GST (5%)</span><span>${money(gst)}</span></div>
      <div class="line"><span>Total</span><span>${money(total)}</span></div>
      ${deposit > 0 ? `<div class="line"><span>Deposit paid</span><span>-${money(deposit)}</span></div>` : ""}
      <div class="line grand"><span>Balance due</span><span>${money(balance)}</span></div>
    </div>

    <div class="foot">
      <div class="thanks">Thank you for choosing ${esc(storeName)}.</div>
      ${qr ? `<div class="track"><div class="lbl">Track your repair</div>${qr}</div>` : ""}
    </div>
  </body></html>`;
  printHtml(html);
}