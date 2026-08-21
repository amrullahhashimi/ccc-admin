import { useCallback, useEffect, useState } from "react";

import { sourcing, vendorMoney, type OnlineLookup, type OnlinePrice } from "../../lib/api";
import { useNotify } from "../../components/ui/notify";
import { Chip, Empty, Panel } from "./parts";
import { ghostButton, whenLabel } from "./ui";

/**
 * What the rest of the market is charging for this product.
 *
 * Two tiers, in order of how much a price can be relied on: Canadian national
 * retail, which anyone can walk in and pay, then the local classified market,
 * which is what somebody is *asking*. The sites that refuse to be read
 * automatically get a search link rather than an invented number.
 *
 * The line that matters is the margin: cheapest retail minus the best price a
 * vendor quotes, which is what the shop stands to make on the box.
 */
export default function OnlinePrices({ productId, productName }: { productId: string; productName: string }) {
  const notify = useNotify();

  const [data, setData] = useState<OnlineLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        setData(await sourcing.online(productId, refresh));
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not search online.");
      }
      setLoading(false);
      setRefreshing(false);
    },
    [productId]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    await load(true);
    notify.success("Searched again", { message: "Prices are as of just now." });
  }

  const retail = data?.results.filter((r) => r.tier === "retail") ?? [];
  const local = data?.results.filter((r) => r.tier === "local") ?? [];
  const margin = data?.margin ?? null;

  return (
    <Panel
      title="Online prices"
      padded={false}
      action={
        <div className="flex items-center gap-3">
          {data?.checkedAt && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Checked {whenLabel(data.checkedAt)}</span>
          )}
          <button className={ghostButton} onClick={refresh} disabled={refreshing || loading}>
            {refreshing ? "Searching…" : "Search again"}
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="p-10 text-center text-sm text-gray-500">Searching Canadian retailers…</p>
      ) : error ? (
        <p className="p-10 text-center text-sm text-error-500">{error}</p>
      ) : (
        <>
          {/* ------------------------------ the margin ------------------------------ */}
          {margin && (
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Best vendor price{" "}
                  <span className="font-semibold text-gray-800 dark:text-white/90">
                    {vendorMoney(margin.vendorPriceCents)}
                  </span>
                  {margin.vendor && <span className="text-gray-500"> from {margin.vendor.name}</span>}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Cheapest online{" "}
                  <span className="font-semibold text-gray-800 dark:text-white/90">
                    {vendorMoney(margin.retailPriceCents)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* --------------------------- national retail --------------------------- */}
          <Section
            title="Canadian retailers"
            rows={retail}
            empty="No Canadian retailer listed this. Try one of the searches below."
          />

          {/* ----------------------------- local market ----------------------------- */}
          <Section
            title="Local market"
            rows={local}
            empty="Nothing listed locally right now."
          />

          {/* ----------------------- the ones that must be opened ----------------------- */}
          {data && data.links.length > 0 && (
            <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Other Resources</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.links.map((link) => (
                  <a
                    key={link.source}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {data && data.failures.length > 0 && (
            <p className="border-t border-gray-200 px-5 py-3 text-xs text-warning-600 dark:border-gray-800 dark:text-warning-400">
              Could not reach {data.failures.map((f) => f.label).join(", ")} on the last search.
            </p>
          )}

          {data && data.results.length === 0 && data.failures.length === 0 && (
            <Empty
              title={`Nothing found for ${productName}`}
              message="The search only keeps listings that clearly match this model, so an odd spelling can come back empty. The links above go straight to each site's own search."
            />
          )}
        </>
      )}
    </Panel>
  );
}

/** One tier of results. Hidden entirely when the whole section is empty. */
function Section({ title, rows, empty }: { title: string; rows: OnlinePrice[]; empty: string }) {
  return (
    <div className="border-t border-gray-200 first:border-t-0 dark:border-gray-800">
      <p className="px-5 pt-4 text-xs font-medium uppercase tracking-wider text-gray-500">{title}</p>

      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{empty}</p>
      ) : (
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row, index) => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="max-w-md px-5 py-3">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-500 hover:underline"
                  >
                    {row.title}
                  </a>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{row.sourceLabel}</span>
                    {row.location && <span>· {row.location}</span>}
                    {row.inStock === false && <Chip tone="warning">Out of stock</Chip>}
                  </p>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <span
                    className={`text-sm tabular-nums ${
                      index === 0
                        ? "font-semibold text-gray-800 dark:text-white/90"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {vendorMoney(row.priceCents, row.currency)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
