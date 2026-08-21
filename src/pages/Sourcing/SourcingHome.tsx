import { useEffect, useState } from "react";
import { Link } from "react-router";

import { sourcing, vendorMoney, type SourcingDashboard } from "../../lib/api";
import { Empty, Loading, Panel, Stat } from "./parts";
import { primaryButton, whenLabel } from "./ui";

/**
 * Where a buyer starts: what the catalogue knows, where the money is, and what
 * has moved since they last looked.
 */
export default function SourcingHome() {
  const [data, setData] = useState<SourcingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    sourcing
      .dashboard(1)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <p className="p-10 text-center text-sm text-error-500">{error}</p>;
  if (!data) return null;

  const { totals, bestDeals, recentChanges, recentMessages } = data;

  return (
    <div className="space-y-5">

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Vendors" value={totals.vendors} hint="quoting prices" />
        <Stat label="Products" value={totals.products} hint="in the price catalogue" />
        <Stat label="Active offers" value={totals.offers} hint="across all quantity tiers" />
        <Stat label="Comparable" value={totals.multiVendorProducts} hint="quoted by two or more vendors" />
        <Stat label="Messages" value={totals.messages} hint="imported to date" />
      </div>

      {/* ------------------------------ best deals ------------------------------ */}
      <Panel
        title="Best deals"
        padded={false}
        action={
          <Link to="/sourcing/comparison" className="text-sm font-medium text-brand-500 hover:underline">
            Full comparison
          </Link>
        }
      >
        {bestDeals.length === 0 ? (
          <Empty
            title="Nothing to compare yet"
            message="Once two vendors quote the same product, the saving between them shows up here."
            action={
              <Link to="/sourcing/import" className={primaryButton}>
                Import a message
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Cheapest vendor</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Saving</th>
                  <th className="px-5 py-3 text-right">Vendors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {bestDeals.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="max-w-sm px-5 py-3">
                      <Link to={`/sourcing/products/${row.id}`} className="text-sm font-medium text-brand-500 hover:underline">
                        {row.normalizedName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.tied ? "Tied" : row.bestVendor?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-semibold tabular-nums text-success-600 dark:text-success-400">
                      {vendorMoney(row.lowestCents, row.currency)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {row.savingsCents == null ? "—" : `$${(row.savingsCents / 100).toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{row.vendorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* --------------------------- price movement --------------------------- */}
        <Panel title="Recently updated prices" padded={false}>
          {recentChanges.length === 0 ? (
            <Empty title="No price changes yet" message="A change is recorded when a vendor re-quotes a product." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentChanges.map((change) => {
                const down = change.newPriceCents < change.oldPriceCents;
                return (
                  <li key={change.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        to={`/sourcing/products/${change.product?.id ?? ""}`}
                        className="block truncate text-sm font-medium text-brand-500 hover:underline"
                      >
                        {change.product?.normalizedName ?? "Product"}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {change.vendor?.name ?? "—"} · {whenLabel(change.changedAt)}
                        {change.minQuantity > 1 ? ` · ${change.minQuantity}+` : ""}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm tabular-nums">
                      <span className="text-gray-400 line-through">{vendorMoney(change.oldPriceCents)}</span>{" "}
                      <span className={down ? "font-medium text-success-600 dark:text-success-400" : "font-medium text-error-500"}>
                        {down ? "▾" : "▴"} {vendorMoney(change.newPriceCents)}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ----------------------------- what came in ----------------------------- */}
        <Panel
          title="Recent vendor messages"
          padded={false}
          action={
            <Link to="/sourcing/history" className="text-sm font-medium text-brand-500 hover:underline">
              Import history
            </Link>
          }
        >
          {recentMessages.length === 0 ? (
            <Empty
              title="No messages imported yet"
              message="Paste a vendor's price list to get started."
              action={
                <Link to="/sourcing/import" className={primaryButton}>
                  Import vendor message
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentMessages.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{m.vendor.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{whenLabel(m.receivedAt)}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {m.itemCount} {m.itemCount === 1 ? "product" : "products"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
