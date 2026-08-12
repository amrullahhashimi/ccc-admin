import { useEffect, useState } from "react";
import { useParams } from "react-router";

type Track = {
  /** The shop this repair belongs to — its own name, logo and contact details. */
  store?: {
    name: string;
    logo?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
  } | null;
  number: number;
  status: string;
  deviceMake?: string | null;
  deviceModel?: string | null;
  warranty?: boolean;
  dateIn?: string | null;
  promisedAt?: string | null;
  completedAt?: string | null;
  location?: string | null;
  customerName?: string;
  lineItems: { name: string; quantity: number; priceCents: number; totalCents: number }[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
};

const money = (c?: number | null) => (c == null ? "—" : "$" + (c / 100).toFixed(2));
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

// Customer-facing status labels + the timeline order.
const STEPS = [
  { keys: ["INTAKE"], label: "Received" },
  { keys: ["DIAGNOSING", "WAITING_PARTS"], label: "In progress" },
  { keys: ["READY"], label: "Ready" },
  { keys: ["COLLECTED"], label: "Picked up" },
];
const statusText = (s: string) => {
  switch (s) {
    case "INTAKE": return "Received";
    case "DIAGNOSING": return "In progress";
    case "WAITING_PARTS": return "Waiting for parts";
    case "READY": return "Ready for pickup";
    case "COLLECTED": return "Picked up";
    case "CANCELLED": return "Cancelled";
    default: return s;
  }
};
const currentStepIndex = (s: string) => STEPS.findIndex((step) => step.keys.includes(s));

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ok = true;
    fetch(`/api/track/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Not found");
        return r.json();
      })
      .then((d) => { if (ok) { setData(d); setLoading(false); } })
      .catch((e) => { if (ok) { setError(e.message); setLoading(false); } });
    return () => { ok = false; };
  }, [token]);

  const device = data ? [data.deviceMake, data.deviceModel].filter(Boolean).join(" ") : "";
  const cancelled = data?.status === "CANCELLED";
  const stepIdx = data ? currentStepIndex(data.status) : -1;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-lg">
        {/* header */}
        <div className="mb-6 text-center">
          {data?.store?.logo && (
            <img
              src={data.store.logo}
              alt={data.store.name}
              className="mx-auto mb-3 max-h-14 max-w-[220px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {data?.store?.name ?? "Repair tracking"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Repair status</p>
          {data?.store && (data.store.phone || data.store.website) && (
            <p className="mt-1 text-xs text-gray-400">
              {[data.store.phone, data.store.website].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading…</div>
        ) : error ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="font-medium text-gray-800 dark:text-white/90">We couldn't find that repair</p>
            <p className="mt-1 text-sm text-gray-500">Please check the link, or contact the store.</p>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* summary card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Service</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">#{data.number}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${cancelled ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"}`}>
                  {statusText(data.status)}
                </span>
              </div>
              <dl className="mt-5 space-y-2.5 text-sm">
                {device && <div className="flex justify-between"><dt className="text-gray-500">Device</dt><dd className="font-medium text-gray-800 dark:text-white/90">{device}</dd></div>}
                {data.location && <div className="flex justify-between"><dt className="text-gray-500">Location</dt><dd className="text-gray-800 dark:text-white/90">{data.location}</dd></div>}
                <div className="flex justify-between"><dt className="text-gray-500">Dropped off</dt><dd className="text-gray-800 dark:text-white/90">{fmtDate(data.dateIn)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Est. ready</dt><dd className="text-gray-800 dark:text-white/90">{fmtDate(data.promisedAt)}</dd></div>
                {data.warranty && <div className="flex justify-between"><dt className="text-gray-500">Warranty</dt><dd className="font-medium text-green-600">Covered</dd></div>}
              </dl>
            </div>

            {/* timeline */}
            {!cancelled && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <ol className="space-y-0">
                  {STEPS.map((step, i) => {
                    const done = i < stepIdx;
                    const active = i === stepIdx;
                    const last = i === STEPS.length - 1;
                    return (
                      <li key={step.label} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                            done ? "bg-brand-500 text-white" : active ? "bg-brand-500 text-white ring-4 ring-brand-500/20" : "bg-gray-200 text-gray-400 dark:bg-gray-700"
                          }`}>
                            {done ? "✓" : i + 1}
                          </span>
                          {!last && <span className={`w-0.5 flex-1 ${i < stepIdx ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"}`} style={{ minHeight: 28 }} />}
                        </div>
                        <div className={`pb-6 pt-0.5 ${last ? "pb-0" : ""}`}>
                          <p className={`text-sm font-medium ${done || active ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{step.label}</p>
                          {active && <p className="text-xs text-gray-500">Current stage</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* itemized */}
            {data.lineItems.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Items</p>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.lineItems.map((li, i) => (
                    <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-gray-800 dark:text-white/90">{li.name}{li.quantity > 1 ? ` ×${li.quantity}` : ""}</span>
                      <span className="tabular-nums text-gray-700 dark:text-gray-300">{money(li.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* cost */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd className="tabular-nums text-gray-800 dark:text-white/90">{money(data.subtotalCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">GST (5%)</dt><dd className="tabular-nums text-gray-800 dark:text-white/90">{money(data.gstCents)}</dd></div>
                <div className="flex justify-between border-t border-gray-100 pt-2.5 dark:border-gray-800"><dt className="font-medium text-gray-700 dark:text-gray-300">Total</dt><dd className="font-medium tabular-nums text-gray-800 dark:text-white/90">{money(data.totalCents)}</dd></div>
                {data.depositCents > 0 && <div className="flex justify-between"><dt className="text-gray-500">Deposit paid</dt><dd className="tabular-nums text-gray-800 dark:text-white/90">-{money(data.depositCents)}</dd></div>}
                <div className="flex justify-between border-t border-gray-100 pt-2.5 dark:border-gray-800"><dt className="text-base font-semibold text-gray-900 dark:text-white">Balance due</dt><dd className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{money(data.balanceCents)}</dd></div>
              </dl>
            </div>

            <p className="text-center text-xs text-gray-400">Questions? Give us a call or stop by the store.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}