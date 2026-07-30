import { useCallback, useEffect, useState } from "react";
import { customers as customersApi, type Customer } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

type FormState = {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  postal: string;
  contactConsent: boolean;
  notes: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  company: "",
  phone: "",
  mobile: "",
  email: "",
  address: "",
  city: "",
  postal: "",
  contactConsent: false,
  notes: "",
};

function toForm(c: Customer): FormState {
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    company: c.company ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    postal: c.postal ?? "",
    contactConsent: !!c.contactConsent,
    notes: c.notes ?? "",
  };
}

/* -------------------------------- the form -------------------------------- */

function CustomerForm({
  customer,
  onCancel,
  onSaved,
}: {
  customer: Customer | null; // null = adding
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(customer ? toForm(customer) : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim()) return setError("First name is required.");
    if (!form.phone.trim() && !form.email.trim()) {
      return setError("Add a phone number or an email so you can reach them.");
    }
    setSaving(true);
    setError("");
    try {
      if (customer) await customersApi.update(customer.id, form);
      else await customersApi.create(form);
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
          aria-label="Back to customers"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          {customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "New customer"}
        </h1>
      </div>

      <form
        onSubmit={save}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>
              First name <span className="text-error-500">*</span>
            </label>
            <input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Company</label>
            <input className={inputClass} value={form.company} onChange={(e) => set("company", e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Mobile</label>
            <input type="tel" className={inputClass} value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Postal code</label>
            <input className={inputClass} value={form.postal} onChange={(e) => set("postal", e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400">
              <input
                type="checkbox"
                checked={form.contactConsent}
                onChange={(e) => set("contactConsent", e.target.checked)}
                className="h-4 w-4"
              />
              I have consent to contact this customer (texts, email, calls)
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              rows={3}
              className={`${inputClass} h-auto`}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything worth remembering — devices they own, preferences…"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>
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
            {saving ? "Saving…" : customer ? "Save changes" : "Add customer"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------- the list -------------------------------- */

export default function CustomersPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [view, setView] = useState<{ mode: "list" } | { mode: "form"; customer: Customer | null }>({
    mode: "list",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await customersApi.list(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customers.");
    }
    setLoading(false);
  }, [q]);

  useEffect(() => {
    if (view.mode !== "list") return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, view.mode]);

  const remove = async (customer: Customer) => {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
    if (!confirm(`Remove ${name}?`)) return;
    try {
      await customersApi.remove(customer.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove.");
    }
  };

  if (view.mode === "form") {
    return (
      <CustomerForm
        customer={view.customer}
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
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Customers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {rows.length} {rows.length === 1 ? "customer" : "customers"}
          </p>
        </div>
        <button
          onClick={() => setView({ mode: "form", customer: null })}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          New customer
        </button>
      </div>

      <input
        className={inputClass}
        placeholder="Search name, company, phone, email…"
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
              {q ? "Nothing matches that search" : "No customers yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q ? "Try a different name or number." : "Add your first customer to start tracking who buys and repairs what."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3 text-right">History</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((c) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
                  const history =
                    (c._count?.sales ?? 0) + (c._count?.tickets ?? 0) + (c._count?.layaways ?? 0);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setView({ mode: "form", customer: c })}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white/90">{name}</p>
                        {c.company && <p className="mt-0.5 text-xs text-gray-500">{c.company}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                        {c.phone || c.mobile || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.email || "—"}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                        {history > 0 ? history : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {can("OWNER", "MANAGER") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(c);
                            }}
                            className="text-xs font-medium text-error-500 hover:text-error-600"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}