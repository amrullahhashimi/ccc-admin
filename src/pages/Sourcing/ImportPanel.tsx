import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { sourcing, type ParsedItem, type ParseResult, type SourcingOptions } from "../../lib/api";
import { useNotify } from "../../components/ui/notify";
import { Empty, Field, Panel } from "./parts";
import {
  CONDITIONS,
  GRADES,
  cellInputClass,
  confidenceClass,
  dollarsFromCents,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  tierLabel,
  withCurrent,
} from "./ui";

/**
 * Paste a vendor's message, check what the parser made of it, save the offers.
 *
 * The review table is the point of it. Nothing is written until someone has
 * looked at every row, and every field the parser filled in can be corrected
 * first — including which existing product each line attaches to, which is the
 * decision with money attached.
 *
 * Lives in its own component because it is wanted in two places: on its own
 * screen, and folded into the comparison, where the natural thing to do with a
 * message that just arrived is read it against everyone else's prices.
 */

/** A row being reviewed: what was parsed, plus whatever the user has changed. */
type Row = ParsedItem & {
  /** Dollars as typed, so a half-finished "12." doesn't jump back to "0.12". */
  priceInput: string;
  keep: boolean;
  expanded: boolean;
};

const toRow = (item: ParsedItem): Row => ({
  ...item,
  priceInput: dollarsFromCents(item.priceCents),
  keep: true,
  expanded: false,
});

export function ImportPanel({ onSaved, compact = false }: { onSaved?: (messageId: string) => void; compact?: boolean }) {
  const notify = useNotify();
  const [params] = useSearchParams();

  const [options, setOptions] = useState<SourcingOptions | null>(null);
  const [vendorId, setVendorId] = useState(params.get("vendorId") ?? "");
  const [name, setName] = useState("");
  /* Once someone types their own name we stop suggesting one, so a chosen
     label never gets overwritten by changing the vendor afterwards. */
  const [nameTouched, setNameTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [useAi, setUseAi] = useState(false);

  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    sourcing
      .options()
      .then((o) => {
        setOptions(o);
        setVendorId((current) => current || (o.vendors.length === 1 ? o.vendors[0].id : ""));
      })
      .catch(() => setError("Could not load the vendor list."));
  }, []);
  useEffect(() => {
    if (nameTouched) return;
    const vendor = options?.vendors.find((v) => v.id === vendorId);
    setName(
      vendor
        ? `${vendor.name} — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : ""
    );
  }, [vendorId, options, nameTouched]);

  const catalogue = useMemo(
    () => rows.flatMap((r) => r.alternatives).filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i),
    [rows]
  );

  const update = useCallback((index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  async function parse() {
    if (!vendorId) return setError("Choose which vendor sent this.");
    if (!message.trim()) return setError("Paste the message first.");

    setParsing(true);
    setError("");
    try {
      const parsed = await sourcing.parse({ vendorId, message, useAi });
      setResult(parsed);
      setRows(parsed.items.map(toRow));
      if (!parsed.items.length) {
        setError("Nothing in that message looked like a product. Check the vendor and try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that message.");
    }
    setParsing(false);
  }

  async function save() {
    const keeping = rows.filter((r) => r.keep);
    if (!keeping.length) return setError("Every row has been dropped — there is nothing to save.");

    const missingPrice = keeping.findIndex((r) => !r.priceInput.trim());
    if (missingPrice >= 0) {
      return setError(`Row ${missingPrice + 1} has no price. Fill it in or drop the row.`);
    }

    setSaving(true);
    setError("");
    try {
      const summary = await sourcing.import({
        vendorId,
        name: name.trim() || undefined,
        rawMessage: message,
        items: keeping.map((row) => ({
          brand: row.brand,
          model: row.model,
          generation: row.generation,
          productType: row.productType,
          storage: row.storage,
          ram: row.ram,
          connectivity: row.connectivity,
          carrier: row.carrier,
          condition: row.condition,
          grade: row.grade,
          color: row.color,
          cpu: row.cpu,
          screenSize: row.screenSize,
          productName: row.productName,
          catalogProductId: row.catalogProductId,
          price: row.priceInput,
          currency: row.currency,
          minQuantity: row.minQuantity,
          maxQuantity: row.maxQuantity,
          availableQuantity: row.availableQuantity,
        })),
      });

      const changed = summary.priceChanges.length;
      notify.success(`Saved ${summary.created + summary.updated} offers`, {
        message: [
          summary.created ? `${summary.created} new` : null,
          summary.updated ? `${summary.updated} updated` : null,
          summary.newProducts ? `${summary.newProducts} new products` : null,
          changed ? `${changed} price ${changed === 1 ? "change" : "changes"} recorded` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      setResult(null);
      setRows([]);
      setMessage("");
      setNameTouched(false);
      onSaved?.(summary.messageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these offers.");
    }
    setSaving(false);
  }

  async function reset() {
    if (rows.length) {
      const ok = await notify.confirm({
        title: "Throw away this import?",
        message: "The rows below have not been saved.",
        confirmText: "Discard",
        variant: "error",
      });
      if (!ok) return;
    }
    setResult(null);
    setRows([]);
    setMessage("");
    setError("");
  }

  const keeping = rows.filter((r) => r.keep).length;
  const needsReview = rows.filter((r) => r.keep && r.decision === "review").length;
  const newProducts = rows.filter((r) => r.keep && !r.catalogProductId).length;

  return (
    <div className="space-y-5">
      {/* ------------------------------ the message ------------------------------ */}
      <Panel
        title={compact ? undefined : "Import vendor message"}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor">
              <select className={inputClass} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Choose a vendor</option>
                {options?.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* What this batch is called. It is how the import is found again
                on the comparison screen, so it is worth a real name. */}
            <Field label="Name for this import">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
              />
            </Field>
          </div>

          {options && !options.vendors.length && (
            <p className="text-sm text-warning-600 dark:text-warning-400">
              There are no active vendors yet — add one under Inventory → Vendors first.
            </p>
          )}

          <Field label="Message">
            <textarea
              className={`${inputClass} h-auto min-h-[12rem] font-mono leading-6`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              spellCheck={false}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <button className={primaryButton} onClick={parse} disabled={parsing || saving}>
              {parsing ? "Reading…" : "Parse message"}
            </button>
            {(rows.length > 0 || message) && (
              <button className={ghostButton} onClick={reset} disabled={parsing || saving}>
                Clear
              </button>
            )}
            {options?.aiEnabled && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-400">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                Ask the assistant if the rules can't read it
              </label>
            )}
            {error && <p className="text-sm text-error-500">{error}</p>}
          </div>
        </div>
      </Panel>

      {/* ------------------------------- the review ------------------------------- */}
      {result && (
        <Panel
          title={`Review — ${keeping} ${keeping === 1 ? "offer" : "offers"} from ${result.vendor.name}`}
          subtitle={[
            `${result.lineCount} lines read`,
            needsReview ? `${needsReview} to confirm` : null,
            newProducts ? `${newProducts} new to the catalogue` : null,
            result.readBy === "ai" ? "read by the assistant" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          padded={false}
          action={
            <div className="flex gap-2">
              <button className={ghostButton} onClick={reset} disabled={saving}>
                Cancel
              </button>
              <button className={primaryButton} onClick={save} disabled={saving || !keeping}>
                {saving ? "Saving…" : `Save ${keeping} ${keeping === 1 ? "offer" : "offers"}`}
              </button>
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty title="Nothing to review" message="No product lines were found in that message." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[62rem]">
                <thead className="border-b border-gray-200 dark:border-gray-800">
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-3">Keep</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Storage</th>
                    <th className="px-3 py-3">Condition</th>
                    <th className="px-3 py-3">Grade</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-right">Min qty</th>
                    <th className="px-3 py-3 text-right">Stock</th>
                    <th className="px-3 py-3">Match</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((row, index) => (
                    <ReviewRow
                      key={index}
                      row={row}
                      index={index}
                      catalogue={catalogue}
                      onChange={(patch) => update(index, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {result.skipped.length} {result.skipped.length === 1 ? "line was" : "lines were"} set aside
              </p>
              <ul className="mt-2 space-y-1">
                {result.skipped.map((s) => (
                  <li key={s.lineNumber} className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-mono text-xs text-gray-400">line {s.lineNumber}</span>{" "}
                    <span className="font-mono">{s.raw}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/* -------------------------------- one row -------------------------------- */

function ReviewRow({
  row,
  index,
  catalogue,
  onChange,
}: {
  row: Row;
  index: number;
  catalogue: { id: string; name: string; score: number; label: string }[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const dimmed = row.keep ? "" : "opacity-40";

  return (
    <>
      <tr className={dimmed}>
        <td className="px-3 py-2 align-top">
          <input
            type="checkbox"
            checked={row.keep}
            onChange={(e) => onChange({ keep: e.target.checked })}
            aria-label={`Keep row ${index + 1}`}
          />
        </td>

        <td className="px-3 py-2 align-top">
          <input
            className={cellInputClass}
            value={row.productName}
            onChange={(e) => onChange({ productName: e.target.value })}
            aria-label="Product name"
          />
          <p className="mt-1 truncate font-mono text-xs text-gray-400" title={row.raw}>
            {row.raw}
          </p>
        </td>

        <td className="px-3 py-2 align-top">
          <input
            className={`${cellInputClass} w-24`}
            value={row.storage ?? ""}
            onChange={(e) => onChange({ storage: e.target.value || null })}
            aria-label="Storage"
          />
        </td>

        <td className="px-3 py-2 align-top">
          <select
            className={`${cellInputClass} w-32`}
            value={row.condition ?? ""}
            onChange={(e) => onChange({ condition: e.target.value || null })}
            aria-label="Condition"
          >
            <option value="">Not stated</option>
            {withCurrent(CONDITIONS, row.condition).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>

        <td className="px-3 py-2 align-top">
          {/* Vendors grade on two scales — A/B/C, or Mint/Good/Fair. Whatever
              they wrote stays selectable even if it is neither. */}
          <select
            className={`${cellInputClass} w-28`}
            value={row.grade ?? ""}
            onChange={(e) => onChange({ grade: e.target.value || null })}
            aria-label="Grade"
          >
            <option value="">—</option>
            {withCurrent(GRADES, row.grade).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </td>

        <td className="px-3 py-2 text-right align-top">
          <input
            className={`${cellInputClass} w-24 text-right tabular-nums`}
            value={row.priceInput}
            onChange={(e) => onChange({ priceInput: e.target.value })}
            inputMode="decimal"
            aria-label="Price"
          />
          {row.existingOffer?.changed && (
            <p className="mt-1 whitespace-nowrap text-xs text-warning-600 dark:text-warning-400">
              was ${(row.existingOffer.priceCents / 100).toFixed(2)}
            </p>
          )}
        </td>

        <td className="px-3 py-2 text-right align-top">
          <input
            className={`${cellInputClass} w-16 text-right tabular-nums`}
            value={row.minQuantity}
            onChange={(e) => onChange({ minQuantity: Math.max(1, Number(e.target.value) || 1) })}
            inputMode="numeric"
            aria-label="Minimum quantity"
          />
          {row.minQuantity > 1 && (
            <p className="mt-1 whitespace-nowrap text-xs text-gray-500">{tierLabel(row.minQuantity, row.maxQuantity)}</p>
          )}
        </td>

        <td className="px-3 py-2 text-right align-top">
          <input
            className={`${cellInputClass} w-16 text-right tabular-nums`}
            value={row.availableQuantity ?? ""}
            onChange={(e) => onChange({ availableQuantity: e.target.value ? Number(e.target.value) : null })}
            inputMode="numeric"
            aria-label="How many the vendor has"
          />
        </td>

        <td className="px-3 py-2 align-top">
          <select
            className={`${cellInputClass} w-56`}
            value={row.catalogProductId ?? ""}
            onChange={(e) => onChange({ catalogProductId: e.target.value || null })}
            aria-label="Matching product"
          >
            <option value="">Create a new product</option>
            {row.alternatives.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.score}%
              </option>
            ))}
            {catalogue
              .filter((c) => !row.alternatives.some((a) => a.id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          {row.match && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${confidenceClass(row.match.score)}`}>
                {row.match.label} {row.match.score}%
              </span>
              {row.needsConfirmation && row.catalogProductId && (
                <span className="inline-block rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
                  Confirm
                </span>
              )}
            </p>
          )}
          {row.match?.conflicts.length ? (
            <p className="mt-1 text-xs text-error-500">
              Differs on {row.match.conflicts.join(", ")} — not merged automatically
            </p>
          ) : row.needsConfirmation && row.match?.unknowns.length ? (
            // Naming the missing attribute is the difference between "trust me"
            // and a reviewer who can actually check.
            <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
              This vendor didn't state {row.match.unknowns.join(", ")} — check it's the same product.
            </p>
          ) : null}
        </td>

        <td className="px-3 py-2 text-right align-top">
          <button
            className="text-xs font-medium text-brand-500 hover:underline"
            onClick={() => onChange({ expanded: !row.expanded })}
          >
            {row.expanded ? "Less" : "More"}
          </button>
        </td>
      </tr>

      {row.expanded && (
        <tr className={`bg-gray-50 dark:bg-white/[0.02] ${dimmed}`}>
          <td />
          <td colSpan={9} className="px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(
                [
                  ["Brand", "brand"],
                  ["Model", "model"],
                  ["RAM", "ram"],
                  ["Connectivity", "connectivity"],
                  ["Carrier", "carrier"],
                  ["Colour", "color"],
                  ["CPU", "cpu"],
                  ["Screen size", "screenSize"],
                ] as [string, keyof Row][]
              ).map(([label, key]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
                  <input
                    className={cellInputClass}
                    value={(row[key] as string) ?? ""}
                    onChange={(e) => onChange({ [key]: e.target.value || null } as Partial<Row>)}
                  />
                </label>
              ))}

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Maximum quantity</span>
                <input
                  className={cellInputClass}
                  value={row.maxQuantity ?? ""}
                  onChange={(e) => onChange({ maxQuantity: e.target.value ? Number(e.target.value) : null })}
                  inputMode="numeric"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Currency</span>
                <select
                  className={cellInputClass}
                  value={row.currency}
                  onChange={(e) => onChange({ currency: e.target.value })}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>

            {row.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {row.warnings.map((w) => (
                  <li key={w} className="text-xs text-warning-600 dark:text-warning-400">
                    {w}
                  </li>
                ))}
              </ul>
            )}

            <p className={`${labelClass} mt-3 !mb-0 !text-xs`}>
              Read with {row.parseConfidence ?? "—"}% confidence from “{row.raw}”
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
