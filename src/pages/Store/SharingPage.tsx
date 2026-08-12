import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  sharing,
  type ReceivedShare,
  type Share,
  type ShareCatalogue,
  type SharePermissions,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import SharedRecords from "./SharedRecords";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

/** How many fields a grant actually opens. */
const countGranted = (p: SharePermissions) =>
  Object.values(p || {}).reduce(
    (n, group) => n + Object.values(group || {}).filter(Boolean).length,
    0
  );

/** Plain-English summary of a grant, for the lists. */
function describe(p: SharePermissions, catalogue: ShareCatalogue | null) {
  if (!catalogue) return "";
  return Object.entries(p || {})
    .map(([group, fields]) => {
      const on = Object.entries(fields || {}).filter(([, v]) => v).length;
      return on ? `${catalogue[group]?.label ?? group} (${on})` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

export default function SharingPage() {
  const { can } = useAuth();
  const mayManage = can("OWNER", "MANAGER");

  const [catalogue, setCatalogue] = useState<ShareCatalogue | null>(null);
  const [outgoing, setOutgoing] = useState<Share[]>([]);
  const [received, setReceived] = useState<ReceivedShare[]>([]);
  const [open, setOpen] = useState<ReceivedShare | null>(null);

  // The "share with" flow: look a store up by email, then tick what to give.
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<SharePermissions>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cat, list, rec] = await Promise.all([
        sharing.catalogue(),
        sharing.list(),
        sharing.received(),
      ]);
      setCatalogue(cat);
      setOutgoing(list.outgoing);
      setReceived(rec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sharing.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setEmail("");
    setFound(null);
    setDraft({});
    setEditingId(null);
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setFound(null);
    try {
      const { store, existing } = await sharing.lookup(email);
      setFound(store);
      setDraft(existing?.permissions ?? {});
      setEditingId(existing?.id ?? null);
      if (existing) setNotice(`You already share with ${store.name} — adjust the ticks below.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not check that address."
      );
    }
    setBusy(false);
  }

  const toggle = (group: string, field: string) =>
    setDraft((d) => {
      const next = { ...d, [group]: { ...(d[group] ?? {}) } };
      if (next[group][field]) delete next[group][field];
      else next[group][field] = true;
      if (!Object.keys(next[group]).length) delete next[group];
      return next;
    });

  const toggleGroup = (group: string, on: boolean) =>
    setDraft((d) => {
      const next = { ...d };
      if (!on) {
        delete next[group];
      } else {
        next[group] = Object.fromEntries(
          Object.keys(catalogue?.[group].fields ?? {}).map((f) => [f, true])
        );
      }
      return next;
    });

  async function save() {
    if (!found) return;
    setBusy(true);
    setError("");
    try {
      await sharing.save(found.id, draft);
      setNotice(`Sharing with ${found.name} saved.`);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    }
    setBusy(false);
  }

  async function revoke(share: Share) {
    if (!confirm(`Stop sharing with ${share.viewerStore?.name}? They lose access straight away.`)) {
      return;
    }
    try {
      await sharing.revoke(share.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop that share.");
    }
  }

  async function editExisting(share: Share) {
    setFound(share.viewerStore ? { id: share.viewerStore.id, name: share.viewerStore.name } : null);
    setDraft(share.permissions ?? {});
    setEditingId(share.id);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (open) return <SharedRecords share={open} onBack={() => setOpen(null)} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Sharing</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Hand specific details to another shop. You choose the store by an email address of
          someone who works there, and tick exactly what they may see. Everything is read-only, and
          you can withdraw it at any time.
        </p>
      </div>

      {error && <p className="text-sm text-error-500">{error}</p>}
      {notice && (
        <p className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-400">
          {notice}
        </p>
      )}

      {/* ---------------------------- share with ---------------------------- */}
      {mayManage && (
        <div className={cardClass}>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Share with a store</h2>
          <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter the email address of someone at that store. Nothing is shared until you tick the
            boxes and save.
          </p>

          <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@phonestation.ca"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="h-11 shrink-0 rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {busy ? "Checking…" : "Find store"}
            </button>
          </form>

          {found && catalogue && (
            <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-800 dark:text-white/90">
                  Sharing with <span className="font-semibold">{found.name}</span>
                  {editingId && <span className="ml-2 text-xs text-gray-400">already set up</span>}
                </p>
                <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">
                  Cancel
                </button>
              </div>

              <div className="space-y-4">
                {Object.entries(catalogue).map(([group, spec]) => {
                  const fields = Object.entries(spec.fields);
                  const on = Object.values(draft[group] ?? {}).filter(Boolean).length;
                  const all = on === fields.length;
                  return (
                    <div key={group} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {spec.label}
                          {on > 0 && <span className="ml-2 text-xs font-normal text-brand-500">{on} on</span>}
                        </h3>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group, !all)}
                          className="text-xs font-medium text-brand-500 hover:text-brand-600"
                        >
                          {all ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {fields.map(([field, label]) => (
                          <label key={field} className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!draft[group]?.[field]}
                              onChange={() => toggle(group, field)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20"
                            />
                            <span className="text-gray-700 dark:text-gray-300">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={save}
                  disabled={busy || countGranted(draft) === 0}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {busy ? "Saving…" : editingId ? "Update sharing" : "Start sharing"}
                </button>
                <span className="text-xs text-gray-500">
                  {countGranted(draft) === 0
                    ? "Tick at least one field."
                    : `${countGranted(draft)} field${countGranted(draft) === 1 ? "" : "s"} selected.`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------- what I share --------------------------- */}
      <div className={cardClass}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">You're sharing with</h2>
        {outgoing.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            You aren't sharing anything with anyone.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {outgoing.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {s.viewerStore?.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {describe(s.permissions, catalogue) || "nothing selected"}
                  </span>
                </span>
                {mayManage && (
                  <span className="flex gap-3">
                    <button
                      onClick={() => editExisting(s)}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600"
                    >
                      Change
                    </button>
                    <button
                      onClick={() => revoke(s)}
                      className="text-xs font-medium text-error-500 hover:text-error-600"
                    >
                      Stop
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* -------------------------- shared with me -------------------------- */}
      <div className={cardClass}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Shared with you</h2>
        {received.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No other store is sharing anything with you.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {received.map((r) => (
              <li key={r.store.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {r.store.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {describe(r.permissions, catalogue)}
                  </span>
                </span>
                <button
                  onClick={() => setOpen(r)}
                  className="text-sm font-medium text-brand-500 hover:text-brand-600"
                >
                  View →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
