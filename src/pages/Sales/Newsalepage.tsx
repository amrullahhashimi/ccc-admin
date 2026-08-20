import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../context/StoreContext";
import { useNotify } from "../../components/ui/notify";
import {
  customers as customersApi,
  meta as metaApi,
  money,
  products as productsApi,
  saleRef,
  sales as salesApi,
  type Customer,
  type Meta,
  type Product,
  type ProductUnit,
  type Sale,
} from "../../lib/api";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "ETRANSFER", label: "E-transfer" },
  { value: "OTHER", label: "Other" },
];

const GST_RATE = 0.05;
const centsFromDollars = (v: string) => Math.round(parseFloat(v || "0") * 100) || 0;
const custName = (c: Customer) => [c.firstName, c.lastName].filter(Boolean).join(" ").trim();

type Line = {
  key: string;
  productId?: string;
  unitId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  costCents: number;
  taxable: boolean;
  serialized: boolean;
};

type PayRow = { key: string; method: string; amount: string };

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

export default function NewSalePage() {
  const { store } = useStore(); // receipt header comes from Store settings
  const notify = useNotify();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [locationId, setLocationId] = useState("");

  // customer
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custMatches, setCustMatches] = useState<Customer[]>([]);
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCust, setNewCust] = useState({ firstName: "", lastName: "", phone: "" });

  // products
  const [prodQuery, setProdQuery] = useState("");
  const [prodResults, setProdResults] = useState<Product[]>([]);
  const [serialFor, setSerialFor] = useState<{ product: Product; units: ProductUnit[] } | null>(null);

  // lines & payments
  const [lines, setLines] = useState<Line[]>([]);
  const [pays, setPays] = useState<PayRow[]>([{ key: nextKey(), method: "CASH", amount: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Sale | null>(null);

  useEffect(() => {
    metaApi.all().then((m) => {
      setMeta(m);
      if (m.locations[0]) setLocationId(m.locations[0].id);
    }).catch(() => {});
  }, []);

  /* --------------------------- customer search --------------------------- */

  const custTimer = useRef<number | null>(null);
  useEffect(() => {
    if (customer || !custQuery.trim()) { setCustMatches([]); return; }
    if (custTimer.current) window.clearTimeout(custTimer.current);
    custTimer.current = window.setTimeout(async () => {
      try { setCustMatches(await customersApi.list(custQuery.trim())); } catch { /* ignore */ }
    }, 250);
  }, [custQuery, customer]);

  const createCustomer = async () => {
    if (!newCust.firstName.trim()) return setError("New customer needs a first name.");
    setError("");
    try {
      const created = await customersApi.create({
        firstName: newCust.firstName.trim(),
        lastName: newCust.lastName.trim() || undefined,
        phone: newCust.phone.trim() || undefined,
      });
      setCustomer(created);
      setShowNewCust(false);
      setCustQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create customer.");
    }
  };

  /* --------------------------- product search --------------------------- */

  const prodTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!prodQuery.trim()) { setProdResults([]); return; }
    if (prodTimer.current) window.clearTimeout(prodTimer.current);
    prodTimer.current = window.setTimeout(async () => {
      try { setProdResults(await productsApi.list({ q: prodQuery.trim() })); } catch { /* ignore */ }
    }, 250);
  }, [prodQuery]);

  const addProduct = async (p: Product) => {
    setProdQuery("");
    setProdResults([]);
    if (p.tracksSerials) {
      // Need a specific in-stock unit — fetch the full product to get serials.
      try {
        const full = await productsApi.get(p.id);
        const inStock = (full.units ?? []).filter((u) => u.status === "IN_STOCK");
        if (inStock.length === 0) return setError(`${p.name} has no in-stock serials.`);
        setSerialFor({ product: full, units: inStock });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load serials.");
      }
      return;
    }
    pushLine({
      productId: p.id,
      name: p.name,
      quantity: 1,
      unitPriceCents: p.salePriceCents,
      costCents: p.costCents,
      taxable: p.taxable,
      serialized: false,
    });
  };

  const addSerialUnit = (product: Product, unit: ProductUnit) => {
    pushLine({
      productId: product.id,
      unitId: unit.id,
      name: `${product.name} — SN ${unit.serial}`,
      quantity: 1,
      // This serial's own price when it has one, otherwise the product's.
      unitPriceCents: unit.salePriceCents ?? product.salePriceCents,
      costCents: product.costCents,
      taxable: product.taxable,
      serialized: true,
    });
    setSerialFor(null);
  };

  const pushLine = (l: Omit<Line, "key">) => setLines((ls) => [...ls, { ...l, key: nextKey() }]);
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  /* ------------------------------ totals ------------------------------ */

  const { subtotalCents, taxCents, totalCents } = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const taxable = lines.filter((l) => l.taxable).reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const tax = Math.round(taxable * GST_RATE);
    return { subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
  }, [lines]);

  const paidCents = pays.reduce((s, p) => s + centsFromDollars(p.amount), 0);
  const balanceCents = totalCents - paidCents;

  /* ----------------------------- payments ----------------------------- */

  const addPayRow = () => setPays((ps) => [...ps, { key: nextKey(), method: "CASH", amount: "" }]);
  const updatePayRow = (key: string, patch: Partial<PayRow>) =>
    setPays((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePayRow = (key: string) => setPays((ps) => ps.filter((p) => p.key !== key));
  const fillBalance = (key: string) =>
    updatePayRow(key, { amount: (Math.max(0, balanceCents + centsFromDollars(pays.find((p) => p.key === key)?.amount ?? "0")) / 100).toFixed(2) });

  /* ------------------------------ submit ------------------------------ */

  const complete = async () => {
    setError("");
    if (!customer) return setError("Pick or create a customer first.");
    if (lines.length === 0) return setError("Add at least one item.");

    setSubmitting(true);
    try {
      const sale = await salesApi.create({
        customerId: customer.id,
        locationId: locationId || null,
        items: lines.map((l) => ({
          productId: l.productId ?? null,
          unitId: l.unitId ?? null,
          name: l.name,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          costCents: l.costCents,
          taxable: l.taxable,
        })),
        payments: pays
          .filter((p) => centsFromDollars(p.amount) > 0)
          .map((p) => ({ amountCents: centsFromDollars(p.amount), method: p.method })),
      });
      setDone(sale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the sale.");
    }
    setSubmitting(false);
  };

  /* ------------------------------ receipt ------------------------------ */

  const printReceipt = (sale: Sale) => {
    const loc = meta?.locations.find((l) => l.id === sale.locationId);
    const win = window.open("", "_blank", "width=420,height=640");
    if (!win) {
      return notify.warning("Pop-ups are blocked", {
        message: "Allow pop-ups for this site to print the receipt.",
      });
    }
    const rows = (sale.items ?? [])
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</td>` +
          `<td style="text-align:right">${money(i.unitPriceCents * i.quantity)}</td></tr>`
      )
      .join("");
    const payRows = (sale.payments ?? [])
      .map((p) => `<tr><td>${escapeHtml(p.method)}</td><td style="text-align:right">${money(p.amountCents)}</td></tr>`)
      .join("");
    const paid = (sale.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${saleRef(sale)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;padding:12px;max-width:320px;margin:0 auto}
  h1{font-size:15px;margin:0 0 2px}
  .muted{color:#666;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  td{padding:2px 0}
  .line{border-top:1px dashed #999;margin:8px 0}
  .tot td{font-weight:bold}
</style></head><body>
  <h1>${escapeHtml(store?.name ?? "Canadian Cellular Communications")}</h1>
  <div class="muted">${escapeHtml(loc?.name ?? "")}</div>
  <div class="muted">Sale ${saleRef(sale)} · ${new Date(sale.createdAt).toLocaleString()}</div>
  <div class="muted">Customer: ${escapeHtml(custName(sale.customer as Customer) || "—")}</div>
  <div class="line"></div>
  <table>${rows}</table>
  <div class="line"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${money(sale.subtotalCents)}</td></tr>
    <tr><td>GST (5%)</td><td style="text-align:right">${money(sale.taxCents)}</td></tr>
    <tr class="tot"><td>Total</td><td style="text-align:right">${money(sale.totalCents)}</td></tr>
  </table>
  <div class="line"></div>
  <table>${payRows}
    <tr><td>Paid</td><td style="text-align:right">${money(paid)}</td></tr>
    <tr class="tot"><td>Balance</td><td style="text-align:right">${money(sale.totalCents - paid)}</td></tr>
  </table>
  <div class="line"></div>
  <div class="muted" style="text-align:center">Thank you!</div>
  <script>window.onafterprint=()=>window.close();setTimeout(()=>{window.focus();window.print();},250);</script>
</body></html>`);
    win.document.close();
  };

  /* ------------------------------ done view ------------------------------ */

  if (done) {
    const paid = (done.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
    return (
      <div className="mx-auto max-w-md space-y-5 pt-6">
        <div className={`${panelClass} p-8 text-center`}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/15">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">Sale {saleRef(done)} complete</h1>
          <p className="mt-1 text-sm text-gray-500">
            {money(done.totalCents)} total · {money(paid)} paid
            {done.totalCents - paid > 0 && ` · ${money(done.totalCents - paid)} balance`}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => printReceipt(done)} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Print receipt</button>
            <button onClick={() => window.location.reload()} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">New sale</button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ main view ------------------------------ */

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* main */}
        <div className="space-y-5">
          {/* customer */}
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="font-semibold text-gray-800 dark:text-white/90">Customer</h2>
            </div>
            <div className="p-6">
              {customer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{custName(customer)}</p>
                    <p className="text-xs text-gray-500">{customer.phone || customer.mobile || "No phone"}</p>
                  </div>
                  <button onClick={() => setCustomer(null)} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white/90">Change</button>
                </div>
              ) : showNewCust ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div><label className={labelClass}>First name <span className="text-error-500">*</span></label><input className={inputClass} value={newCust.firstName} onChange={(e) => setNewCust((c) => ({ ...c, firstName: e.target.value }))} autoFocus /></div>
                    <div><label className={labelClass}>Last name</label><input className={inputClass} value={newCust.lastName} onChange={(e) => setNewCust((c) => ({ ...c, lastName: e.target.value }))} /></div>
                    <div><label className={labelClass}>Phone</label><input className={inputClass} value={newCust.phone} onChange={(e) => setNewCust((c) => ({ ...c, phone: e.target.value }))} /></div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={createCustomer} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Add customer</button>
                    <button onClick={() => setShowNewCust(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input className={inputClass} value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
                  {custMatches.length > 0 && (
                    <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                      {custMatches.slice(0, 6).map((c) => (
                        <button key={c.id} onClick={() => { setCustomer(c); setCustQuery(""); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <span className="text-sm text-gray-800 dark:text-white/90">{custName(c)}</span>
                          <span className="text-xs text-gray-500">{c.phone || c.mobile || ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowNewCust(true)} className="text-sm font-medium text-brand-500 hover:text-brand-600">+ New customer</button>
                </div>
              )}
            </div>
          </div>

          {/* items */}
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="font-semibold text-gray-800 dark:text-white/90">Items</h2>
            </div>
            <div className="space-y-4 p-6">
              <div className="relative">
                <input className={inputClass} value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} />
                {prodResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
                    {prodResults.slice(0, 8).map((p) => (
                      <button key={p.id} onClick={() => addProduct(p)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <span>
                          <span className="block text-sm text-gray-800 dark:text-white/90">{p.name}</span>
                          <span className="block text-xs text-gray-500">{p.sku} · {p.tracksSerials ? `${p.serialsOnFile} serial(s)` : `${p.quantity} in stock`}</span>
                        </span>
                        <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(p.salePriceCents)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {serialFor && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">Pick a serial for {serialFor.product.name}</p>
                    <button onClick={() => setSerialFor(null)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-white/90">Cancel</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {serialFor.units.map((u) => (
                      <button key={u.id} onClick={() => addSerialUnit(serialFor.product, u)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {u.serial}{u.storage ? ` · ${u.storage}` : ""} · {money(u.salePriceCents ?? serialFor.product.salePriceCents)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No items yet. Search above to add products.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800">
                      <tr><th className="py-2 pr-3">Item</th><th className="px-2 py-2 w-16">Qty</th><th className="px-2 py-2 w-28">Price</th><th className="px-2 py-2 w-24 text-right">Total</th><th /></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {lines.map((l) => (
                        <tr key={l.key}>
                          <td className="py-2 pr-3 text-sm text-gray-800 dark:text-white/90">
                            {l.name}
                            {!l.taxable && <span className="ml-1 text-xs text-gray-400">(no tax)</span>}
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" min={1} disabled={l.serialized} value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="h-9 w-14 rounded-md border border-gray-300 bg-transparent px-2 text-sm disabled:opacity-50 dark:border-gray-700" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" step="0.01" value={(l.unitPriceCents / 100).toFixed(2)} onChange={(e) => updateLine(l.key, { unitPriceCents: centsFromDollars(e.target.value) })} className="h-9 w-24 rounded-md border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-700" />
                          </td>
                          <td className="px-2 py-2 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">{money(l.unitPriceCents * l.quantity)}</td>
                          <td className="py-2 text-right"><button onClick={() => removeLine(l.key)} className="text-xs font-medium text-error-500 hover:text-error-600">Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* sidebar */}
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Summary</h3></div>
            <div className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(subtotalCents)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GST (5%)</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(taxCents)}</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold dark:border-gray-800"><span className="text-gray-800 dark:text-white/90">Total</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(totalCents)}</span></div>
            </div>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Payment</h3></div>
            <div className="space-y-3 p-5">
              {pays.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <select value={p.method} onChange={(e) => updatePayRow(p.key, { method: e.target.value })} className="h-10 rounded-md border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                    {PAY_METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                  </select>
                  <input type="number" step="0.01" value={p.amount} onChange={(e) => updatePayRow(p.key, { amount: e.target.value })} className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-700" />
                  <button onClick={() => fillBalance(p.key)} title="Fill remaining balance" className="shrink-0 rounded-md border border-gray-300 px-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">Bal</button>
                  {pays.length > 1 && <button onClick={() => removePayRow(p.key)} className="shrink-0 text-error-500" aria-label="Remove payment">×</button>}
                </div>
              ))}
              <button onClick={addPayRow} className="text-sm font-medium text-brand-500 hover:text-brand-600">+ Split payment</button>
              <div className="space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(paidCents)}</span></div>
                <div className="flex justify-between font-medium"><span className={balanceCents > 0 ? "text-warning-600" : "text-success-600"}>{balanceCents > 0 ? "Balance due" : balanceCents < 0 ? "Change" : "Settled"}</span><span className="tabular-nums">{money(Math.abs(balanceCents))}</span></div>
              </div>
            </div>
          </div>

          {meta && meta.locations.length > 1 && (
            <div className={panelClass}>
              <div className="p-5">
                <label className={labelClass}>Location</label>
                <select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  {meta.locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>}

          <button onClick={complete} disabled={submitting} className="w-full rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {submitting ? "Completing…" : `Complete sale · ${money(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}