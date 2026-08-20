import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { money, products as productsApi, type Product } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

/** Archived items — what the Archive button on an item put out of circulation. */
export default function ArchivedItemsPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = useAuth();
  const mayRestore = can("OWNER", "MANAGER");

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Ids mid-request, so a row can't be restored twice on a double click.
  const [busy, setBusy] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await productsApi.list({ q, archived: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load archived items.");
    }
    setLoading(false);
  }, [q]);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const restore = async (product: Product) => {
    const ok = await notify.confirm({
      title: `Restore ${product.name}?`,
      message: "It goes back into item search and can be sold again.",
      confirmText: "Restore",
      variant: "info",
    });
    if (!ok) return;

    setBusy((ids) => [...ids, product.id]);
    try {
      await productsApi.restore(product.id);
      // Drop it here rather than reloading — this list is archived items only.
      setRows((list) => list.filter((p) => p.id !== product.id));
      notify.success(`${product.name} restored.`);
    } catch (err) {
      notify.error("Could not restore.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
    setBusy((ids) => ids.filter((id) => id !== product.id));
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {rows.length} {rows.length === 1 ? "item" : "items"} out of circulation
      </p>

      <div>
        <label htmlFor="archive-search" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Search archived items
        </label>
        <input
          id="archive-search"
          className={`${inputClass} max-w-md`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">
              {q ? "Nothing matches" : "Nothing is archived"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q
                ? "Try a different search."
                : "Items you archive from their detail page show up here."}
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
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="max-w-md truncate px-4 py-2.5">
                      <button
                        onClick={() => navigate(`/inventory/items/${p.id}`)}
                        className="text-sm font-medium text-brand-500 hover:underline"
                      >
                        {p.name}
                      </button>
                      <span className="ml-2 text-xs text-gray-400">{p.sku}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                      {p.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                      {money(p.salePriceCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                      {p.brand?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                      {p.vendor?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {mayRestore ? (
                        <button
                          onClick={() => restore(p)}
                          disabled={busy.includes(p.id)}
                          className="rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                        >
                          {busy.includes(p.id) ? "Restoring…" : "Restore"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Manager only</span>
                      )}
                    </td>
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
