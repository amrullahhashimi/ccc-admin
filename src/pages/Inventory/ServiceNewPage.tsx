import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { service as serviceApi, customers as customersApi, type Customer } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const fullName = (c: Customer) => [c.firstName, c.lastName].filter(Boolean).join(" ");

const pad = (n: number) => String(n).padStart(2, "0");
const nowParts = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const openPicker = (e: React.MouseEvent<HTMLInputElement>) => { try { (e.currentTarget as any).showPicker?.(); } catch { /* not supported */ } };
const combine = (date: string, time: string) => (date ? new Date(`${date}T${time || "00:00"}`).toISOString() : null);
const stampNow = () => {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function ServiceNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId");

  const [step, setStep] = useState<"customer" | "device">("customer");
  const [chosen, setChosen] = useState<Customer | null>(null);

  // new-customer form (step 1 left)
  const [cust, setCust] = useState({
    firstName: "", lastName: "", company: "",
    phone: "", mobile: "", email: "",
    address: "", city: "Calgary", postal: "", contactConsent: false,
  });
  const setC = (k: keyof typeof cust, v: string | boolean) => setCust((f) => ({ ...f, [k]: v }));
  const [creating, setCreating] = useState(false);
  const [custError, setCustError] = useState("");
  const [matches, setMatches] = useState<Customer[]>([]);

  // service form (step 2)
  const initNow = nowParts();
  const [form, setForm] = useState({
    device: "", deviceImei: "", passcode: "",
    warranty: false,
    dateInDate: initNow.date, dateInTime: initNow.time,
    dueDate: initNow.date, dueTime: initNow.time,
    issue: "",
    receiptNote: "", externalNote: "", internalNote: "",
  });
  const setF = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const [notePos, setNotePos] = useState<"top" | "bottom">("top");

  useEffect(() => {
    if (!presetCustomer) return;
    customersApi.get(presetCustomer).then((c) => { setChosen(c); setStep("device"); }).catch(() => {});
  }, [presetCustomer]);

  useEffect(() => {
    if (step !== "customer") return;
    const q = [cust.firstName, cust.lastName].filter(Boolean).join(" ").trim() || cust.phone.trim() || cust.mobile.trim();
    if (q.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      customersApi.list(q).then((r) => setMatches(r.slice(0, 8))).catch(() => setMatches([]));
    }, 300);
    return () => clearTimeout(t);
  }, [cust.firstName, cust.lastName, cust.phone, cust.mobile, step]);

  const useExisting = (c: Customer) => { setChosen(c); setStep("device"); };

  const createCustomer = async () => {
    if (!cust.firstName.trim()) return setCustError("First name is required.");
    if (!cust.phone.trim() && !cust.email.trim()) return setCustError("Add a phone number or an email so you can reach them.");
    setCreating(true); setCustError("");
    try {
      const created = await customersApi.create(cust);
      setChosen(created); setStep("device");
    } catch (err) { setCustError(err instanceof Error ? err.message : "Could not create customer."); }
    setCreating(false);
  };

  const addTime = () => {
    const stamp = `${user?.name ?? "Staff"} (${stampNow()}): `;
    setForm((f) => {
      const cur = f.internalNote;
      const next = notePos === "top" ? stamp + (cur ? "\n" + cur : "") : (cur ? cur + "\n" : "") + stamp;
      return { ...f, internalNote: next };
    });
    setTimeout(() => {
      const ta = internalRef.current;
      if (!ta) return;
      ta.focus();
      const pos = notePos === "top" ? stamp.length : ta.value.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const createService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    if (!form.issue.trim()) return setError("Describe the problem.");
    setSaving(true); setError("");
    try {
      const created = await serviceApi.create({
        customerId: chosen.id,
        deviceMake: "", deviceModel: form.device, deviceImei: form.deviceImei, passcode: form.passcode,
        warranty: form.warranty,
        dateIn: combine(form.dateInDate, form.dateInTime),
        promisedAt: combine(form.dueDate, form.dueTime),
        issue: form.issue,
        receiptNote: form.receiptNote, externalNote: form.externalNote, internalNote: form.internalNote,
      });
      navigate(`/service/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create.");
      setSaving(false);
    }
  };

  /* ------------------------------ STEP 1 ------------------------------ */
  if (step === "customer") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New service — find or create customer</h1>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className={`${panelClass} p-6`}>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Enter the customer's details to create a new record — or pick an existing match on the right.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>First name <span className="text-error-500">*</span></label><input className={inputClass} value={cust.firstName} onChange={(e) => setC("firstName", e.target.value)} autoFocus /></div>
              <div><label className={labelClass}>Last name</label><input className={inputClass} value={cust.lastName} onChange={(e) => setC("lastName", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Company</label><input className={inputClass} value={cust.company} onChange={(e) => setC("company", e.target.value)} /></div>
              <div><label className={labelClass}>Phone</label><input type="tel" className={inputClass} value={cust.phone} onChange={(e) => setC("phone", e.target.value)} /></div>
              <div><label className={labelClass}>Mobile</label><input type="tel" className={inputClass} value={cust.mobile} onChange={(e) => setC("mobile", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Email</label><input type="email" className={inputClass} value={cust.email} onChange={(e) => setC("email", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Address</label><input className={inputClass} value={cust.address} onChange={(e) => setC("address", e.target.value)} /></div>
              <div><label className={labelClass}>City</label><input className={inputClass} value={cust.city} onChange={(e) => setC("city", e.target.value)} /></div>
              <div><label className={labelClass}>Postal code</label><input className={inputClass} value={cust.postal} onChange={(e) => setC("postal", e.target.value)} /></div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400">
                  <input type="checkbox" checked={cust.contactConsent} onChange={(e) => setC("contactConsent", e.target.checked)} className="h-4 w-4" />
                  I have consent to contact this customer
                </label>
              </div>
            </div>
            {custError && <p className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{custError}</p>}
            <button onClick={createCustomer} disabled={creating} className="mt-5 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {creating ? "Creating…" : "Create customer & continue"}
            </button>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Possible matches</h3></div>
            {matches.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">Start typing a name or phone number — existing customers will show up here.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {matches.map((c) => (
                  <button key={c.id} type="button" onClick={() => useExisting(c)} className="block w-full px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <p className="text-sm font-semibold text-brand-500">{fullName(c)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{[c.phone, c.mobile, c.email].filter(Boolean).join(" · ") || "No contact"}</p>
                    {(c.address || c.city) && <p className="text-xs text-gray-500">{[c.address, c.city, c.postal].filter(Boolean).join(", ")}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ STEP 2 ------------------------------ */
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => { if (presetCustomer) navigate("/service"); else setStep("customer"); }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New service — details</h1>
      </div>

      <form onSubmit={createService} className={`${panelClass} space-y-5 p-6`}>
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
          <div>
            <p className="text-xs text-gray-500">Customer</p>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">{chosen ? fullName(chosen) : "—"}</p>
            {chosen && <p className="text-xs text-gray-500">{[chosen.phone, chosen.email].filter(Boolean).join(" · ")}</p>}
          </div>
          {!presetCustomer && <button type="button" onClick={() => { setChosen(null); setStep("customer"); }} className="text-xs font-medium text-brand-500 hover:text-brand-600">Change</button>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={labelClass}>Device &amp; model</label><input className={inputClass} value={form.device} onChange={(e) => setF("device", e.target.value)} /></div>
          <div><label className={labelClass}>IMEI / serial</label><input className={inputClass} value={form.deviceImei} onChange={(e) => setF("deviceImei", e.target.value)} /></div>
          <div><label className={labelClass}>Passcode</label><input className={inputClass} value={form.passcode} onChange={(e) => setF("passcode", e.target.value)} /></div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400">
          <input type="checkbox" checked={form.warranty} onChange={(e) => setF("warranty", e.target.checked)} className="h-4 w-4" />
          Under warranty
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Date in</label>
            <div className="flex gap-2">
              <input type="date" onClick={openPicker} className={inputClass} value={form.dateInDate} onChange={(e) => setF("dateInDate", e.target.value)} />
              <input type="time" step={900} onClick={openPicker} className={inputClass} value={form.dateInTime} onChange={(e) => setF("dateInTime", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Due</label>
            <div className="flex gap-2">
              <input type="date" onClick={openPicker} className={inputClass} value={form.dueDate} onChange={(e) => setF("dueDate", e.target.value)} />
              <input type="time" step={900} onClick={openPicker} className={inputClass} value={form.dueTime} onChange={(e) => setF("dueTime", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Problem reported <span className="text-error-500">*</span></label>
          <textarea rows={3} className={`${inputClass} h-auto`} value={form.issue} onChange={(e) => setF("issue", e.target.value)} />
        </div>

        <div><label className={labelClass}>Receipt note <span className="font-normal text-gray-400">(prints on the receipt)</span></label><textarea rows={2} className={`${inputClass} h-auto`} value={form.receiptNote} onChange={(e) => setF("receiptNote", e.target.value)} /></div>
        <div><label className={labelClass}>External note <span className="font-normal text-gray-400">(for the customer)</span></label><textarea rows={2} className={`${inputClass} h-auto`} value={form.externalNote} onChange={(e) => setF("externalNote", e.target.value)} /></div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={`${labelClass} mb-0`}>Internal note <span className="font-normal text-gray-400">(staff only)</span></label>
            <div className="flex items-center gap-2">
              <select value={notePos} onChange={(e) => setNotePos(e.target.value as "top" | "bottom")} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-900">
                <option value="top">To top</option>
                <option value="bottom">To bottom</option>
              </select>
              <button type="button" onClick={addTime} className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Add time</button>
            </div>
          </div>
          <textarea ref={internalRef} rows={4} className={`${inputClass} h-auto`} value={form.internalNote} onChange={(e) => setF("internalNote", e.target.value)} />
        </div>

        {error && <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>}

        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? "Creating…" : "Create service order"}
        </button>
      </form>
    </div>
  );
}