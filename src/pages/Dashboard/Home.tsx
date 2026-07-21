import { useEffect, useState } from "react";
import { Link } from "react-router";
import { conditionLabel, dashboard as dashboardApi, money, type Dashboard } from "../../lib/api";

const panelClass =
  "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

/* --------------------------------- pieces --------------------------------- */

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warning";
  icon: React.ReactNode;
}) {
  return (
    <div className={`${panelClass} p-5`}>
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          tone === "warning"
            ? "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500"
            : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
        }`}
      >
        {icon}
      </div>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-800 dark:text-white/90">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

/** A plain CSS bar — no chart library, nothing to install. */
function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-gray-700 dark:text-gray-300">{label}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
          {value}
          {hint && <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

const icons = {
  box: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  ),
  layers: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
    </svg>
  ),
  wallet: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M16 12h3M3 9h18" />
    </svg>
  ),
  alert: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  ),
};

/* ---------------------------------- page ---------------------------------- */

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .get()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the dashboard."));
  }, []);

  if (error) return <p className="p-10 text-center text-sm text-error-500">{error}</p>;
  if (!data) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;

  const { totals, lowStock, byLocation, byCondition, byCategory, recent } = data;

  const maxCondition = Math.max(...byCondition.map((c) => c.count), 1);
  const maxCategory = Math.max(...byCategory.map((c) => c.units), 1);
  const maxLocation = Math.max(...byLocation.map((l) => l.units), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          What's on the shelves right now.
        </p>
      </div>

      {/* ------------- the four numbers that matter ------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Products"
          value={String(totals.products)}
          sub={`${totals.brands} brands · ${totals.vendors} vendors`}
          icon={icons.box}
        />
        <StatCard
          label="Units in stock"
          value={String(totals.unitsInStock)}
          sub={`${totals.unitsSold} sold · ${totals.unitsReserved} reserved`}
          icon={icons.layers}
        />
        <StatCard
          label="Stock value at cost"
          value={money(totals.stockValueCents)}
          sub={`${money(totals.retailValueCents)} at retail`}
          icon={icons.wallet}
        />
        <StatCard
          label="Needs reordering"
          value={String(totals.lowStockCount)}
          sub={
            totals.lowStockCount === 0
              ? "Everything's above its reorder point"
              : "At or below the reorder point"
          }
          tone={totals.lowStockCount > 0 ? "warning" : undefined}
          icon={icons.alert}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------- low stock ------------- */}
        <div className={`${panelClass} lg:col-span-2`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Running low</h2>
            <Link
              to="/inventory/search"
              className="text-sm font-medium text-brand-500 hover:text-brand-600"
            >
              See all
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              Nothing's below its reorder point. Good place to be.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-2.5">Product</th>
                    <th className="px-5 py-2.5">Brand</th>
                    <th className="px-5 py-2.5 text-right">In stock</th>
                    <th className="px-5 py-2.5 text-right">Reorder at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lowStock.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="max-w-xs truncate px-5 py-2.5">
                        <Link
                          to={`/inventory/items/${p.id}`}
                          className="text-sm font-medium text-brand-500 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="ml-2 text-xs text-gray-400">{p.sku}</span>
                      </td>
                      <td className="px-5 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {p.brand ?? "—"}
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right text-sm font-semibold tabular-nums ${
                          p.quantity <= 0 ? "text-error-500" : "text-warning-500"
                        }`}
                      >
                        {p.quantity}
                      </td>
                      <td className="px-5 py-2.5 text-right text-sm tabular-nums text-gray-500">
                        {p.reorderAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ------------- by store ------------- */}
        <div className={panelClass}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">By store</h2>
          </div>
          <div className="space-y-5 p-5">
            {byLocation.map((l) => (
              <div key={l.id}>
                <Bar label={l.name} value={l.units} max={maxLocation} hint="units" />
                <p className="mt-1 text-xs text-gray-500">{money(l.valueCents)} at cost</p>
              </div>
            ))}
            {byLocation.length === 0 && (
              <p className="text-sm text-gray-500">No stores set up yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------- condition ------------- */}
        <div className={panelClass}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Stock by condition</h2>
          </div>
          <div className="space-y-4 p-5">
            {byCondition.map((c) => (
              <Bar
                key={c.condition}
                label={conditionLabel(c.condition)}
                value={c.count}
                max={maxCondition}
              />
            ))}
            {byCondition.length === 0 && <p className="text-sm text-gray-500">Nothing in stock.</p>}
          </div>
        </div>

        {/* ------------- category ------------- */}
        <div className={panelClass}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Stock by category</h2>
          </div>
          <div className="space-y-4 p-5">
            {byCategory.map((c) => (
              <Bar
                key={c.name}
                label={c.name}
                value={c.units}
                max={maxCategory}
                hint={`/ ${c.products} products`}
              />
            ))}
            {byCategory.length === 0 && <p className="text-sm text-gray-500">No categories yet.</p>}
          </div>
        </div>
      </div>

      {/* ------------- recently added ------------- */}
      <div className={panelClass}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Recently added</h2>
          <Link to="/inventory/new" className="text-sm font-medium text-brand-500 hover:text-brand-600">
            New item
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No products yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-5 py-2.5">Category</th>
                  <th className="px-5 py-2.5 text-right">Sale price</th>
                  <th className="px-5 py-2.5 text-right">In stock</th>
                  <th className="px-5 py-2.5 text-right">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="max-w-xs truncate px-5 py-2.5">
                      <Link
                        to={`/inventory/items/${p.id}`}
                        className="text-sm font-medium text-brand-500 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="ml-2 text-xs text-gray-400">{p.sku}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                      {p.category ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                      {money(p.salePriceCents)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {p.quantity}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-xs text-gray-500">
                      {new Date(p.createdAt).toLocaleDateString()}
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