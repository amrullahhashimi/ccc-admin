import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { sourcing, type SourcingOptions, type VendorMessageRow } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";
import { Chip, Empty, Loading, Pager, Panel } from "./parts";
import { SourceMessage } from "./CatalogProductDetail";
import { dateTime, inputClass } from "./ui";

/**
 * Every message that has been imported, and the words it contained.
 *
 * This is the audit trail: any offer in the system can be traced from here back
 * to the message a vendor actually sent, on the date they sent it.
 */
export default function ImportHistoryPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const canManage = user?.role === "OWNER" || user?.role === "MANAGER";

  const [options, setOptions] = useState<SourcingOptions | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pageSize: number; total: number; rows: VendorMessageRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    sourcing.options().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await sourcing.messages({ vendorId: vendorId || undefined, page }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the import history.");
    }
    setLoading(false);
  }, [vendorId, page]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Deleting an import takes its offers with it — otherwise it isn't an undo,
   * it's just hiding where the prices came from. The dialog says exactly how
   * many before anyone commits.
   */
  async function remove(row: VendorMessageRow) {
    const ok = await notify.confirm({
      title: `Delete this import from ${row.vendor.name}?`,
      message: row.offerCount
        ? `The ${row.offerCount} ${row.offerCount === 1 ? "offer" : "offers"} it brought in will be removed too, along with any product left with no prices at all. Price history is kept.`
        : "The message will be removed. No offers still point at it.",
      confirmText: "Delete import",
      variant: "error",
    });
    if (!ok) return;

    try {
      const result = await sourcing.removeMessage(row.id);
      notify.success("Import deleted", {
        message: [
          result.offersRemoved ? `${result.offersRemoved} offers removed` : null,
          result.productsRemoved ? `${result.productsRemoved} products left empty and cleared` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      load();
    } catch (err) {
      notify.error("Could not delete that import", { message: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select
          className={`${inputClass} w-auto min-w-0`}
          value={vendorId}
          onChange={(e) => {
            setVendorId(e.target.value);
            setPage(1);
          }}
          aria-label="Vendor"
        >
          <option value="">All vendors</option>
          {options?.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <Link
          to="/sourcing/import"
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Import message
        </Link>
      </div>

      <Panel padded={false}>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : !data || data.rows.length === 0 ? (
          <Empty title="Nothing imported yet" message="Vendor messages you import will be listed here with their original text." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-800">
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-3">Received</th>
                    <th className="px-5 py-3">Vendor</th>
                    <th className="px-5 py-3 text-right">Products</th>
                    <th className="px-5 py-3 text-right">Offers</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Imported by</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.rows.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {dateTime(m.receivedAt)}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{m.vendor.name}</td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                        {m.itemCount}
                      </td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                        {m.offerCount}
                      </td>
                      <td className="px-5 py-3">
                        <Chip tone={m.status === "IMPORTED" ? "brand" : "grey"}>
                          {m.status === "IMPORTED" ? "Completed" : m.status.toLowerCase()}
                        </Chip>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{m.importedBy ?? "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <span className="flex items-center justify-end gap-3">
                          <button
                            className="text-xs font-medium text-brand-500 hover:underline"
                            onClick={() => setViewing(m.id)}
                          >
                            View message
                          </button>
                          {canManage && (
                            <button className="text-xs font-medium text-error-500 hover:underline" onClick={() => remove(m)}>
                              Delete
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <SourceMessage id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
