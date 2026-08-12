import { useCallback, useEffect, useState } from "react";
import { master, type MasterStore, type Store } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import StoreDetail from "./StoreDetail";

import { cardClass, inputClass, labelClass } from "./ui";

const emptyStore = { name: "", ownerName: "", ownerEmail: "", password: "" };

/**
 * The master console. Lists every store on the system; open one to look through
 * its inventory, service tickets and customers, and to manage its staff.
 */
export default function MasterPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<MasterStore[]>([]);
  const [open, setOpen] = useState<Store | null>(null);
  const [form, setForm] = useState(emptyStore);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStores(await master.stores());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the stores.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function createStore(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated("");
    try {
      const { store, owner } = await master.createStore(form);
      setCreated(`${store.name} is set up — ${owner.name} can sign in with ${owner.email}.`);
      setForm(emptyStore);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that store.");
    }
    setBusy(false);
  }

  async function toggle(store: MasterStore) {
    const verb = store.active ? "Switch off" : "Switch back on";
    if (!confirm(`${verb} ${store.name}? Their staff ${store.active ? "won't be able to sign in" : "can sign in again"}.`)) {
      return;
    }
    try {
      await master.updateStore(store.id, { active: !store.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that store.");
    }
  }

  if (!user?.superAdmin) {
    return (
      <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
        This area is for the system administrator.
      </p>
    );
  }

  if (open) return <StoreDetail store={open} onBack={() => setOpen(null)} />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Master</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Every store on the system. Open one to look through its records, or add its staff.
            Nothing here can be edited or deleted — it's a window, not a set of controls.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {adding ? "Cancel" : "Add store"}
        </button>
      </div>

      {error && <p className="text-sm text-error-500">{error}</p>}
      {created && (
        <p className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-400">
          {created}
        </p>
      )}

      {adding && (
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold text-gray-800 dark:text-white/90">New store</h2>
          <form onSubmit={createStore} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Store name <span className="text-error-500">*</span>
              </label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                Owner's name <span className="text-error-500">*</span>
              </label>
              <input
                className={inputClass}
                value={form.ownerName}
                onChange={(e) => set("ownerName", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                Owner's email <span className="text-error-500">*</span>
              </label>
              <input
                type="email"
                className={inputClass}
                value={form.ownerEmail}
                onChange={(e) => set("ownerEmail", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Starting password <span className="text-error-500">*</span>
              </label>
              <input
                type="password"
                className={inputClass}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create store"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {stores.map((s) => (
          <div
            key={s.id}
            className={`${cardClass} ${s.active ? "" : "opacity-60"} flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {s.logoLight ? (
                    <img
                      src={s.logoLight}
                      alt=""
                      className="h-10 w-10 rounded-lg object-contain"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-500 dark:bg-brand-500/15">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <h2 className="font-semibold text-gray-800 dark:text-white/90">{s.name}</h2>
                    <p className="text-xs text-gray-500">
                      {s.phone || s.website || "No contact details yet"}
                    </p>
                  </div>
                </div>
                {!s.active && (
                  <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700 dark:bg-error-500/15 dark:text-error-400">
                    off
                  </span>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Items", s._count?.products],
                  ["Customers", s._count?.customers],
                  ["Tickets", s._count?.tickets],
                  ["Staff", s._count?.users],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded-lg bg-gray-50 py-2 dark:bg-white/[0.03]">
                    <dd className="text-base font-semibold text-gray-800 dark:text-white/90">
                      {n ?? 0}
                    </dd>
                    <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setOpen(s)}
                className="text-sm font-medium text-brand-500 hover:text-brand-600"
              >
                Open →
              </button>
              <button
                onClick={() => toggle(s)}
                className="text-xs font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {s.active ? "Switch off" : "Switch on"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {stores.length === 0 && !adding && (
        <p className={`${cardClass} text-center text-sm text-gray-500`}>
          No stores yet. Add the first one above.
        </p>
      )}
    </div>
  );
}

