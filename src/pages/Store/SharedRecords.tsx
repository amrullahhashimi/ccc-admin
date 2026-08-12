import { useEffect, useState } from "react";
import { money, sharing, type ReceivedShare, type SharedRow } from "../../lib/api";

const th = "px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500";
const td = "px-5 py-3 text-sm text-gray-600 dark:text-gray-400";

type Column = { key: string; label: string; money?: boolean; date?: boolean; strong?: boolean };

/**
 * Columns we know how to render, per tab. Only the ones actually present in the
 * response are drawn — the server omits whatever wasn't granted, so the table
 * shapes itself around the permission rather than us second-guessing it.
 */
const COLUMNS: Record<string, Column[]> = {
  inventory: [
    { key: "name", label: "Item", strong: true },
    { key: "sku", label: "SKU" },
    { key: "brand", label: "Brand" },
    { key: "category", label: "Category" },
    { key: "vendor", label: "Vendor" },
    { key: "quantity", label: "On hand" },
    { key: "costCents", label: "Cost", money: true },
    { key: "onlinePriceCents", label: "Online", money: true },
    { key: "salePriceCents", label: "Sale price", money: true },
  ],
  customers: [
    { key: "firstName", label: "First name", strong: true },
    { key: "lastName", label: "Last name" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "mobile", label: "Mobile" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "postal", label: "Postal" },
    { key: "notes", label: "Notes" },
  ],
  service: [
    { key: "number", label: "#", strong: true },
    { key: "deviceMake", label: "Make" },
    { key: "deviceModel", label: "Model" },
    { key: "deviceImei", label: "IMEI" },
    { key: "issue", label: "Issue" },
    { key: "status", label: "Status" },
    { key: "diagnosis", label: "Diagnosis" },
    { key: "externalNote", label: "Note" },
    { key: "customer", label: "Customer" },
    { key: "customerPhone", label: "Customer phone" },
    { key: "estimateCents", label: "Estimate", money: true },
    { key: "labourCents", label: "Labour", money: true },
    { key: "depositCents", label: "Deposit", money: true },
    { key: "createdAt", label: "In", date: true },
    { key: "completedAt", label: "Done", date: true },
  ],
};

const TAB_LABEL: Record<string, string> = {
  inventory: "Inventory",
  customers: "Customers",
  service: "Service tickets",
};

function cell(row: SharedRow, col: Column) {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "—";
  if (col.money) return money(Number(v));
  if (col.date) return new Date(String(v)).toLocaleDateString();
  if (col.key === "status") return String(v).toLowerCase().replace(/_/g, " ");
  return String(v);
}

export default function SharedRecords({
  share,
  onBack,
}: {
  share: ReceivedShare;
  onBack: () => void;
}) {
  // Only the groups this store actually opened up become tabs.
  const tabs = Object.keys(COLUMNS).filter(
    (g) => share.permissions[g] && Object.values(share.permissions[g]).some(Boolean)
  );

  const [tab, setTab] = useState(tabs[0] ?? "inventory");
  const [rows, setRows] = useState<SharedRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    const job =
      tab === "inventory"
        ? sharing.inventory(share.store.id, q)
        : tab === "customers"
        ? sharing.customers(share.store.id)
        : sharing.service(share.store.id);

    job
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load that."))
      .finally(() => setLoading(false));
  }, [tab, q, share.store.id]);

  useEffect(() => setQ(""), [tab]);

  // Draw a column only when at least one row carries it.
  const columns = (COLUMNS[tab] ?? []).filter((c) => rows.some((r) => c.key in r));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {share.store.name}
            </h1>
            <p className="text-xs text-gray-500">
              {[share.store.phone, share.store.website].filter(Boolean).join(" · ") ||
                "Shared with you"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
          Read-only
        </span>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white/90"
            }`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === "inventory" && (
        <input
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {error && <p className="text-sm text-error-500">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <table className="w-full">
          <thead className="border-b border-gray-200 dark:border-gray-800">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`${th} ${c.money ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row) => (
              <tr key={String(row.id)}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${
                      c.strong ? "px-5 py-3 text-sm text-gray-800 dark:text-white/90" : td
                    } ${c.money ? "text-right tabular-nums" : ""}`}
                  >
                    {cell(row, c)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="p-8 text-center text-sm text-gray-500">
                  Nothing shared here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
