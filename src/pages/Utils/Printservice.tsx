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

// Open a print window, write HTML, print.
function printHtml(html: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Please allow pop-ups to print."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

/* ------------------------- TAG (DYMO 3.5" x 1.125") ------------------------- */
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

  // Show only the address of the location this order is assigned to.
  const ADDRESSES: Record<string, string> = {
    glendale: "3931 17 Ave SW, Calgary, AB T3E 7E7",
    chinatown: "132 3 Ave SE #2, Calgary, AB T2G 0B6",
  };
  const locName = (typeof s.location === "string" ? s.location : s.location?.name ?? "").toLowerCase();
  const addrKey = Object.keys(ADDRESSES).find((k) => locName.includes(k));
  const storeAddress = addrKey ? ADDRESSES[addrKey] : "";

  const parts = (s.parts ?? []).map((l) => ({
    name: l.name, qty: l.quantity, each: l.priceCents, total: l.quantity * l.priceCents,
  }));
  const subtotal = s.totalCents ?? 0;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;
  const deposit = s.depositCents ?? 0;
  const balance = total - deposit;

  const qr = opts?.trackUrl
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(opts.trackUrl)}" width="150" height="150" alt="Track" />`
    : "";

  const rows = parts.length
    ? parts.map((p) => `<tr>
        <td>${esc(p.name)}</td>
        <td class="c">${esc(p.qty)}</td>
        <td class="r">${money(p.each)}</td>
        <td class="r">${money(p.total)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="muted">No items yet.</td></tr>`;

  // Signature: inline-styled so nothing can override it. Small (85x21-ish box),
  // sitting on the same line as the date.
  const signatureBlock = s.signatureData
    ? `<img src="${s.signatureData}" alt="Signature" style="height:42px;width:110px;object-fit:contain;object-position:left bottom;display:inline-block;vertical-align:bottom;border-bottom:1px solid #333;" />`
    : `<span style="display:inline-block;width:180px;border-bottom:1px solid #333;height:24px;vertical-align:bottom;"></span>`;

  const dateBlock = `<span style="display:inline-block;width:120px;border-bottom:1px solid #333;height:24px;vertical-align:bottom;text-align:center;font-size:14px;">${s.signedAt ? esc(new Date(s.signedAt).toLocaleDateString()) : ""}</span>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(s.number)}</title>
  <style>
    @page { size: A4 portrait; margin: 7mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 16px; line-height: 1.35; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
    .store { font-size: 25px; font-weight: 800; letter-spacing: -.2px; }
    .sub { color: #666; font-size: 15px; margin-top: 2px; }
    .addr { color: #444; font-size: 15px; margin-top: 3px; }
    .title { text-align: right; }
    .title h1 { margin: 0; font-size: 26px; letter-spacing: 2px; color: #111; }
    .title .no { color: #666; margin-top: 4px; font-size: 16px; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 12px; }
    .meta h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #999; margin: 0 0 4px; }
    .meta p { margin: 0; line-height: 1.5; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #888; border-bottom: 1px solid #ddd; padding: 6px; }
    td { padding: 7px 6px; border-bottom: 1px solid #f0f0f0; font-size: 16px; }
    td.c, th.c { text-align: center; }
    td.r, th.r { text-align: right; }
    .muted { color: #999; text-align: center; padding: 14px; }
    .band { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 10px; }
    .bandleft { text-align: center; font-size: 13px; color: #666; }
    .bandleft .lbl { margin-bottom: 6px; }
    .totals { width: 300px; font-size: 16px; }
    .totals .line { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #111; margin-top: 5px; padding-top: 8px; font-size: 19px; font-weight: 800; }
    .thanks { color: #888; font-size: 13px; margin: 8px 0; }
    .terms { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; }
    .terms h3 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 0 0 5px; }
    .terms ol { margin: 0; padding-left: 18px; }
    .terms li { font-size: 13px; line-height: 1.35; color: #333; margin-bottom: 2px; }
    .agree { font-size: 14px; font-weight: 700; margin: 8px 0 10px; color: #111; }
    .signrow { display: flex; align-items: flex-end; gap: 30px; margin-top: 6px; }
    .signrow .cap { font-size: 13px; color: #666; margin-left: 8px; }
  </style></head>
  <body>
    <div class="head">
      <div>
        <div class="store">${esc(storeName)}</div>
        <div class="sub">Cellphone Sales &amp; Repair</div>
        ${storeAddress ? `<div class="addr">${esc(storeAddress)}</div>` : ""}
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

    <div class="band">
      <div class="bandleft">${qr ? `<div class="lbl">Track your repair</div>${qr}` : ""}</div>
      <div class="totals">
        <div class="line"><span>Subtotal</span><span>${money(subtotal)}</span></div>
        <div class="line"><span>GST (5%)</span><span>${money(gst)}</span></div>
        <div class="line"><span>Total</span><span>${money(total)}</span></div>
        ${deposit > 0 ? `<div class="line"><span>Deposit paid</span><span>-${money(deposit)}</span></div>` : ""}
        <div class="line grand"><span>Balance due</span><span>${money(balance)}</span></div>
      </div>
    </div>

    <div class="thanks">Thank you for choosing ${esc(storeName)}.</div>

    <div class="terms">
      <h3>Terms &amp; Conditions</h3>
      <ol>
        <li>For iPhones 12 and up, iPads, iMacs, MS Surfaces, Google Pixels, Nexus, Huawei, Samsung or any other glued-on devices, we are not responsible and liable for damaged screens and other board issues during the repair.</li>
        <li>Motherboard work is not guaranteed and we are not liable for other damages on the board during the repair.</li>
        <li>The owner has backed up all the important data before handing the device over for inspection or repair.</li>
        <li>Canadian Cellular Communication Inc. management, staff or its agents are not liable for the device&rsquo;s termination (permanently disabled) due to any pre-existing conditions (e.g. water damage, software tampering, or impact damage).</li>
        <li>The owner must be ready to reply and confirm the repair cost via email, voicemail, call or text.</li>
        <li>Repaired or broken devices lose their water-resistant status and are not meant to be submerged even if sealed.</li>
        <li>All repaired devices must be paid for in full within thirty (30) days; otherwise the device will be kept in lieu of payment. There is no exception to this unless prior written consent was given by one of Canadian Cellular Communication employees.</li>
        <li>Canadian Cellular Communication Inc. will provide a thirty (30) day warranty on specific repair work done from the pickup date.</li>
        <li>Canadian Cellular Communication Inc. will hold your device no longer than a period of 6 months or 185 days, after which your device will be recycled, and we will not be responsible for your data or your device.</li>
      </ol>
      <p class="agree">I understand and agree to all terms and conditions mentioned above.</p>

      <div class="signrow">
        <div>${signatureBlock}<span class="cap">Customer signature</span></div>
        <div>${dateBlock}<span class="cap">Date</span></div>
      </div>
    </div>
  </body></html>`;
  printHtml(html);
}