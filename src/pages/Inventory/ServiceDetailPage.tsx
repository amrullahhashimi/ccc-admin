import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  service as serviceApi, products as productsApi, meta as metaApi,
  SERVICE_STATUSES, money,
  type Service, type ServiceLine, type Product, type Meta,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const lineTotal = (l: ServiceLine) => l.quantity * l.priceCents;
const pad = (n: number) => String(n).padStart(2, "0");
const splitDate = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const splitTime = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const combine = (date: string, time: string) => (date ? new Date(`${date}T${time || "00:00"}`).toISOString() : null);
const openPicker = (e: React.MouseEvent<HTMLInputElement>) => { try { (e.currentTarget as any).showPicker?.(); } catch { /* not supported */ } };
const stampNow = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/* ------------------------------ lines panel ------------------------------ */
function LinesPanel({ svc, onChanged }: { svc: Service; onChanged: () => void }) {
  const [tab, setTab] = useState<"part" | "labour">("part");
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [qty, setQty] = useState("1");
  const [partPrice, setPartPrice] = useState("");
  const [labourName, setLabourName] = useState("");
  const [labourPrice, setLabourPrice] = useState("");

  useEffect(() => {
    if (tab !== "part" || productQuery.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { productsApi.list({ q: productQuery }).then((r) => setResults(r.slice(0, 8))).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [productQuery, tab]);

  const addPart = async () => {
    if (!productId) return setError("Pick a product from the list.");
    setError("");
    try { await serviceApi.addLine(svc.id, { productId, quantity: qty, price: partPrice }); setProductId(""); setProductQuery(""); setResults([]); setQty("1"); setPartPrice(""); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not add part."); }
  };
  const addLabour = async () => {
    if (!labourName.trim()) return setError("Describe the labour.");
    setError("");
    try { await serviceApi.addLine(svc.id, { name: labourName, price: labourPrice, quantity: 1 }); setLabourName(""); setLabourPrice(""); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not add labour."); }
  };
  const removeLine = async (line: ServiceLine) => {
    if (!confirm(`Remove "${line.name}"?`)) return;
    try { await serviceApi.removeLine(line.id); onChanged(); } catch (err) { alert(err instanceof Error ? err.message : "Could not remove."); }
  };

  const parts = (svc.parts ?? []).filter((l) => l.productId);
  const labour = (svc.parts ?? []).filter((l) => !l.productId);
  const Row = ({ line }: { line: ServiceLine }) => (
    <tr>
      <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{line.name}{line.product?.sku && <span className="ml-2 text-xs text-gray-400">{line.product.sku}</span>}</td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{line.quantity}</td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(line.priceCents)}</td>
      <td className="px-5 py-3 text-right text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">{money(lineTotal(line))}</td>
      <td className="px-5 py-3 text-right"><button onClick={() => removeLine(line)} className="text-xs font-medium text-error-500 hover:text-error-600">Remove</button></td>
    </tr>
  );

  return (
    <div className={panelClass}>
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Parts & labour</h2></div>
      <div className="border-b border-gray-100 p-6 dark:border-gray-800">
        <div className="mb-4 flex gap-1">
          {(["part", "labour"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-brand-500 text-white" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{t === "part" ? "Add part" : "Add labour"}</button>
          ))}
        </div>
        {tab === "part" ? (
          <div className="space-y-3">
            <div className="relative">
              <input className={inputClass} placeholder="Search inventory…" value={productQuery} onChange={(e) => { setProductQuery(e.target.value); setProductId(""); }} />
              {results.length > 0 && !productId && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {results.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setProductId(p.id); setProductQuery(p.name); setPartPrice((p.salePriceCents / 100).toFixed(2)); setResults([]); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                      <span className="text-gray-800 dark:text-white/90">{p.name}</span><span className="text-gray-500">{money(p.salePriceCents)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <div className="w-24"><label className={labelClass}>Qty</label><input type="number" className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              <div className="w-32"><label className={labelClass}>Price ea.</label><input type="number" step="0.01" className={inputClass} value={partPrice} onChange={(e) => setPartPrice(e.target.value)} /></div>
              <div className="flex items-end"><button type="button" onClick={addPart} className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">Add part</button></div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="flex-1"><label className={labelClass}>Labour</label><input className={inputClass} placeholder="Diagnostic, screen replacement…" value={labourName} onChange={(e) => setLabourName(e.target.value)} /></div>
            <div className="w-32"><label className={labelClass}>Price</label><input type="number" step="0.01" className={inputClass} value={labourPrice} onChange={(e) => setLabourPrice(e.target.value)} /></div>
            <div className="flex items-end"><button type="button" onClick={addLabour} className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">Add labour</button></div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
      </div>
      {(svc.parts?.length ?? 0) === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">No parts or labour added yet.</p>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {parts.length > 0 && (<><tr><td colSpan={5} className="bg-gray-50 px-5 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-white/[0.02]">Parts</td></tr>{parts.map((l) => <Row key={l.id} line={l} />)}</>)}
            {labour.length > 0 && (<><tr><td colSpan={5} className="bg-gray-50 px-5 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-white/[0.02]">Labour</td></tr>{labour.map((l) => <Row key={l.id} line={l} />)}</>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------------------- page -------------------------------- */
export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, user } = useAuth();

  const [svc, setSvc] = useState<Service | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    device: "", deviceImei: "", passcode: "",
    warranty: false,
    dateInDate: "", dateInTime: "", dueDate: "", dueTime: "",
    issue: "", diagnosis: "",
    receiptNote: "", externalNote: "", internalNote: "",
    status: "INTAKE", locationId: "", deposit: "",
  });

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const [notePos, setNotePos] = useState<"top" | "bottom">("top");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await serviceApi.get(id);
      setSvc(s);
      setForm({
        device: [s.deviceMake, s.deviceModel].filter(Boolean).join(" "), deviceImei: s.deviceImei ?? "", passcode: s.passcode ?? "",
        warranty: !!s.warranty,
        dateInDate: splitDate(s.dateIn), dateInTime: splitTime(s.dateIn),
        dueDate: splitDate(s.promisedAt), dueTime: splitTime(s.promisedAt),
        issue: s.issue, diagnosis: s.diagnosis ?? "",
        receiptNote: s.receiptNote ?? "", externalNote: s.externalNote ?? "", internalNote: s.internalNote ?? "",
        status: s.status, locationId: s.locationId ?? "", deposit: s.depositCents ? (s.depositCents / 100).toFixed(2) : "",
      });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load."); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); metaApi.all().then(setMeta).catch(() => {}); }, [load]);

  const set = (k: keyof typeof form, v: string | boolean) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    if (!id) return;
    try {
      await serviceApi.update(id, {
        deviceMake: "", deviceModel: form.device, deviceImei: form.deviceImei, passcode: form.passcode,
        warranty: form.warranty,
        dateIn: combine(form.dateInDate, form.dateInTime),
        promisedAt: combine(form.dueDate, form.dueTime),
        issue: form.issue, diagnosis: form.diagnosis,
        receiptNote: form.receiptNote, externalNote: form.externalNote, internalNote: form.internalNote,
        deposit: form.deposit,
      });
      setSaved(true); load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); }
  };

  const setStatus = async (status: string) => { if (!id) return; set("status", status); try { await serviceApi.update(id, { status }); load(); } catch (err) { alert(err instanceof Error ? err.message : "Could not update status."); } };
  const remove = async () => { if (!svc || !id || !confirm(`Delete service #${svc.number}?`)) return; try { await serviceApi.remove(id); navigate("/service"); } catch (err) { alert(err instanceof Error ? err.message : "Could not delete."); } };

  const addTime = () => {
    const stamp = `${user?.name ?? "Staff"} (${stampNow()}): `;
    setForm((f) => { const cur = f.internalNote; const next = notePos === "top" ? stamp + (cur ? "\n" + cur : "") : (cur ? cur + "\n" : "") + stamp; return { ...f, internalNote: next }; });
    setSaved(false);
    setTimeout(() => { const ta = internalRef.current; if (!ta) return; ta.focus(); const pos = notePos === "top" ? stamp.length : ta.value.length; ta.setSelectionRange(pos, pos); }, 0);
  };

  if (loading) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;
  if (error || !svc) return <p className="p-10 text-center text-sm text-error-500">{error || "Not found."}</p>;

  const customerName = svc.customer ? [svc.customer.firstName, svc.customer.lastName].filter(Boolean).join(" ") : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Service #{svc.number}</h1><p className="mt-0.5 text-xs text-gray-500">{customerName}{svc.customer?.phone ? ` · ${svc.customer.phone}` : ""}</p></div>
        </div>
        <select value={form.status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-white/90 dark:bg-gray-900">
          {SERVICE_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Device & problem</h2></div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={labelClass}>Device &amp; model</label><input className={inputClass} value={form.device} onChange={(e) => set("device", e.target.value)} /></div>
              <div><label className={labelClass}>IMEI / serial</label><input className={inputClass} value={form.deviceImei} onChange={(e) => set("deviceImei", e.target.value)} /></div>
              <div><label className={labelClass}>Passcode</label><input className={inputClass} value={form.passcode} onChange={(e) => set("passcode", e.target.value)} /></div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400"><input type="checkbox" checked={form.warranty} onChange={(e) => set("warranty", e.target.checked)} className="h-4 w-4" />Under warranty</label>
              </div>
              <div>
                <label className={labelClass}>Date in</label>
                <div className="flex gap-2"><input type="date" onClick={openPicker} className={inputClass} value={form.dateInDate} onChange={(e) => set("dateInDate", e.target.value)} /><input type="time" step={900} onClick={openPicker} className={inputClass} value={form.dateInTime} onChange={(e) => set("dateInTime", e.target.value)} /></div>
              </div>
              <div>
                <label className={labelClass}>Due</label>
                <div className="flex gap-2"><input type="date" onClick={openPicker} className={inputClass} value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /><input type="time" step={900} onClick={openPicker} className={inputClass} value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} /></div>
              </div>
              <div className="sm:col-span-2"><label className={labelClass}>Problem reported</label><textarea rows={2} className={`${inputClass} h-auto`} value={form.issue} onChange={(e) => set("issue", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Diagnosis</label><textarea rows={2} className={`${inputClass} h-auto`} value={form.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button onClick={save} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Save changes</button>
              {saved && <span className="text-sm text-success-600">Saved</span>}
            </div>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Notes</h2></div>
            <div className="space-y-4 p-6">
              <div><label className={labelClass}>Receipt note <span className="font-normal text-gray-400">(prints on the receipt)</span></label><textarea rows={2} className={`${inputClass} h-auto`} value={form.receiptNote} onChange={(e) => set("receiptNote", e.target.value)} /></div>
              <div><label className={labelClass}>External note <span className="font-normal text-gray-400">(for the customer)</span></label><textarea rows={2} className={`${inputClass} h-auto`} value={form.externalNote} onChange={(e) => set("externalNote", e.target.value)} /></div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className={`${labelClass} mb-0`}>Internal note <span className="font-normal text-gray-400">(staff only)</span></label>
                  <div className="flex items-center gap-2">
                    <select value={notePos} onChange={(e) => setNotePos(e.target.value as "top" | "bottom")} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-900"><option value="top">To top</option><option value="bottom">To bottom</option></select>
                    <button type="button" onClick={addTime} className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Add time</button>
                  </div>
                </div>
                <textarea ref={internalRef} rows={5} className={`${inputClass} h-auto`} value={form.internalNote} onChange={(e) => set("internalNote", e.target.value)} />
              </div>
              <button onClick={save} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Save notes</button>
            </div>
          </div>

          <LinesPanel svc={svc} onChanged={load} />
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Totals</h3></div>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              {[["Parts", svc.partsCents ?? 0], ["Labour", svc.labourCents ?? 0]].map(([l, v]) => (<div key={l as string} className="flex items-center justify-between px-5 py-2.5"><dt className="text-sm text-gray-500">{l as string}</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{money(v as number)}</dd></div>))}
              <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm font-semibold text-gray-800 dark:text-white/90">Total</dt><dd className="text-base font-semibold tabular-nums text-gray-800 dark:text-white/90">{money(svc.totalCents ?? 0)}</dd></div>
            </dl>
          </div>
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Assignment</h3></div>
            <div className="space-y-4 p-5">
              <div><label className={labelClass}>Location</label><select className={inputClass} value={form.locationId} onChange={(e) => { set("locationId", e.target.value); if (id) serviceApi.update(id, { locationId: e.target.value }).then(load); }}><option value="">—</option>{meta?.locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}</select></div>
              <div><label className={labelClass}>Deposit taken</label><div className="flex gap-2"><input type="number" step="0.01" className={inputClass} value={form.deposit} onChange={(e) => set("deposit", e.target.value)} /><button onClick={save} className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Save</button></div></div>
            </div>
          </div>
          {can("OWNER", "MANAGER") && <button onClick={remove} className="w-full rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10">Delete service order</button>}
        </div>
      </div>
    </div>
  );
}