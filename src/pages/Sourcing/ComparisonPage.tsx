import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  downloadCsv,
  sourcing,
  vendorMoney,
  type ComparisonRow,
  type SourcingFilters,
  type VendorMessageRow,
} from "../../lib/api";
import { useNotify } from "../../components/ui/notify";
import { ImportPanel } from "./ImportPanel";
import { Empty, Loading, Pager, Panel } from "./parts";
import { ghostButton, gradeLabel, inputClass, primaryButton, shortDate, toneClass, toneNote } from "./ui";

/**
 * Every vendor's price for every product, side by side.
 *
 * The table is assembled by naming imports: search for a vendor message you
 * saved, add it, and what it brought in joins the grid — with every other
 * vendor's price for those same products beside it, which is the whole point of
 * putting it there. Remove it again and it leaves.
 *
 * It starts empty on purpose. The question this screen answers is "how do
 * these lists compare", and that question begins with choosing the lists — a
 * grid of everything ever imported answers a question nobody asked.
 */
export default function ComparisonPage() {
  const notify = useNotify();
  const [params, setParams] = useSearchParams();

  const [importing, setImporting] = useState(false);
  /** The imports currently making up the table, in the order they were added. */
  const [included, setIncluded] = useState<VendorMessageRow[]>([]);
  const [filters, setFilters] = useState<SourcingFilters>({
    messageIds: params.get("messageIds") ?? "",
    multiVendor: "",
    quantity: 1,
    page: 1,
    pageSize: 25,
  });
  const [data, setData] = useState<Awaited<ReturnType<typeof sourcing.comparison>> | null>(null);
  // Starts settled, not spinning: with no imports chosen there is nothing to wait for.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* An id can arrive in the URL — from the import screen, or a shared link —
     so the chip for it has to be filled in from the server. */
  useEffect(() => {
    const ids = (params.get("messageIds") ?? "").split(",").filter(Boolean);
    if (!ids.length) return;

    sourcing
      .messages({ pageSize: 100 })
      .then(({ rows }) => setIncluded(rows.filter((row) => ids.includes(row.id))))
      .catch(() => {});
    // Only on first load: after that the chips are the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!filters.messageIds) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setData(await sourcing.comparison(filters));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the comparison.");
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (patch: Partial<SourcingFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  /** Chips in, filter out — the two are kept in step here and nowhere else. */
  function setImports(rows: VendorMessageRow[]) {
    setIncluded(rows);
    const ids = rows.map((r) => r.id).join(",");
    set({ messageIds: ids });
    setParams(ids ? { messageIds: ids } : {}, { replace: true });
  }

  const addImport = (row: VendorMessageRow) => {
    if (included.some((r) => r.id === row.id)) return;
    setImports([...included, row]);
  };

  const removeImport = (id: string) => setImports(included.filter((r) => r.id !== id));

  /** A message that has just been saved joins the table it was pasted into. */
  async function afterImport(messageId: string) {
    setImporting(false);
    try {
      const { rows } = await sourcing.messages({ pageSize: 100 });
      const saved = rows.find((r) => r.id === messageId);
      if (saved) setImports([...included, saved]);
    } catch {
      /* The offers are saved either way; the chip just won't appear. */
    }
    notify.success("Offers saved", { message: "Added to the comparison, against everyone else's prices." });
  }

  async function exportCsv() {
    try {
      await downloadCsv(sourcing.exportUrl("comparison", filters), "price-comparison.csv");
    } catch (err) {
      notify.error("Export failed", { message: err instanceof Error ? err.message : undefined });
    }
  }

  const vendors = data?.vendors ?? [];

  return (
    <div className="space-y-5">
      {/* One search: find an import by name, add it, drop it again. */}
      <div className="flex items-center gap-3">
        <ImportSearch onPick={addImport} excludeIds={included.map((r) => r.id)} />
        <button className={`${ghostButton} shrink-0`} onClick={exportCsv} disabled={!data?.total}>
          Export
        </button>
        <button className={`${primaryButton} shrink-0 whitespace-nowrap`} onClick={() => setImporting((v) => !v)}>
          {importing ? "Close" : "Add message"}
        </button>
      </div>

      {/* Pasting a price list here rather than on its own screen: the reason to
          read a vendor's message is to see it against everyone else's. */}
      {importing && <ImportPanel compact onSaved={afterImport} />}

      <div className="flex flex-wrap items-center gap-3">
        {/* What the table is built from. One click takes an import back out. */}
        {included.map((row) => (
          <span
            key={row.id}
            className="flex items-center gap-2 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          >
            {row.name || `${row.vendor.name} · ${shortDate(row.receivedAt)}`}
            <button
              onClick={() => removeImport(row.id)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-brand-500 transition hover:bg-brand-500 hover:text-white"
              aria-label={`Remove ${row.name ?? row.vendor.name} from the comparison`}
            >
              ×
            </button>
          </span>
        ))}

        {included.length > 1 && (
          <button className="text-xs font-medium text-gray-500 hover:underline" onClick={() => setImports([])}>
            Clear all
          </button>
        )}

      </div>

      <Panel
        title={
          included.length
            ? `Price comparison — ${included.length} ${included.length === 1 ? "import" : "imports"}`
            : "Price comparison"
        }
        padded={false}
      >
        {loading && !data ? (
          <Loading what="Building the comparison…" />
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : !data || data.rows.length === 0 ? (
          <Empty
            title={included.length ? "Nothing in those imports" : "Choose the imports to compare"}
            message={
              included.length
                ? "Those imports brought in no priced products."
                : "Search an import by name in the box above and add it. Add a second one and the two line up side by side."
            }
            action={
              <button className={primaryButton} onClick={() => setImporting(true)}>
                Add a vendor message
              </button>
            }
          />
        ) : (
          <>
            <div className={`overflow-x-auto ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-800">
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="sticky left-0 z-10 bg-white px-4 py-3 dark:bg-gray-900">Product</th>
                    {vendors.map((v) => (
                      <th key={v.id} className="whitespace-nowrap px-4 py-3 text-right">
                        {v.name}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-3 text-right">Saving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.rows.map((row) => (
                    <Row key={row.id} row={row} vendors={vendors} quantity={filters.quantity ?? 1} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </Panel>
    </div>
  );
}


/**
 * Find a saved import by what it was called.
 *
 * Focusing the box offers the most recent imports, because most of the time the
 * one being looked for arrived this morning. Typing searches the names people
 * gave them, and the vendors who sent them.
 */
function ImportSearch({ onPick, excludeIds }: { onPick: (row: VendorMessageRow) => void; excludeIds: string[] }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<VendorMessageRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const t = setTimeout(() => {
      sourcing
        .messages({ q: term.trim() || undefined, pageSize: 8 })
        .then(({ rows }) => setRows(rows))
        .catch(() => setRows([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [term, open]);

  const offered = rows.filter((row) => !excludeIds.includes(row.id));

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`${inputClass} w-full`}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setOpen(true)}
        // A blur that lands on the list itself must not close it first.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        aria-label="Search saved imports by name"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-md dark:border-gray-700 dark:bg-gray-900">
          {searching && !offered.length ? (
            <p className="px-4 py-3 text-sm text-gray-500">Looking…</p>
          ) : !offered.length ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              {term.trim() ? "No import by that name." : "No imports saved yet."}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {offered.map((row) => (
                <li key={row.id}>
                  <button
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(row);
                      setTerm("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.name || `${row.vendor.name} · ${shortDate(row.receivedAt)}`}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {row.vendor.name} · {shortDate(row.receivedAt)} · {row.itemCount}{" "}
                        {row.itemCount === 1 ? "product" : "products"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand-500">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  vendors,
  quantity,
}: {
  row: ComparisonRow;
  vendors: { id: string; name: string }[];
  quantity: number;
}) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <th scope="row" className="sticky left-0 z-10 max-w-xs bg-white px-4 py-3 text-left font-normal dark:bg-gray-900">
        <Link to={`/sourcing/products/${row.id}`} className="text-sm font-medium text-brand-500 hover:underline">
          {row.normalizedName}
        </Link>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {[row.storage, row.connectivity, gradeLabel(row.grade)].filter(Boolean).join(" · ") || "—"}
        </p>
      </th>

      {vendors.map((vendor) => {
        const cell = row.cells.find((c) => c.vendorId === vendor.id);
        if (!cell) {
          return (
            <td key={vendor.id} className="px-4 py-3 text-right text-sm text-gray-300 dark:text-gray-700">
              —
            </td>
          );
        }
        return (
          <td key={vendor.id} className={`px-4 py-3 text-right text-sm tabular-nums ${toneClass[cell.tone]}`}>
            <span title={toneNote[cell.tone]}>
              {cell.tone === "cheapest" ? "▾ " : ""}
              {vendorMoney(cell.priceCents, cell.currency)}
            </span>
            {cell.quantityBreak && (
              <span className="mt-0.5 block text-xs font-normal opacity-80">
                {cell.maxQuantity ? `${cell.minQuantity}–${cell.maxQuantity}` : `${cell.minQuantity}+`}
              </span>
            )}
            {/* A price nobody can fill at this quantity is not a bargain. */}
            {cell.availableQuantity != null && (
              <span
                className={`mt-0.5 block text-xs font-normal ${
                  cell.availableQuantity < quantity ? "text-warning-600 dark:text-warning-400" : "opacity-70"
                }`}
              >
                {cell.availableQuantity} in stock
              </span>
            )}
          </td>
        );
      })}

      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
        {row.tied ? "Tied" : row.savingsCents == null ? "—" : `$${(row.savingsCents / 100).toFixed(2)}`}
      </td>
    </tr>
  );
}
