import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  merchant,
  type CloverSyncReport,
  type CloverSyncStatus,
  type MerchantItem,
  type MerchantInventoryPage as Page,
  type MerchantSummary,
} from "../../lib/api";
import { useNotify } from "../../components/ui/notify";

/**
 * The connected Clover account's inventory, read live.
 *
 * Nothing here is copied into our database — every row is whatever Clover
 * holds at the moment the page asked. That is the point of the tab: it is the
 * merchant account's own view, next to (not merged with) the shop's local
 * inventory, which tracks serials, cost and condition that Clover never sees.
 */

const PAGE_SIZE = 50;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const money = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toFixed(2)}`;

const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/** One headline number. `hint` carries the caveat when there is one. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Stock reads three ways, and telling them apart matters at the counter. */
function StockCell({ item }: { item: MerchantItem }) {
  if (item.quantity == null) {
    return <span className="text-xs text-gray-400">Not tracked</span>;
  }
  const tone =
    item.quantity > 0
      ? "text-success-600 dark:text-success-400"
      : "text-error-500 dark:text-error-400";
  return <span className={`font-medium ${tone}`}>{item.quantity}</span>;
}

/**
 * The state of the register-sale sync, and a way to force one.
 *
 * A background timer is invisible from outside the server, and a hosted app can
 * be restarted or idled without anyone noticing it stopped. Showing when it last
 * ran turns "no sales have come through" into something you can diagnose:
 * either it isn't running, or it ran and found nothing.
 */
function RegisterSales() {
  const notify = useNotify();
  const [status, setStatus] = useState<CloverSyncStatus | null>(null);
  const [report, setReport] = useState<CloverSyncReport | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    merchant
      .syncStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  async function syncNow() {
    setBusy(true);
    setReport(null);
    try {
      const next = await merchant.syncNow(24);
      setReport(next);
      refresh();

      const restored = next.refunded.reduce((n, r) => n + r.restored, 0);

      if (next.imported.length || next.refunded.length) {
        const serials = next.imported.reduce((n, i) => n + i.matched, 0);
        const parts = [];
        if (serials) parts.push(`${serials} serial${serials === 1 ? "" : "s"} marked sold`);
        if (restored) parts.push(`${restored} put back after a refund`);
        notify.success(
          `Brought in ${next.imported.length + next.refunded.length} change${
            next.imported.length + next.refunded.length === 1 ? "" : "s"
          }`,
          { message: parts.join(", ") || undefined }
        );
      } else {
        notify.info("Nothing new to bring in", {
          message: `Checked ${next.scanned} order${next.scanned === 1 ? "" : "s"} from the last ${next.hours} hours.`,
        });
      }
    } catch (err) {
      notify.error("Could not sync", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
    setBusy(false);
  }

  const lastRun = status?.lastPolledAt ? new Date(status.lastPolledAt) : null;
  // A pass that hasn't run in many times its own interval means the timer is
  // not running — which looks identical to "no sales" until you say so.
  const stale =
    !lastRun || Date.now() - lastRun.getTime() > (status?.intervalSeconds ?? 60) * 1000 * 10;

  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Sales from the register</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Anything rung up on Clover is brought in automatically, marking the serial sold and
            taking it off stock. Sync now reaches back a day in case the automatic check missed
            something.
          </p>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={busy}
          className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Sync now"}
        </button>
      </div>

      {status && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Last automatic check:{" "}
            <span className={stale ? "font-medium text-warning-600" : "text-gray-800 dark:text-white/90"}>
              {lastRun ? lastRun.toLocaleString() : "never"}
            </span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            Every {status.intervalSeconds}s
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            Sales brought in:{" "}
            <span className="text-gray-800 dark:text-white/90">{status.importedTotal}</span>
          </span>
        </div>
      )}

      {stale && status && (
        <p className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          The automatic check hasn't run recently. On a hosted server that usually means the app was
          restarted or idled. Sync now still works, and the next automatic pass should resume.
        </p>
      )}

      {report && (
        <div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p className="text-gray-700 dark:text-gray-300">
            Checked {report.scanned} order{report.scanned === 1 ? "" : "s"} from the last{" "}
            {report.hours} hours — brought in {report.imported.length}
            {report.refunded.length > 0 && `, ${report.refunded.length} refunded`}.
          </p>
          {/* Why an order was passed over is the useful half when nothing lands. */}
          {report.skipped.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              {report.skipped.slice(0, 8).map((s) => (
                <li key={s.order}>
                  <span className="font-mono">{s.order}</span> — {s.reason}
                </li>
              ))}
              {report.skipped.length > 8 && <li>and {report.skipped.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function MerchantInventoryPage() {
  const [page, setPage] = useState<Page | null>(null);
  const [summary, setSummary] = useState<MerchantSummary | null>(null);
  const [offset, setOffset] = useState(0);

  // What's typed vs what's been searched: Clover is queried on submit, not on
  // every keystroke, so 2,000-item accounts aren't hammered while typing.
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notConnected, setNotConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await merchant.inventory({ search, limit: PAGE_SIZE, offset });
      setPage(next);
      setNotConnected(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read the Clover account.";
      // The server flags this case so the page can offer the fix rather than
      // showing a bare error the shop can't act on.
      setNotConnected(/isn't connected/i.test(message));
      setError(message);
      setPage(null);
    }
    setLoading(false);
  }, [search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Counting pages through the whole catalogue is slower than one page of rows,
  // so it runs on its own and never holds the table up.
  useEffect(() => {
    merchant
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0); // a new search starts at the first page, not wherever we were
    setSearch(term.trim());
  }

  function clearSearch() {
    setTerm("");
    setOffset(0);
    setSearch("");
  }

  const items = page?.items ?? [];
  const from = items.length ? offset + 1 : 0;
  const to = offset + items.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Merchant inventory
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Live from your connected Clover account — this is what the register sees. Your own
            stock, with serials and cost, stays under Inventory.
          </p>
        </div>
        {page && (
          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400">
            {page.merchantId}
            {page.env === "sandbox" && " · sandbox"}
          </span>
        )}
      </div>

      {notConnected ? (
        <div className={`${cardClass} p-10 text-center`}>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This store isn't connected to a Clover account yet.
          </p>
          <Link
            to="/store"
            className="mt-4 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            Connect it in Store settings
          </Link>
        </div>
      ) : (
        <>
          <RegisterSales />

          {summary && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Items on the account"
                value={summary.total.toLocaleString()}
                hint={summary.complete ? undefined : "Counted up to the page limit."}
              />
              <Stat
                label="In stock"
                value={summary.inStock.toLocaleString()}
                hint={`of ${summary.tracked.toLocaleString()} with stock tracking on`}
              />
              <Stat
                label="Not tracked"
                value={(summary.total - summary.tracked).toLocaleString()}
                hint="Clover holds no count for these"
              />
            </div>
          )}

          <div className={cardClass}>
            <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-5 dark:border-gray-800">
              <form onSubmit={submitSearch} className="flex flex-1 flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <label
                    htmlFor="merchant-search"
                    className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                  >
                    Search by item name
                  </label>
                  <input
                    id="merchant-search"
                    className={inputClass}
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  Search
                </button>
                {search && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="h-11 px-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Clear
                  </button>
                )}
              </form>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Refresh
              </button>
            </div>

            {error && !notConnected && (
              <p className="border-b border-gray-200 px-5 py-4 text-sm text-error-500 dark:border-gray-800">
                {error}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Item</th>
                    <th className="px-5 py-3 font-medium">Code</th>
                    <th className="px-5 py-3 font-medium text-right">Price</th>
                    <th className="px-5 py-3 font-medium text-right">Stock</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-gray-500">
                        Reading from Clover…
                      </td>
                    </tr>
                  )}

                  {/* Only an empty *result* is "no items" — when the request failed
                      the banner above already says why, and claiming the account is
                      empty on top of that is just wrong. */}
                  {!loading && !error && !items.length && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-gray-500">
                        {search ? `Nothing on the account matches “${search}”.` : "No items yet."}
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <span className="text-gray-800 dark:text-white/90">{item.name}</span>
                          {item.hidden && (
                            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
                              Hidden
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                          {item.code ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700 dark:text-gray-300">
                          {item.variablePrice ? (
                            <span className="text-xs text-gray-400">Set at register</span>
                          ) : (
                            money(item.priceCents)
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <StockCell item={item} />
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {item.categories.join(", ") || "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {when(item.modifiedAt)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {items.length ? `Showing ${from}–${to}` : "Nothing to show"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOffset((o) => Math.max(o - PAGE_SIZE, 0))}
                  disabled={loading || offset === 0}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={loading || !page?.hasMore}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
