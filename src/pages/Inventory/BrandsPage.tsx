import { useCallback, useEffect, useState } from "react";
import { brands as brandsApi, type Brand } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

function BrandForm({
  brand,
  onCancel,
  onSaved,
}: {
  brand: Brand | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(brand?.name ?? "");
  const [notes, setNotes] = useState(brand?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Brand name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { name: name.trim(), notes: notes.trim() };
      if (brand) await brandsApi.update(brand.id, payload);
      else await brandsApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label="Back to brands"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          {brand ? brand.name : "New brand"}
        </h1>
      </div>

      <form
        onSubmit={save}
        className="max-w-xl space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div>
          <label className={labelClass}>
            Name <span className="text-error-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            rows={3}
            className={`${inputClass} h-auto`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">
            {error}
          </p>
        )}

        <div className="flex gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving…" : brand ? "Save changes" : "Add brand"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BrandsPage() {
  const { can } = useAuth();
  const notify = useNotify();
  const [rows, setRows] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [view, setView] = useState<{ mode: "list" } | { mode: "form"; brand: Brand | null }>({
    mode: "list",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await brandsApi.list(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load brands.");
    }
    setLoading(false);
  }, [q]);

  useEffect(() => {
    if (view.mode !== "list") return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, view.mode]);

  const remove = async (brand: Brand) => {
    const ok = await notify.confirm({
      title: `Remove ${brand.name}?`,
      message: "The brand is taken off the list.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      const res = await brandsApi.remove(brand.id);
      if (res.message) notify.info(res.message);
      else notify.success(`${brand.name} removed.`);
      load();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  if (view.mode === "form") {
    return (
      <BrandForm
        brand={view.brand}
        onCancel={() => setView({ mode: "list" })}
        onSaved={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {rows.length} {rows.length === 1 ? "brand" : "brands"}
          </p>
        </div>
        <button
          onClick={() => setView({ mode: "form", brand: null })}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          New brand
        </button>
      </div>

      <input
        className={inputClass}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">
              {q ? "Nothing matches that search" : "No brands yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q ? "Try a different name." : "Add the makes you carry — Apple, Samsung, and so on."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Brand</th>
                  <th className="px-5 py-3">Notes</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setView({ mode: "form", brand: b })}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-white/90">
                      {b.name}
                    </td>
                    <td className="max-w-md truncate px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {b.notes || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {b._count?.products ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {can("OWNER", "MANAGER") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(b);
                          }}
                          className="text-xs font-medium text-error-500 hover:text-error-600"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}