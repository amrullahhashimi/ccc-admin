/**
 * The class strings the vendor-pricing screens share.
 *
 * They live in a plain .ts file rather than beside the components so that
 * importing a class name doesn't cost a component file its fast refresh.
 */

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

/** Compact version for the cells of the import review table. */
export const cellInputClass =
  "h-9 w-full min-w-0 rounded-md border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export const cardClass =
  "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

export const thClass =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500";

export const tdClass = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

export const primaryButton =
  "rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

export const ghostButton =
  "rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5";

/**
 * Cheapest, tied and dearer.
 *
 * Colour is never the only signal — the cheapest cell is also bold and carries
 * a caret, so the table still reads on a monochrome screen or to someone who
 * can't separate the greens from the reds.
 */
export const toneClass: Record<string, string> = {
  /** The only vendor quoting it — a price, not a verdict. */
  only: "text-gray-800 dark:text-white/90",
  cheapest:
    "bg-success-50 font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-400",
  tied: "bg-warning-50 font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  higher: "text-error-600 dark:text-error-400",
};

export const toneNote: Record<string, string> = {
  only: "The only quote",
  cheapest: "Cheapest",
  tied: "Tied cheapest",
  higher: "Dearer",
};

/** Match confidence, worded the same way the API words it. */
export const confidenceClass = (score: number) =>
  score >= 95
    ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
    : score >= 70
      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
      : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400";

/** "Aug 20, 2026" — short, unambiguous, no time unless it matters. */
export const shortDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

export const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

/** "Today" / "Yesterday" / a date — how a buyer thinks about a price list. */
export function whenLabel(value?: string | null) {
  if (!value) return "—";
  const then = new Date(value);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(value);
}

/**
 * The two grading scales vendors use.
 *
 * Letters and words are kept apart rather than translated into each other: a
 * vendor's "Good" is their own standard, and calling it a "B" would merge stock
 * that was never the same.
 */
export const GRADES = ["A", "B", "C", "D"];

/**
 * Both vocabularies vendors file under "Condition": how it was sold, and how it
 * looks. Whichever one a vendor uses is kept as they wrote it.
 */
export const CONDITIONS = [
  "New",
  "Open box",
  "Used",
  "Refurbished",
  "For parts",
  "Mint",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
];

/**
 * Options for a dropdown that must be able to show a value it has never heard
 * of — a vendor's own wording, kept rather than silently blanked.
 */
export const withCurrent = (options: string[], current?: string | null) =>
  current && !options.includes(current) ? [...options, current] : options;

/** "Grade A" for a letter, but just "Good" for a word — "Grade Good" reads wrong. */
export const gradeLabel = (grade?: string | null) =>
  !grade ? null : /^[a-d][+-]?$/i.test(grade) ? `Grade ${grade.toUpperCase()}` : grade;

/** How a quantity tier reads in a sentence: "10+" or "5–9". */
export const tierLabel = (min: number, max: number | null) =>
  max == null ? (min <= 1 ? "Any quantity" : `${min}+`) : `${min}–${max}`;

/** Dollars typed into a form → integer cents, or null if it isn't a number. */
export function centsFromInput(value: string): number | null {
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export const dollarsFromCents = (cents?: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
