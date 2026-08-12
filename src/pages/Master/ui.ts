/** Shared styling for the master screens, so both files stay in step. */

export const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export const tableWrap =
  "overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800";

export const th = "px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500";

export const td = "px-5 py-3 text-sm text-gray-600 dark:text-gray-400";

/** Service ticket statuses, coloured by how far along the job is. */
export const TICKET_STATUS: Record<string, string> = {
  INTAKE: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
  DIAGNOSING: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  WAITING_PARTS: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  READY: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  COLLECTED: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
  CANCELLED: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
};
