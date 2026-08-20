import { useCallback, useEffect, useState } from "react";
import { vendors as vendorsApi, type Vendor } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const CURRENCIES = [
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "USD", label: "USD — US dollar" },
];
const COUNTRIES = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "CN", label: "China" },
  { value: "HK", label: "Hong Kong" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" },
  { value: "OTHER", label: "Other" },
];
type FormState = {
  name: string;
  accountNumber: string;
  contactPerson: string;
  currency: string;
  country: string;
  address: string;
  address2: string;
  city: string;
  province: string;
  postal: string;
  phone: string;
  mobile: string;
  fax: string;
  email1: string;
  email2: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  accountNumber: "",
  contactPerson: "",
  currency: "CAD",
  country: "CA",
  address: "",
  address2: "",
  city: "Calgary",
  province: "AB",
  postal: "",
  phone: "",
  mobile: "",
  fax: "",
  email1: "",
  email2: "",
  notes: "",
};

function toForm(v: Vendor): FormState {
  return {
    name: v.name ?? "",
    accountNumber: v.accountNumber ?? "",
    contactPerson: v.contactPerson ?? "",
    currency: v.currency ?? "CAD",
    country: v.country ?? "CA",
    address: v.address ?? "",
    address2: v.address2 ?? "",
    city: v.city ?? "",
    province: v.province ?? "",
    postal: v.postal ?? "",
    phone: v.phone ?? "",
    mobile: v.mobile ?? "",
    fax: v.fax ?? "",
    email1: v.email1 ?? "",
    email2: v.email2 ?? "",
    notes: v.notes ?? "",
  };
}

/* -------------------------------- the form -------------------------------- */

function VendorForm({
  vendor,
  onCancel,
  onSaved,
}: {
  vendor: Vendor | null; // null = adding a new one
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(vendor ? toForm(vendor) : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Vendor name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (vendor) await vendorsApi.update(vendor.id, form);
      else await vendorsApi.create(form);
      onSaved(); // parent reloads the list and switches back to it
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
          aria-label="Back to vendors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          {vendor ? vendor.name : "New vendor"}
        </h1>
      </div>

      <form
        onSubmit={save}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Vendor name <span className="text-error-500">*</span>
            </label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Account number</label>
            <input
              className={inputClass}
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Contact person</label>
            <input
              className={inputClass}
              value={form.contactPerson}
              onChange={(e) => set("contactPerson", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Currency</label>
            <select
              className={inputClass}
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              className={inputClass}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Mobile</label>
            <input
              type="tel"
              className={inputClass}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Fax</label>
            <input
              type="tel"
              className={inputClass}
              value={form.fax}
              onChange={(e) => set("fax", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Email 1</label>
            <input
              type="email"
              className={inputClass}
              value={form.email1}
              onChange={(e) => set("email1", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Email 2</label>
            <input
              type="email"
              className={inputClass}
              value={form.email2}
              onChange={(e) => set("email2", e.target.value)}
            />
          </div>

<div className="sm:col-span-2">
            <h3 className="mb-1 mt-2 border-t border-gray-200 pt-5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800">
              Address
            </h3>
          </div>

          <div>
            <label className={labelClass}>Country</label>
            <select
              className={inputClass}
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div />

          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Address 2</label>
            <input
              className={inputClass}
              value={form.address2}
              onChange={(e) => set("address2", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>City</label>
            <input
              className={inputClass}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Province</label>
            <input
              className={inputClass}
              value={form.province}
              onChange={(e) => set("province", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Postal code</label>
            <input
              className={inputClass}
              value={form.postal}
              onChange={(e) => set("postal", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              rows={3}
              className={`${inputClass} h-auto`}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
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
            {saving ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------- the list -------------------------------- */

export default function VendorsPage() {
  const { can } = useAuth();
  const notify = useNotify();
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // "list" or the form — one at a time, no overlay.
  const [view, setView] = useState<{ mode: "list" } | { mode: "form"; vendor: Vendor | null }>({
    mode: "list",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await vendorsApi.list(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vendors.");
    }
    setLoading(false);
  }, [q]);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (view.mode !== "list") return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, view.mode]);

  const remove = async (vendor: Vendor) => {
    const ok = await notify.confirm({
      title: `Remove ${vendor.name}?`,
      message: "The vendor is taken off the list.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      const res = await vendorsApi.remove(vendor.id);
      if (res.message) notify.info(res.message);
      else notify.success(`${vendor.name} removed.`);
      load();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  if (view.mode === "form") {
    return (
      <VendorForm
        vendor={view.vendor}
        onCancel={() => setView({ mode: "list" })}
        onSaved={() => {
          setView({ mode: "list" });
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {rows.length} {rows.length === 1 ? "vendor" : "vendors"}
          </p>
        </div>
        <button
          onClick={() => setView({ mode: "form", vendor: null })}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          New vendor
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
              {q ? "Nothing matches that search" : "No vendors yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q ? "Try a different name or number." : "Add the suppliers you buy stock and parts from."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Currency</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setView({ mode: "form", vendor: v })}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800 dark:text-white/90">{v.name}</p>
                      {v.accountNumber && (
                        <p className="mt-0.5 text-xs text-gray-500">Acct {v.accountNumber}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {v.contactPerson || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {v.phone || v.mobile || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {v.email1 || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400">
                        {v.currency || "CAD"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {v._count?.products ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {can("OWNER", "MANAGER") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(v);
                          }}
                          className="text-xs font-medium text-gray-400 hover:text-error-500"
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