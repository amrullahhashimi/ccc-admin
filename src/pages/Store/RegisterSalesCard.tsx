import { useCallback, useEffect, useState } from "react";
import { merchant, type CloverSyncReport, type CloverSyncStatus } from "../../lib/api";
import { useNotify } from "../../components/ui/notify";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

/**
 * The state of the register-sale sync, and a way to force one.
 *
 * A background timer is invisible from outside the server, and a hosted app can
 * be restarted or idled without anyone noticing it stopped. Showing when it last
 * ran turns "no sales have come through" into something you can diagnose:
 * either it isn't running, or it ran and found nothing.
 */
export default function RegisterSalesCard() {
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

  // Nothing to say until a store has connected an account.
  if (status && !status.connected) return null;

  const lastRun = status?.lastPolledAt ? new Date(status.lastPolledAt) : null;
  // A pass that hasn't run in many times its own interval means the timer is
  // not running — which looks identical to "no sales" until you say so.
  const stale =
    !lastRun || Date.now() - lastRun.getTime() > (status?.intervalSeconds ?? 60) * 1000 * 10;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Sales from the register</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Anything rung up on Clover is brought in automatically: the serial is marked sold and
            taken off stock, and a refund puts it back. Sync now reaches back a day in case the
            automatic check missed something.
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
            <span
              className={stale ? "font-medium text-warning-600" : "text-gray-800 dark:text-white/90"}
            >
              {lastRun ? lastRun.toLocaleString() : "never"}
            </span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">Every {status.intervalSeconds}s</span>
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
