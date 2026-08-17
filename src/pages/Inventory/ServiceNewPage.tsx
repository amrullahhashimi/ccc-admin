import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  service as serviceApi, customers as customersApi, products as productsApi, meta as metaApi,
  SERVICE_STATUSES, money,
  type Service, type ServiceLine, type Customer, type Product, type Meta,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import { printInvoice } from "../Utils/Printservice";
import { printServiceTag } from "../Inventory/printLabel";
import SignaturePad from "./SignaturePad";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const panelClass = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const fullName = (c: Customer) => [c.firstName, c.lastName].filter(Boolean).join(" ");
const pad = (n: number) => String(n).padStart(2, "0");
const nowParts = () => {
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`; // exact current time
  return { date, t };
};
const splitDate = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const splitTime = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const combine = (date: string, time: string) => (date ? new Date(`${date}T${time || "00:00"}`).toISOString() : null);
const stampNow = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const lineTotal = (l: ServiceLine) => l.quantity * l.priceCents;

// Build "HH:MM" options every `stepMin` minutes across the day.
const timeOptions = (stepMin: number) => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += stepMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const value = `${pad(h)}:${pad(mm)}`;
    const h12 = ((h + 11) % 12) + 1;
    const label = `${h12}:${pad(mm)} ${h < 12 ? "AM" : "PM"}`;
    out.push({ value, label });
  }
  return out;
};
const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
const OPTS_5 = timeOptions(5);
const OPTS_15 = timeOptions(15);

// Custom time picker: text field + clock icon + scrollable stepped list, with type-to-filter.
function TimePicker({ value, stepOptions, onChange }: { value: string; stepOptions: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const display = value ? fmt12(value) : "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (v: string) => { onChange(v); setOpen(false); };

  // The list should open near the current time. If the value is off-grid (e.g. 3:08),
  // anchor on the first option at or after it so the view starts there, not at 12:00 AM.
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return Number.isNaN(h) ? -1 : h * 60 + m; };
  const cur = toMin(value);
  const anchorIdx = Math.max(0, stepOptions.findIndex((o) => toMin(o.value) >= cur));

  // When the list opens, scroll it internally to the current time — without moving the page.
  useEffect(() => {
    if (!open) return;
    const ul = listRef.current;
    if (!ul) return;
    const row = ul.children[anchorIdx] as HTMLElement | undefined;
    if (row) ul.scrollTop = row.offsetTop - 4;
  }, [open, anchorIdx]);

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        className={inputClass + " pr-9 cursor-pointer"}
        value={display}
        readOnly
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
      <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Open time list">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      </button>
      {open && (
        <ul ref={listRef} className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {stepOptions.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  className={`block w-full px-4 py-2 text-left text-sm ${selected ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/15" : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ lines panel (edit only) ------------------------------ */
function LinesPanel({ svc, onChanged }: { svc: Service; onChanged: () => void }) {
  const notify = useNotify();
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
    const ok = await notify.confirm({
      title: `Remove "${line.name}"?`,
      message: "It comes off this service order.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try { await serviceApi.removeLine(line.id); onChanged(); }
    catch (err) { notify.error("Could not remove.", { message: err instanceof Error ? err.message : undefined }); }
  };

  const parts = (svc.parts ?? []).filter((l) => l.productId);
  const labour = (svc.parts ?? []).filter((l) => !l.productId);
  const Row = ({ line }: { line: ServiceLine }) => (
    <tr>
      <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{line.name}{line.product?.sku && <span className="ml-2 text-xs text-gray-400">{line.product.sku}</span>}</td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{line.quantity}</td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(line.priceCents)}</td>
      <td className="px-5 py-3 text-right text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">{money(lineTotal(line))}</td>
      <td className="px-5 py-3 text-right"><button type="button" onClick={() => removeLine(line)} className="text-xs font-medium text-error-500 hover:text-error-600">Remove</button></td>
    </tr>
  );

  return (
    <div className={panelClass}>
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Parts & labour</h2></div>
      <div className="border-b border-gray-100 p-6 dark:border-gray-800">
        <div className="mb-4 flex gap-1">
          {(["part", "labour"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); setError(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-brand-500 text-white" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{t === "part" ? "Add part" : "Add labour"}</button>
          ))}
        </div>
        {tab === "part" ? (
          <div className="space-y-3">
            <div className="relative">
              <input className={inputClass} value={productQuery} onChange={(e) => { setProductQuery(e.target.value); setProductId(""); }} />
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
            <div className="flex-1"><label className={labelClass}>Labour</label><input className={inputClass} value={labourName} onChange={(e) => setLabourName(e.target.value)} /></div>
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

// Custom date picker: field + calendar icon + month grid popover. Value is "YYYY-MM-DD".
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (v: string) => { const [y, m, d] = v.split("-").map(Number); return y ? new Date(y, m - 1, d) : new Date(); };

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? parseYmd(value) : new Date()));
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open && value) setView(parseYmd(value)); }, [open]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a 6x7 grid of dates (including leading/trailing days).
  const cells: Date[] = [];
  for (let i = 0; i < startDow; i++) cells.push(new Date(year, month, i - startDow + 1));
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(new Date(year, month, daysInMonth + (cells.length % 7)));

  const todayStr = ymd(new Date());
  const label = value ? ymd(parseYmd(value)) : "";

  const pick = (d: Date) => { onChange(ymd(d)); setOpen(false); };

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        className={inputClass + " pr-9 cursor-pointer"}
        value={label}
        readOnly
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
      <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Open calendar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{MONTHS[month]} {year}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Previous month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Next month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
            </div>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {DOW.map((d) => (<span key={d} className="text-center text-[11px] font-medium text-gray-400">{d}</span>))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === month;
              const str = ymd(d);
              const isSel = str === value;
              const isToday = str === todayStr;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={`h-8 rounded-md text-sm transition ${
                    isSel ? "bg-brand-500 font-medium text-white"
                    : isToday ? "border border-brand-400 text-brand-600 dark:text-brand-400"
                    : inMonth ? "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                    : "text-gray-300 hover:bg-gray-50 dark:text-gray-600 dark:hover:bg-white/5"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Clear</button>
            <button type="button" onClick={() => pick(new Date())} className="text-xs font-medium text-brand-500 hover:text-brand-600">Today</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom select styled like the time/date pickers: field + chevron + styled list.
function SelectPicker({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        className={inputClass + " pr-9 cursor-pointer"}
        value={current?.label ?? ""}
        readOnly
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
      <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Open list">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value || "none"}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`block w-full px-4 py-2 text-left text-sm ${selected ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/15" : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ================================ the page ================================ */
export default function ServiceNewPage() {
  const { id } = useParams<{ id: string }>();       // set when editing (/service/:id)
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const notify = useNotify();
  const { store } = useStore();
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId");

  const [svc, setSvc] = useState<Service | null>(null);       // the loaded order (edit)
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(isEdit);

  // customer create form (step 1)
  const [cust, setCust] = useState({ firstName: "", lastName: "", company: "", phone: "", mobile: "", email: "", address: "", city: "Calgary", postal: "", contactConsent: false });
  const setC = (k: keyof typeof cust, v: string | boolean) => setCust((f) => ({ ...f, [k]: v }));
  const [creating, setCreating] = useState(false);
  const [custError, setCustError] = useState("");
  const [matches, setMatches] = useState<Customer[]>([]);

  // service form
  const initNow = nowParts();
  const [form, setForm] = useState({
    device: "", deviceImei: "", passcode: "",
    warranty: false,
    dateInDate: initNow.date, dateInTime: initNow.t,
    dueDate: initNow.date, dueTime: initNow.t,
    issue: "",
    receiptNote: "", internalNote: "",
    status: "INTAKE", locationId: "", deposit: "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const [signing, setSigning] = useState(false);
  const dirtyRef = useRef(false);
  const setF = (k: keyof typeof form, v: string | boolean) => { dirtyRef.current = true; setForm((f) => ({ ...f, [k]: v })); };

  const [error, setError] = useState("");

  const internalRef = useRef<HTMLTextAreaElement>(null);

  // Load meta always; load the order when editing.
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await serviceApi.get(id);
      dirtyRef.current = false;
      setSvc(s);
      setForm({
        device: [s.deviceMake, s.deviceModel].filter(Boolean).join(" "), deviceImei: s.deviceImei ?? "", passcode: s.passcode ?? "",
        warranty: !!s.warranty,
        dateInDate: splitDate(s.dateIn), dateInTime: splitTime(s.dateIn),
        dueDate: splitDate(s.promisedAt), dueTime: splitTime(s.promisedAt),
        issue: s.issue,
        receiptNote: s.receiptNote ?? "", internalNote: s.internalNote ?? "",
        status: s.status, locationId: s.locationId ?? "", deposit: s.depositCents ? (s.depositCents / 100).toFixed(2) : "",
      });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load."); }
    setLoading(false);
  }, [id]);

  useEffect(() => { metaApi.all().then(setMeta).catch(() => {}); }, []);

  // Default the location to Chinatown when an order has none set yet.
  useEffect(() => {
    if (!isEdit || !id || !meta || form.locationId) return;
    const chinatown = meta.locations.find((l) => /chinatown/i.test(l.name));
    if (chinatown) {
      setForm((f) => ({ ...f, locationId: chinatown.id }));
      serviceApi.update(id, { locationId: chinatown.id }).then(load).catch(() => {});
    }
  }, [meta, isEdit, id, form.locationId]);
  useEffect(() => { if (isEdit) load(); }, [isEdit, load]);

  // Create a draft service order for a customer, then open it (edit mode shows everything).
  const createDraft = async (customerId: string) => {
    setCreating(true); setCustError(""); setError("");
    try {
      const n = nowParts();
      const created = await serviceApi.create({ customerId, issue: "", dateIn: combine(n.date, n.t), promisedAt: combine(n.date, n.t) });
      navigate(`/service/${created.id}`, { replace: true });
    } catch (err) {
      setCustError(err instanceof Error ? err.message : "Could not start service order.");
      setCreating(false);
    }
  };

  // Arrived from a customer's page — create the draft order right away.
  useEffect(() => {
    if (isEdit || !presetCustomer) return;
    createDraft(presetCustomer);
    // eslint-disable-next-line
  }, [isEdit, presetCustomer]);

  // live customer matches (create step 1)
  useEffect(() => {
    if (isEdit) return;
    const q = [cust.firstName, cust.lastName].filter(Boolean).join(" ").trim() || cust.phone.trim() || cust.mobile.trim();
    if (q.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => { customersApi.list(q).then((r) => setMatches(r.slice(0, 8))).catch(() => setMatches([])); }, 300);
    return () => clearTimeout(t);
  }, [cust.firstName, cust.lastName, cust.phone, cust.mobile, isEdit]);


  const useExisting = (c: Customer) => createDraft(c.id);
  const createCustomer = async () => {
    setCreating(true); setCustError("");
    try { const created = await customersApi.create(cust); await createDraft(created.id); }
    catch (err) { setCustError(err instanceof Error ? err.message : "Could not create customer."); setCreating(false); }
  };

  const addTime = () => {
    const stamp = `${user?.name ?? "Staff"} (${stampNow()}): `;
    dirtyRef.current = true;
    setForm((f) => { const cur = f.internalNote; const next = stamp + (cur ? "\n" + cur : ""); return { ...f, internalNote: next }; });
    setTimeout(() => { const ta = internalRef.current; if (!ta) return; ta.focus(); ta.setSelectionRange(stamp.length, stamp.length); }, 0);
  };

  const payload = () => ({
    deviceMake: "", deviceModel: form.device, deviceImei: form.deviceImei, passcode: form.passcode,
    warranty: form.warranty,
    dateIn: combine(form.dateInDate, form.dateInTime),
    promisedAt: combine(form.dueDate, form.dueTime),
    issue: form.issue,
    receiptNote: form.receiptNote, internalNote: form.internalNote,
    deposit: form.deposit,
  });

  /**
   * The loaded order with whatever the form shows right now laid over it.
   * Autosave only lands 800ms after the last keystroke, so printing straight
   * after typing would otherwise put the previous values on the tag/invoice.
   */
  const printable = (s: Service): Service => ({
    ...s,
    deviceMake: null,
    deviceModel: form.device || null,
    deviceImei: form.deviceImei || null,
    passcode: form.passcode || null,
    issue: form.issue,
    receiptNote: form.receiptNote || null,
    dateIn: combine(form.dateInDate, form.dateInTime) ?? s.dateIn,
    promisedAt: combine(form.dueDate, form.dueTime) ?? s.promisedAt,
    depositCents: form.deposit === "" ? s.depositCents : Math.round(parseFloat(form.deposit) * 100) || 0,
  });

  // Save (edit)
  const save = async () => {
    if (!id) return;
    setSaveState("saving");
    try { setSvc(await serviceApi.update(id, payload())); dirtyRef.current = false; setSaveState("saved"); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save."); setSaveState("idle"); }
  };

  // Auto-save (edit mode only): 800ms after the last change, save quietly.
  useEffect(() => {
    if (!isEdit || loading) return;
    if (!dirtyRef.current) return;      // don't save on the initial load
    setSaveState("saving");
    const t = setTimeout(async () => {
      try { setSvc(await serviceApi.update(id!, payload())); dirtyRef.current = false; setSaveState("saved"); }
      catch { setSaveState("idle"); }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [form.device, form.deviceImei, form.passcode, form.warranty, form.dateInDate, form.dateInTime, form.dueDate, form.dueTime, form.issue, form.receiptNote, form.internalNote, form.deposit]);
  const setStatus = async (status: string) => {
    if (!id) return;
    setF("status", status);
    try { await serviceApi.update(id, { status }); load(); }
    catch (err) { notify.error("Could not update status.", { message: err instanceof Error ? err.message : undefined }); }
  };
  const remove = async () => {
    if (!svc || !id) return;
    const ok = await notify.confirm({
      title: `Delete service #${svc.number}?`,
      message: "The order and everything on it are gone for good.",
      confirmText: "Delete",
      variant: "error",
    });
    if (!ok) return;
    try { await serviceApi.remove(id); notify.success(`Service #${svc.number} deleted.`); navigate("/service"); }
    catch (err) { notify.error("Could not delete.", { message: err instanceof Error ? err.message : undefined }); }
  };

  const saveSignature = async (dataUrl: string) => {
    if (!id) return;
    setSigning(false);
    try { await serviceApi.update(id, { signatureData: dataUrl }); load(); }
    catch (err) { notify.error("Could not save signature.", { message: err instanceof Error ? err.message : undefined }); }
  };

  const copyTrack = async () => {
    if (!svc?.trackToken) return;
    const url = `${window.location.origin}/track/${svc.trackToken}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this tracking link:", url); }
  };

  if (isEdit && loading) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;
  if (isEdit && (error && !svc)) return <p className="p-10 text-center text-sm text-error-500">{error}</p>;

  /* ----------- CREATE — STEP 1: find/create customer ----------- */
  if (!isEdit) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New service — choose customer</h1>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className={`${panelClass} p-6`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>First name</label><input className={inputClass} value={cust.firstName} onChange={(e) => setC("firstName", e.target.value)} autoFocus /></div>
              <div><label className={labelClass}>Last name</label><input className={inputClass} value={cust.lastName} onChange={(e) => setC("lastName", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Company</label><input className={inputClass} value={cust.company} onChange={(e) => setC("company", e.target.value)} /></div>
              <div><label className={labelClass}>Phone</label><input type="tel" className={inputClass} value={cust.phone} onChange={(e) => setC("phone", e.target.value)} /></div>
              <div><label className={labelClass}>Mobile</label><input type="tel" className={inputClass} value={cust.mobile} onChange={(e) => setC("mobile", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Email</label><input type="email" className={inputClass} value={cust.email} onChange={(e) => setC("email", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Address</label><input className={inputClass} value={cust.address} onChange={(e) => setC("address", e.target.value)} /></div>
              <div><label className={labelClass}>City</label><input className={inputClass} value={cust.city} onChange={(e) => setC("city", e.target.value)} /></div>
              <div><label className={labelClass}>Postal code</label><input className={inputClass} value={cust.postal} onChange={(e) => setC("postal", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400"><input type="checkbox" checked={cust.contactConsent} onChange={(e) => setC("contactConsent", e.target.checked)} className="h-4 w-4" />I have consent to contact this customer</label></div>
            </div>
            {custError && <p className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{custError}</p>}
            <button onClick={createCustomer} disabled={creating} className="mt-5 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">{creating ? "Opening…" : "Create customer & open service"}</button>
          </div>
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Possible matches</h3></div>
            {matches.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">Start typing a name or phone number — existing customers show up here.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {matches.map((c) => (
                  <button key={c.id} type="button" onClick={() => useExisting(c)} className="block w-full px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <p className="text-sm font-semibold text-brand-500">{fullName(c)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{[c.phone, c.mobile, c.email].filter(Boolean).join(" · ") || "No contact"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ----------- DETAILS (create step 2 OR edit) ----------- */
  const headingCustomer = svc?.customer ? [svc.customer.firstName, svc.customer.lastName].filter(Boolean).join(" ") : "—";

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/service")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{isEdit ? `Service #${svc?.number}` : "New service — details"}</h1>
            <p className="mt-0.5 text-xs text-gray-500">{headingCustomer}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isEdit && (
            <span className="text-xs text-gray-400">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
            </span>
          )}
          {isEdit && svc && (
            <>
              <button type="button" onClick={() => printServiceTag(printable(svc), store)} className="h-11 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">Print tag</button>
              <button type="button" onClick={() => printInvoice(printable(svc), { store, trackUrl: svc.trackToken ? `${window.location.origin}/track/${svc.trackToken}` : undefined })} className="h-11 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">Print invoice</button>
            </>
          )}
          {isEdit && (
            <select value={form.status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-white/90 dark:bg-gray-900">
              {SERVICE_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          )}
        </div>
      </div>

      <div className={isEdit ? "grid gap-5 lg:grid-cols-[1fr_300px]" : ""}>
        {/* main column */}
        <div className="space-y-5">
          <div className={`${panelClass} space-y-5 p-6`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={labelClass}>Device &amp; model</label><input className={inputClass} value={form.device} onChange={(e) => setF("device", e.target.value)} /></div>
              <div><label className={labelClass}>IMEI / serial</label><input className={inputClass} value={form.deviceImei} onChange={(e) => setF("deviceImei", e.target.value)} /></div>
              <div><label className={labelClass}>Passcode</label><input className={inputClass} value={form.passcode} onChange={(e) => setF("passcode", e.target.value)} /></div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-400"><input type="checkbox" checked={form.warranty} onChange={(e) => setF("warranty", e.target.checked)} className="h-4 w-4" />Under warranty</label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Date in</label><div className="flex gap-2"><DatePicker value={form.dateInDate} onChange={(v) => setF("dateInDate", v)} /><TimePicker value={form.dateInTime} stepOptions={OPTS_5} onChange={(v) => setF("dateInTime", v)} /></div></div>
              <div><label className={labelClass}>Due</label><div className="flex gap-2"><DatePicker value={form.dueDate} onChange={(v) => setF("dueDate", v)} /><TimePicker value={form.dueTime} stepOptions={OPTS_15} onChange={(v) => setF("dueTime", v)} /></div></div>
            </div>

            <div><label className={labelClass}>Problem reported</label><textarea rows={2} className={`${inputClass} h-auto`} value={form.issue} onChange={(e) => setF("issue", e.target.value)} /></div>

            <div><label className={labelClass}>Receipt note <span className="font-normal text-gray-400">(prints on the receipt)</span></label><textarea rows={2} className={`${inputClass} h-auto`} value={form.receiptNote} onChange={(e) => setF("receiptNote", e.target.value)} /></div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className={`${labelClass} mb-0`}>Internal note <span className="font-normal text-gray-400">(staff only)</span></label>
                <button type="button" onClick={addTime} className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Add time</button>
              </div>
              <textarea ref={internalRef} rows={4} className={`${inputClass} h-auto`} value={form.internalNote} onChange={(e) => setF("internalNote", e.target.value)} />
            </div>

            {isEdit && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>Location</label><SelectPicker value={form.locationId} options={[{ value: "", label: "—" }, ...(meta?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))]} onChange={(v) => { setF("locationId", v); if (id) serviceApi.update(id, { locationId: v }).then(load); }} /></div>
                <div><label className={labelClass}>Deposit taken</label><input type="number" step="0.01" className={inputClass} value={form.deposit} onChange={(e) => setF("deposit", e.target.value)} /></div>
              </div>
            )}

            {error && <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>}

          </div>

          {isEdit && svc && <LinesPanel svc={svc} onChanged={load} />}
        </div>

        {/* totals sidebar (edit only) */}
        {isEdit && svc && (
          <div className="space-y-5">
            <div className={`${panelClass} lg:sticky lg:top-4`}>
              {(() => {
                const subtotal = svc.totalCents ?? 0;
                const gst = Math.round(subtotal * 0.05);
                const deposit = svc.depositCents ?? 0;
                const grand = subtotal + gst - deposit;
                return (
                  <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                    <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm text-gray-500">Labour</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{money(svc.labourCents ?? 0)}</dd></div>
                    <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm text-gray-500">Parts</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{money(svc.partsCents ?? 0)}</dd></div>
                    <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm text-gray-500">Subtotal</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{money(subtotal)}</dd></div>
                    <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm text-gray-500">GST (5%)</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{money(gst)}</dd></div>
                    {deposit > 0 && <div className="flex items-center justify-between px-5 py-3"><dt className="text-sm text-gray-500">Deposit</dt><dd className="text-sm tabular-nums text-gray-700 dark:text-gray-300">-{money(deposit)}</dd></div>}
                    <div className="flex items-center justify-between px-5 py-4"><dt className="text-base font-semibold text-gray-800 dark:text-white/90">Total</dt><dd className="text-lg font-semibold tabular-nums text-gray-800 dark:text-white/90">{money(grand)}</dd></div>
                  </dl>
                );
              })()}
            </div>

            <button type="button" onClick={() => setSigning(true)} className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${svc.signatureData ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/15" : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"}`}>
              {svc.signatureData ? (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Signed</>) : "Get signature"}
            </button>

            {svc.signatureData && (
              <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.02]">
                <p className="mb-2 text-xs text-gray-500">Signed{svc.signedAt ? ` \u00b7 ${new Date(svc.signedAt).toLocaleDateString()}` : ""}</p>
                <img src={svc.signatureData} alt="Signature" className="h-16 w-full object-contain" />
              </div>
            )}

            {svc.trackToken && (
              <button type="button" onClick={copyTrack} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">
                {copied ? "Link copied!" : "Copy tracking link"}
              </button>
            )}

            {can("OWNER", "MANAGER") && <button type="button" onClick={remove} className="w-full rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10">Delete service order</button>}
          </div>
        )}
      </div>
      {signing && <SignaturePad onSave={saveSignature} onClose={() => setSigning(false)} />}
    </form>
  );
}