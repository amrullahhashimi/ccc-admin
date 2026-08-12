import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  CONDITIONS,
  meta as metaApi,
  money,
  products as productsApi,
  type Meta,
  type Product,
} from "../../lib/api";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

/* -------------------------------- the page -------------------------------- */

export default function ItemSearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [location, setLocation] = useState("");
  const [condition, setCondition] = useState("");
  const [lowStock, setLowStock] = useState(false);

  const [rows, setRows] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    metaApi.all().then(setMeta).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await productsApi.list({ q, location, condition, lowStock }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load items.");
    }
    setLoading(false);
  }, [q, location, condition, lowStock]);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Keep the search in the URL so it can be shared or bookmarked.
  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
  }, [q, setParams]);

  const totalUnits = rows.reduce((sum, p) => sum + p.quantity, 0);
  const stockValue = rows.reduce((sum, p) => sum + p.costCents * p.quantity, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/inventory")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
            aria-label="Back to inventory"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Item search</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {rows.length} {rows.length === 1 ? "product" : "products"} · {totalUnits} in stock ·{" "}
              {money(stockValue)} at cost
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/inventory/new")}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          New item
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputClass} min-w-[220px] flex-1`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <select className={`${inputClass} w-auto`} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {meta?.locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">Any condition</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-400">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          Low stock only
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">
              {q || location || condition || lowStock ? "Nothing matches" : "No items yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q || location || condition || lowStock
                ? "Try a different search or clear the filters."
                : "Add your first product to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Sale</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((p) => {
                  const qtyTone =
                    p.quantity <= 0
                      ? "text-error-500"
                      : p.quantity <= p.reorderAt
                        ? "text-warning-500"
                        : "text-gray-800 dark:text-white/90";
                  const categoryLabel = p.category
                    ? p.category.parent
                      ? `${p.category.parent.name} / ${p.category.name}`
                      : p.category.name
                    : "—";

                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/inventory/items/${p.id}`)}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="max-w-md truncate px-4 py-2.5">
                        <span className="text-sm font-medium text-brand-500 hover:underline">
                          {p.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">{p.sku}</span>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${qtyTone}`}>
                        {p.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                        {money(p.salePriceCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {p.brand?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {categoryLabel}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {p.vendor?.name ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
