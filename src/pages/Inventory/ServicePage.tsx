import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { service as serviceApi, SERVICE_STATUSES, money, type Service } from "../../lib/api";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const statusLabel = (v: string) => SERVICE_STATUSES.find((s) => s.value === v)?.label ?? v;

const statusColour = (v: string) => {
  switch (v) {
    case "INTAKE": return "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400";
    case "DIAGNOSING": return "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400";
    case "WAITING_PARTS": return "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400";
    case "READY": return "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400";
    case "COLLECTED": return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
    case "CANCELLED": return "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400";
    default: return "bg-gray-100 text-gray-500";
  }
};

export default function ServicePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  // Start from the URL (?status=COLLECTED for the Finished tile), then let the user change it.
  const [status, setStatus] = useState(params.get("status") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await serviceApi.list({ q, status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load service orders.");
    }
    setLoading(false);
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const deviceLine = (s: Service) => [s.deviceMake, s.deviceModel].filter(Boolean).join(" ") || "—";
  const customerName = (s: Service) =>
    s.customer ? [s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ") : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back to service">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Service orders</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{rows.length} {rows.length === 1 ? "order" : "orders"}</p>
          </div>
        </div>
        <button onClick={() => navigate("/service/new")} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
          New service
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className={`${inputClass} flex-1 min-w-[220px]`} placeholder="Search number, device, customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {SERVICE_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">{q || status ? "Nothing matches" : "No service orders yet"}</p>
            <p className="mt-1 text-sm text-gray-500">{q || status ? "Try a different search or status." : "Create one when a customer drops off a device."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Issue</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/service/${s.id}`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 text-sm font-semibold tabular-nums text-brand-500">{s.number}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800 dark:text-white/90">{customerName(s)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{deviceLine(s)}</td>
                    <td className="max-w-xs truncate px-5 py-3.5 text-sm text-gray-500">{s.issue}</td>
                    <td className="px-5 py-3.5"><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusColour(s.status)}`}>{statusLabel(s.status)}</span></td>
                    <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">{money(s.totalCents ?? 0)}</td>
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