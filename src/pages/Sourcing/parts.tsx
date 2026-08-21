import { cardClass, ghostButton, gradeLabel, labelClass } from "./ui";

/** A panel with an optional heading and right-hand action. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cardClass}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            {title && <h2 className="font-semibold text-gray-800 dark:text-white/90">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/** One headline number. */
export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-800 dark:text-white/90">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

/**
 * What a table says when it has nothing to show. Always says what to do next —
 * an empty screen with no way forward is a dead end, not a state.
 */
export function Empty({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="p-10 text-center">
      <p className="font-medium text-gray-800 dark:text-white/90">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ what = "Loading…" }: { what?: string }) {
  return <p className="p-10 text-center text-sm text-gray-500">{what}</p>;
}

/** A labelled field. Labels sit above the control; nothing hides inside it. */
export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </label>
  );
}

/** Page-at-a-time controls. Hidden entirely when everything already fits. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {from}–{to} of {total}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button className={ghostButton} onClick={() => onPage(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400">
            {page} / {pages}
          </span>
          <button className={ghostButton} onClick={() => onPage(page + 1)} disabled={page >= pages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/** A small piece of metadata: storage, grade, connectivity. */
export function Chip({ children, tone = "grey" }: { children: React.ReactNode; tone?: "grey" | "brand" | "warning" }) {
  const tones = {
    grey: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    warning: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** The attributes of a product, as chips, skipping whatever is unknown. */
export function SpecChips({
  product,
}: {
  product: {
    storage?: string | null;
    ram?: string | null;
    connectivity?: string | null;
    carrier?: string | null;
    condition?: string | null;
    grade?: string | null;
    color?: string | null;
    cpu?: string | null;
  };
}) {
  const specs = [
    product.cpu,
    product.ram ? `${product.ram} RAM` : null,
    product.storage,
    product.connectivity,
    product.carrier,
    product.color,
    product.condition,
    gradeLabel(product.grade),
  ].filter(Boolean) as string[];

  if (!specs.length) return <span className="text-xs text-gray-400">No specifications recorded</span>;

  return (
    <span className="flex flex-wrap gap-1.5">
      {specs.map((s) => (
        <Chip key={s}>{s}</Chip>
      ))}
    </span>
  );
}
