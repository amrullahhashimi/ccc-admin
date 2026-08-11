import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { money, sales as salesApi, type Sale } from "../../lib/api";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const STATUSES = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Unpaid" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "bg-success-50 text-success-600 dark:bg-success-500/15",
    OPEN: "bg-warning-50 text-warning-600 dark:bg-warning-500/15",
    VOID: "bg-gray-100 text-gray-500 dark:bg-white/10",
    REFUNDED: "bg-gray-100 text-gray-500 dark:bg-white/10",
  };
  const label = status === "OPEN" ? "Balance due" : status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{label}</span>;
}

const custName = (c?: Sale["customer"]) =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() : "—";

export default function SalesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<Sale[]>([]);
  const [q, setQ] = useState("");
  // Starting filter can come from the URL (e.g. the "Unpaid" tile → ?status=OPEN).
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [loading, setLoading] = useState(true);

  const timer = useRef<number | null>(null);
  useEffect(() => {
    setLoading(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setRows(await salesApi.list({ q: q.trim() || undefined, status: status || undefined }));
      } catch { /* ignore */ }
      setLoading(false);
    }, 250);
  }, [q, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back to sales">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Sales</h1>
        </div>
        <button onClick={() => navigate("/sales/new")} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">New sale</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className={`${inputClass} sm:max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by sale #, customer, phone…" />
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button key={s.value} onClick={() => setStatus(s.value)} className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${status === s.value ? "bg-brand-500 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className={panelClass}>
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">No sales found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3">Sale #</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/sales/${s.id}`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">#{s.number}</td>
                    <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{custName(s.customer)}</td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{s._count?.items ?? "—"}</td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">{money(s.totalCents)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {statusBadge(s.status)}
                        {s.source === "CLOVER" && (
                          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">Clover</span>
                        )}
                        {s.needsReview && (
                          <span className="rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/15 dark:text-error-400">Needs review</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}