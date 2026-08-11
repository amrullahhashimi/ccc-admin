import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { money, sales as salesApi, type Customer, type Sale } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "ETRANSFER", label: "E-transfer" },
  { value: "OTHER", label: "Other" },
];

const custName = (c?: Customer | null) => (c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() : "—");
const centsFromDollars = (v: string) => Math.round(parseFloat(v || "0") * 100) || 0;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "bg-success-50 text-success-600 dark:bg-success-500/15",
    OPEN: "bg-warning-50 text-warning-600 dark:bg-warning-500/15",
    VOID: "bg-gray-100 text-gray-500 dark:bg-white/10",
    REFUNDED: "bg-gray-100 text-gray-500 dark:bg-white/10",
  };
  const label = status === "OPEN" ? "Balance due" : status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{label}</span>;
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pay, setPay] = useState({ method: "CASH", amount: "" });
  const [busy, setBusy] = useState(false);
  const [carding, setCarding] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setSale(await salesApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this sale.");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;
  if (error || !sale) return <p className="p-10 text-center text-sm text-error-500">{error || "Not found."}</p>;

  const paid = (sale.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
  const balance = sale.totalCents - paid;

  const addPayment = async () => {
    const amountCents = centsFromDollars(pay.amount);
    if (amountCents === 0) return setError("Enter a payment amount.");
    setError("");
    setBusy(true);
    try {
      setSale(await salesApi.addPayment(sale.id, { amountCents, method: pay.method }));
      setPay({ method: "CASH", amount: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add payment.");
    }
    setBusy(false);
  };

  const payByCard = async () => {
    setError("");
    setCarding(true);
    try {
      setSale(await salesApi.cloverPay(sale.id, { amountCents: balance }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card payment failed.");
    }
    setCarding(false);
  };

  const voidSale = async () => {
    if (!confirm(`Void sale #${sale.number}? Stock will be returned and this can't be undone.`)) return;
    setBusy(true);
    try {
      await salesApi.void(sale.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not void.");
    }
    setBusy(false);
  };

  const printReceipt = () => {
    const win = window.open("", "_blank", "width=420,height=640");
    if (!win) return alert("Allow pop-ups to print the receipt.");
    const rows = (sale.items ?? [])
      .map((i) => `<tr><td>${escapeHtml(i.name)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</td><td style="text-align:right">${money(i.unitPriceCents * i.quantity)}</td></tr>`)
      .join("");
    const payRows = (sale.payments ?? [])
      .map((p) => `<tr><td>${escapeHtml(p.method)}</td><td style="text-align:right">${money(p.amountCents)}</td></tr>`)
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Receipt #${sale.number}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;padding:12px;max-width:320px;margin:0 auto}h1{font-size:15px;margin:0 0 2px}.muted{color:#666;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:2px 0}.line{border-top:1px dashed #999;margin:8px 0}.tot td{font-weight:bold}</style></head><body>
  <h1>Canadian Cellular Communications</h1>
  <div class="muted">${escapeHtml(sale.location?.name ?? "")}</div>
  <div class="muted">Sale #${sale.number} · ${new Date(sale.createdAt).toLocaleString()}</div>
  <div class="muted">Customer: ${escapeHtml(custName(sale.customer))}</div>
  <div class="line"></div><table>${rows}</table><div class="line"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${money(sale.subtotalCents)}</td></tr>
    <tr><td>GST (5%)</td><td style="text-align:right">${money(sale.taxCents)}</td></tr>
    <tr class="tot"><td>Total</td><td style="text-align:right">${money(sale.totalCents)}</td></tr>
  </table><div class="line"></div>
  <table>${payRows}
    <tr><td>Paid</td><td style="text-align:right">${money(paid)}</td></tr>
    <tr class="tot"><td>Balance</td><td style="text-align:right">${money(balance)}</td></tr>
  </table><div class="line"></div>
  <div class="muted" style="text-align:center">Thank you!</div>
  <script>window.onafterprint=()=>window.close();setTimeout(()=>{window.focus();window.print();},250);</script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back to sales">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Sale #{sale.number}</h1>
            {statusBadge(sale.status)}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={printReceipt} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Print receipt</button>
          {sale.status !== "VOID" && can("OWNER", "MANAGER") && (
            <button onClick={voidSale} disabled={busy} className="rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 hover:bg-error-50 disabled:opacity-60 dark:hover:bg-error-500/10">Void</button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Items</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800">
                  <tr><th className="px-5 py-3">Item</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Price</th><th className="px-5 py-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(sale.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{i.name}</td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{i.quantity}</td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(i.unitPriceCents)}</td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">{money(i.unitPriceCents * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Payments</h2></div>
            <div className="p-6">
              {(sale.payments ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No payments recorded.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(sale.payments ?? []).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{PAY_METHODS.find((m) => m.value === p.method)?.label ?? p.method}<span className="ml-2 text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span></span>
                      <span className="tabular-nums text-gray-800 dark:text-white/90">{money(p.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              {balance > 0 && sale.status !== "VOID" && (
                <div className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))} className="h-10 rounded-md border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                    {PAY_METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                  </select>
                  <input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} placeholder={(balance / 100).toFixed(2)} className="h-10 w-32 rounded-md border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-700" />
                  <button onClick={addPayment} disabled={busy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">Add payment</button>
                </div>
              )}

              {balance > 0 && sale.status !== "VOID" && (
                <button onClick={payByCard} disabled={carding} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500 px-4 py-2.5 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-60 dark:hover:bg-brand-500/10">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                  {carding ? "Waiting for card…" : `Pay ${money(balance)} by card (Clover)`}
                </button>
              )}
              {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Customer</h3></div>
            <div className="p-5 text-sm">
              <p className="font-medium text-gray-800 dark:text-white/90">{custName(sale.customer)}</p>
              <p className="text-gray-500">{sale.customer?.phone || sale.customer?.mobile || "No phone"}</p>
              {sale.location?.name && <p className="mt-3 text-xs text-gray-500">{sale.location.name}</p>}
              {sale.user?.name && <p className="text-xs text-gray-500">Sold by {sale.user.name}</p>}
              <p className="text-xs text-gray-500">{new Date(sale.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Summary</h3></div>
            <div className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(sale.subtotalCents)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GST (5%)</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(sale.taxCents)}</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold dark:border-gray-800"><span className="text-gray-800 dark:text-white/90">Total</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(sale.totalCents)}</span></div>
              <div className="flex justify-between pt-1"><span className="text-gray-500">Paid</span><span className="tabular-nums text-gray-800 dark:text-white/90">{money(paid)}</span></div>
              <div className="flex justify-between font-medium"><span className={balance > 0 ? "text-warning-600" : "text-success-600"}>{balance > 0 ? "Balance due" : "Settled"}</span><span className="tabular-nums">{money(Math.max(0, balance))}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}