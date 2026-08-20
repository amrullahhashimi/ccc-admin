import { useMemo, useState } from "react";
import { money } from "../../lib/api";
import { useNotify } from "../../components/ui/notify";

const COINS = [
  { cents: 5, label: "5¢" },
  { cents: 10, label: "10¢" },
  { cents: 25, label: "25¢" },
  { cents: 100, label: "$1" },
  { cents: 200, label: "$2" },
];

const NOTES = [
  { cents: 500, label: "$5" },
  { cents: 1000, label: "$10" },
  { cents: 2000, label: "$20" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
];

const ALL = [...COINS, ...NOTES];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-right text-sm tabular-nums text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

/** A typed count as a whole number of pieces. Blank and rubbish both read as none. */
const countOf = (raw: string) => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function DenominationRows({
  rows,
  counts,
  onChange,
}: {
  rows: typeof COINS;
  counts: Record<number, string>;
  onChange: (cents: number, value: string) => void;
}) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((d) => {
        const count = countOf(counts[d.cents] ?? "");
        const line = count * d.cents;
        return (
          <div key={d.cents} className="flex items-center gap-4 px-6 py-3">
            <div className="w-20 shrink-0">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {d.label}
              </span>
              <span className="ml-2 text-xs text-gray-400">{d.note}</span>
            </div>

            <div className="w-28 shrink-0">
              <label className="sr-only" htmlFor={`count-${d.cents}`}>
                How many {d.label}
              </label>
              <input
                id={`count-${d.cents}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className={inputClass}
                value={counts[d.cents] ?? ""}
                onChange={(e) => onChange(d.cents, e.target.value)}
              />
            </div>

            <span className="text-sm text-gray-400">×</span>

            <span className="w-16 shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400">
              {money(d.cents)}
            </span>

            {/* Greyed until there is something to show, so the eye goes to the
                lines that were actually counted. */}
            <span
              className={`ml-auto text-sm font-medium tabular-nums ${
                line > 0 ? "text-gray-800 dark:text-white/90" : "text-gray-300 dark:text-gray-600"
              }`}
            >
              {money(line)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CashCalculatorPage() {
  const notify = useNotify();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [expected, setExpected] = useState("");

  const onChange = (cents: number, value: string) =>
    setCounts((c) => ({ ...c, [cents]: value }));

  const totals = useMemo(() => {
    const sum = (rows: typeof COINS) =>
      rows.reduce((t, d) => t + countOf(counts[d.cents] ?? "") * d.cents, 0);
    const coins = sum(COINS);
    const notes = sum(NOTES);
    const pieces = ALL.reduce((t, d) => t + countOf(counts[d.cents] ?? ""), 0);
    return { coins, notes, total: coins + notes, pieces };
  }, [counts]);

  /**
   * What the drawer should hold, if anyone has said. Parsed from dollars, so
   * it rounds to the nearest cent rather than carrying a fraction of one.
   */
  const expectedCents = useMemo(() => {
    const n = parseFloat(expected.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }, [expected]);

  const difference = expectedCents == null ? null : totals.total - expectedCents;

  function clear() {
    setCounts({});
    setExpected("");
    notify.success("Cleared");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Cash calculator</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Coins</h2>
            <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
              {money(totals.coins)}
            </span>
          </div>
          <DenominationRows rows={COINS} counts={counts} onChange={onChange} />
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Notes</h2>
            <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
              {money(totals.notes)}
            </span>
          </div>
          <DenominationRows rows={NOTES} counts={counts} onChange={onChange} />
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">In the drawer</p>
            {/* Proportional figures, not tabular: equal-width digits read loose
                at this size. */}
            <p className="mt-1 text-4xl font-semibold text-gray-800 dark:text-white/90">
              {money(totals.total)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {totals.pieces} {totals.pieces === 1 ? "piece" : "pieces"} counted
            </p>
          </div>

          <div className="min-w-[12rem]">
            <label
              htmlFor="expected"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Expected in the drawer
            </label>
            <input
              id="expected"
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              className={inputClass}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={clear}
            className="h-11 rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        {difference !== null && (
          <p
            className={`mt-5 rounded-lg px-4 py-3 text-sm ${
              difference === 0
                ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
            }`}
          >
            {difference === 0
              ? "Balances exactly."
              : difference > 0
                ? `Over by ${money(difference)}.`
                : `Short by ${money(Math.abs(difference))}.`}
          </p>
        )}
      </div>
    </div>
  );
}
