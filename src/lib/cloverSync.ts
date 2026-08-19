import type { CloverSyncResult } from "./api";
import type { NotifyApi } from "../components/ui/notify/types";

/**
 * Say what happened when new serials were mirrored to the Clover account.
 *
 * Silence is the right answer in the ordinary cases: a store with no Clover
 * account has nothing to report, and a clean push is what the person already
 * expected. Only a partial or total failure is worth interrupting for, because
 * that is the case where the serial exists here but not on the register — and
 * nobody would find out until they tried to sell it.
 */
export function reportCloverSync(notify: NotifyApi, result?: CloverSyncResult | null) {
  if (!result?.connected || !result.failed.length) return;

  const { failed, action } = result;
  const listed = failed
    .slice(0, 3)
    .map((f) => f.serial)
    .join(", ");
  const rest = failed.length > 3 ? ` and ${failed.length - 3} more` : "";

  // Each action fails in its own way, and the wording has to say which — the
  // fix for a stale item is not the fix for one that should have gone.
  const what = {
    added: "added to Clover",
    updated: "updated on Clover",
    removed: "deleted from Clover",
    sold: "taken off Clover stock",
    returned: "put back on Clover stock",
  }[action];

  notify.warning(
    failed.length === 1
      ? `Serial ${failed[0].serial} wasn't ${what}`
      : `${failed.length} serials weren't ${what}`,
    {
      // The reason is the same for the whole batch in practice — a dead token,
      // an outage — so one is enough to act on.
      message: `${listed}${rest}. ${failed[0].error} The change is saved here either way.`,
      duration: 0, // stays until dismissed; this needs following up, not glancing at
    }
  );
}
