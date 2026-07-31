import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { service as serviceApi, customers as customersApi, type Customer } from "../../lib/api";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

export default function ServiceNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({
    customerId: presetCustomer ?? "",
    deviceMake: "",
    deviceModel: "",
    deviceImei: "",
    passcode: "",
    issue: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    customersApi.list("").then(setCustomers).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return setError("Pick a customer.");
    if (!form.issue.trim()) return setError("Describe the problem.");
    setSaving(true);
    setError("");
    try {
      const created = await serviceApi.create(form);
      navigate(`/service/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New service order</h1>
      </div>

      <form onSubmit={create} className={`${panelClass} space-y-5 p-6`}>
        <div>
          <label className={labelClass}>Customer <span className="text-error-500">*</span></label>
          <select className={inputClass} value={form.customerId} onChange={(e) => set("customerId", e.target.value)}>
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.firstName, c.lastName].filter(Boolean).join(" ")}{c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500">Not listed? Add them on the Customers page first.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={labelClass}>Device make</label><input className={inputClass} value={form.deviceMake} onChange={(e) => set("deviceMake", e.target.value)} placeholder="Apple, Samsung…" /></div>
          <div><label className={labelClass}>Model</label><input className={inputClass} value={form.deviceModel} onChange={(e) => set("deviceModel", e.target.value)} placeholder="iPhone 14 Pro" /></div>
          <div><label className={labelClass}>IMEI / serial</label><input className={inputClass} value={form.deviceImei} onChange={(e) => set("deviceImei", e.target.value)} /></div>
          <div><label className={labelClass}>Passcode</label><input className={inputClass} value={form.passcode} onChange={(e) => set("passcode", e.target.value)} placeholder="To unlock for testing" /></div>
        </div>

        <div>
          <label className={labelClass}>Problem reported <span className="text-error-500">*</span></label>
          <textarea rows={3} className={`${inputClass} h-auto`} value={form.issue} onChange={(e) => set("issue", e.target.value)} placeholder="Cracked screen, won't charge…" />
        </div>

        {error && <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>}

        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? "Creating…" : "Create service order"}
        </button>
      </form>
    </div>
  );
}