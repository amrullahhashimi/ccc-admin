import type { Service } from "../../lib/api";

/* ─────────────── store details — edit these ─────────────── */
const STORE_NAME = "Canadian Cellular Communication";
const WEBSITE = "www.caceco.ca";
// Per-location contact. Keys are matched (lowercase) against the order's location name.
const LOCATIONS: Record<string, { address: string; phone: string }> = {
  glendale:  { address: "3931 17 Ave SW, Calgary, AB T3E 7E7",   phone: "(403) 436-6565" },
  chinatown: { address: "132 3 Ave SE #2, Calgary, AB T2G 0B6",  phone: "(403) 439-6565" },
};
// Logo served from your public folder (Vite serves /public at the web root).
const LOGO_PATH = "/images/logo/logo.svg";
/* ────────────────────────────────────────────────────────── */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const money = (c?: number | null) => (c == null ? "$0.00" : "$" + (c / 100).toFixed(2));

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const deviceOf = (s: Service) => [s.deviceMake, s.deviceModel].filter(Boolean).join(" ") || "—";
const customerOf = (s: Service) =>
  s.customer ? [s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ") : "—";
const phoneOf = (s: Service) => s.customer?.phone || s.customer?.mobile || "—";

function printHtml(html: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Please allow pop-ups to print."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600); // allow logo + QR to load
}

/* ───────────────── TAG (DYMO 3.5" x 1.125") ───────────────── */
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

/* ───────────────────────── INVOICE (A4, one page) ───────────────────────── */
export function printInvoice(s: Service, opts?: { trackUrl?: string; storeName?: string }) {
  const storeName = opts?.storeName ?? STORE_NAME;

  const locName = (typeof s.location === "string" ? s.location : s.location?.name ?? "").toLowerCase();
  const key = Object.keys(LOCATIONS).find((k) => locName.includes(k));
  const loc = key ? LOCATIONS[key] : null;

  const parts = (s.parts ?? []).map((l) => ({
    name: l.name, qty: l.quantity, each: l.priceCents, total: l.quantity * l.priceCents,
  }));
  const subtotal = s.totalCents ?? 0;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;
  const deposit = s.depositCents ?? 0;
  const balance = total - deposit;

  const origin = window.location.origin;
  const qr = opts?.trackUrl
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(opts.trackUrl)}" alt="Track" />`
    : "";

  const rows = parts.length
    ? parts.map((p) => `<tr>
        <td>${esc(p.name)}</td>
        <td class="c">${esc(p.qty)}</td>
        <td class="r">${money(p.each)}</td>
        <td class="r">${money(p.total)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="muted">No items yet.</td></tr>`;

  const signature = s.signatureData
    ? `<img src="${s.signatureData}" alt="Signature" style="height:44px;width:150px;object-fit:contain;object-position:left bottom;display:block;" />`
    : `<div style="height:44px;"></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(s.number)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.3; margin: 0; }

    /* header: logo + contact on the left, INVOICE + QR on the right */
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
            border-bottom: 2.5px solid #c8102e; padding-bottom: 10px; margin-bottom: 12px; }
    .brand img { height: 62px; display: block; margin-bottom: 6px; }
    .brand .contact { font-size: 12px; color: #444; line-height: 1.5; }
    .brand .contact strong { color: #111; }
    .invblock { display: flex; align-items: flex-start; gap: 14px; }
    .invtext { text-align: right; }
    .invtext h1 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #c8102e; font-weight: 800; }
    .invtext .no { font-size: 15px; font-weight: 700; color: #111; margin-top: 2px; }
    .invtext .sm { font-size: 11px; color: #777; margin-top: 4px; }
    .qr { text-align: center; }
    .qr img { width: 78px; height: 78px; display: block; }
    .qr span { display: block; font-size: 8.5px; color: #777; margin-top: 2px; }

    /* meta strip */
    .meta { display: flex; gap: 16px; margin-bottom: 10px; }
    .meta > div { flex: 1; background: #f7f7f8; border-radius: 4px; padding: 8px 10px; }
    .meta h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #999; margin: 0 0 3px; }
    .meta p { margin: 0; font-size: 13px; line-height: 1.45; }

    /* items */
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #888;
         border-bottom: 1.5px solid #333; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #eee; font-size: 13px; }
    td.c, th.c { text-align: center; }
    td.r, th.r { text-align: right; }
    .muted { color: #999; text-align: center; padding: 12px; }

    /* totals */
    .totals { width: 250px; margin-left: auto; font-size: 13px; }
    .totals .line { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals .grand { border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; font-size: 16px; font-weight: 800; }

    /* terms */
    .terms { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; }
    .terms h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #666; margin: 0 0 4px; }
    .terms ol { margin: 0; padding-left: 15px; }
    .terms li { font-size: 9px; line-height: 1.3; color: #333; margin-bottom: 1px; }
    .agree { font-size: 10.5px; font-weight: 700; margin: 7px 0 4px; color: #111; }

    /* signature */
    .signrow { display: flex; gap: 40px; align-items: flex-end; }
    .sigbox { width: 200px; border-bottom: 1px solid #333; }
    .datebox { width: 150px; border-bottom: 1px solid #333; height: 44px; display: flex; align-items: flex-end;
               padding-bottom: 2px; font-size: 11px; }
    .cap { font-size: 9.5px; color: #666; margin-top: 3px; }
    .foot { margin-top: 8px; text-align: center; font-size: 9.5px; color: #999; }
  </style></head>
  <body>

    <div class="head">
      <div class="brand">
        <img src="${origin}${LOGO_PATH}" alt="${esc(storeName)}" />
        <div class="contact">
          ${loc ? `<strong>${esc(loc.address)}</strong><br>${esc(loc.phone)} &nbsp;·&nbsp; ${esc(WEBSITE)}` : esc(WEBSITE)}
        </div>
      </div>
      <div class="invblock">
        ${qr ? `<div class="qr">${qr}<span>Track repair</span></div>` : ""}
        <div class="invtext">
          <h1>INVOICE</h1>
          <div class="no">Service #${esc(s.number)}</div>
          ${s.warranty ? `<div class="sm">Under warranty</div>` : ""}
        </div>
      </div>
    </div>

    <div class="meta">
      <div>
        <h3>Customer</h3>
        <p><strong>${esc(customerOf(s))}</strong><br>${esc(phoneOf(s))}</p>
      </div>
      <div>
        <h3>Device</h3>
        <p><strong>${esc(deviceOf(s))}</strong>${s.deviceImei ? `<br>IMEI: ${esc(s.deviceImei)}` : ""}</p>
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
        <div>
          <div class="sigbox">${signature}</div>
          <div class="cap">Customer signature</div>
        </div>
        <div>
          <div class="datebox">${s.signedAt ? esc(new Date(s.signedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })) : ""}</div>
          <div class="cap">Date &amp; time signed</div>
        </div>
      </div>
    </div>

    <div class="foot">Thank you for choosing ${esc(storeName)} &nbsp;·&nbsp; ${esc(WEBSITE)}</div>
  </body></html>`;
  printHtml(html);
}