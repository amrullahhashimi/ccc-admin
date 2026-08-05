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
    .terms { margin-top: 12px; padding-top: 10px; border-top: 1px solid #ddd; page-break-inside: avoid; }
    .terms h3 { font-size: 16px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 0 0 6px; }
    .terms ol { margin: 0; padding-left: 16px; }
    .terms li { font-size: 15px; line-height: 1.4; color: #333; margin-bottom: 2px; }
    .terms .agree { font-size: 16px; font-weight: 700; margin: 10px 0 14px; color: #111; }
    .sign { display: flex; gap: 40px; }
    .sigcol:first-child { width: 260px; }
    .sigcol:last-child { width: 160px; }
    .sigline { border-bottom: 1px solid #333; height: 34px; display:flex; align-items:flex-end; padding-bottom:2px; font-size:11px; }
    .sigimg { height: 42px; max-width: 170px; object-fit: contain; object-position: left bottom; border-bottom: 1px solid #333; display:block; }
    .sigcap { font-size: 14px; color: #666; margin-top: 4px; }
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
  const storeAddress =
    Object.keys(ADDRESSES).find((k) => locName.includes(k))
      ? ADDRESSES[Object.keys(ADDRESSES).find((k) => locName.includes(k))!]
      : "";
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
    @page { size: A4 portrait; margin: 7mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.4; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
    .store { font-size: 25px; font-weight: 800; letter-spacing: -.2px; }
    .sub { color: #666; font-size: 15px; margin-top: 2px; }
    .addr { color: #444; font-size: 15px; margin-top: 3px; }
    .title { text-align: right; }
    .title h1 { margin: 0; font-size: 26px; letter-spacing: 2px; color: #111; }
    .title .no { color: #666; margin-top: 4px; font-size: 17px; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 12px; }
    .meta h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #999; margin: 0 0 5px; }
    .meta p { margin: 0; line-height: 1.5; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #888; border-bottom: 1px solid #ddd; padding: 6px 6px; }
    td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; font-size: 19px; }
    td.c, th.c { text-align: center; }
    td.r, th.r { text-align: right; }
    .muted { color: #999; text-align: center; padding: 18px; }
    .totals { width: 320px; margin-left: auto; font-size: 18px; }
    .totals .line { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 10px; font-size: 22px; font-weight: 800; }
    .foot { margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    .track { text-align: center; font-size: 10px; color: #666; }
    .track .lbl { margin-bottom: 6px; }
    .thanks { color: #888; font-size: 14px; }
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
      <div class="sign">
        <div class="sigcol">
          ${s.signatureData ? `<img class="sigimg" src="${s.signatureData}" alt="Signature" />` : `<div class="sigline"></div>`}
          <div class="sigcap">Customer signature</div>
        </div>
        <div class="sigcol">
          <div class="sigline">${s.signedAt ? esc(new Date(s.signedAt).toLocaleDateString()) : ""}</div>
          <div class="sigcap">Date</div>
        </div>
      </div>
    </div>
  </body></html>`;
  printHtml(html);
}