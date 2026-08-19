import { useEffect, useRef, useState } from "react";
import {
  stores,
  type CloverEnv,
  type CloverForm,
  type CloverStatus,
  type LogoSlot,
  type Store,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";
import RegisterSalesCard from "./RegisterSalesCard";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

/** Slots whose artwork sits on a dark background — preview them that way. */
const DARK_SLOTS = new Set(["logoDark", "iconDark"]);

type Logos = Record<string, string | null>;

type Form = {
  name: string;
  phone: string;
  website: string;
  address: string;
  serviceTerms: string;
  labelWidthMm: string;
  labelHeightMm: string;
};

const toForm = (s: Store): Form => ({
  name: s.name ?? "",
  phone: s.phone ?? "",
  website: s.website ?? "",
  address: s.address ?? "",
  serviceTerms: s.serviceTerms ?? "",
  labelWidthMm: String(s.labelWidthMm ?? 50),
  labelHeightMm: String(s.labelHeightMm ?? 25),
});

/** One upload slot: preview on the right background, plus what it's for. */
function LogoRow({
  spec,
  value,
  dark,
  mayEdit,
  onPick,
  onClear,
}: {
  spec: LogoSlot;
  value: string | null;
  dark: boolean;
  mayEdit: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div
        className={`flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
          dark
            ? "border-gray-700 bg-gray-900"
            : "border-dashed border-gray-300 bg-gray-50 dark:bg-white"
        }`}
      >
        {value ? (
          <img src={value} alt={spec.label} className="max-h-14 max-w-28 object-contain" />
        ) : (
          <span className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>None</span>
        )}
      </div>

      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">{spec.label}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{spec.use}</p>
        <p className="mt-1 text-xs text-gray-400">
          Shown at {spec.width}×{spec.height}px — supply {spec.width * 2}×{spec.height * 2}px or an
          SVG. Max {spec.maxKb} KB.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = ""; // so re-picking the same file still fires
        }}
      />

      {mayEdit && (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {value ? "Replace" : "Choose"}
          </button>
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-error-500 hover:text-error-600"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================ connect to Clover ============================ */

const CLOVER_ENVS: { value: CloverEnv; label: string }[] = [
  { value: "production", label: "Production — your real merchant account" },
  { value: "sandbox", label: "Sandbox — Clover's test account" },
];

const blankClover = (s?: CloverStatus | null): CloverForm => ({
  env: s?.env ?? "production",
  merchantId: s?.merchantId ?? "",
  token: "", // never prefilled — the server only ever sends back the last four
});

/** Connected or not, at a glance, without reading the fields below. */
function CloverPill({ status }: { status: CloverStatus | null }) {
  if (!status) return null;

  const [tone, text] = status.connected
    ? (["bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400", "Connected"] as const)
    : (["bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400", "Not connected"] as const);

  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{text}</span>;
}

/**
 * Connect this store to a Clover merchant account.
 *
 * Its own card with its own buttons rather than part of the page's Save, for
 * two reasons: saving here checks the credentials against Clover before
 * writing anything, and the API token is write-only — the form can't
 * round-trip a value the server never sends it.
 */
function CloverCard({ mayEdit }: { mayEdit: boolean }) {
  const notify = useNotify();

  const [status, setStatus] = useState<CloverStatus | null>(null);
  const [form, setForm] = useState<CloverForm>(blankClover());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    stores
      .clover()
      .then((s) => {
        setStatus(s);
        setForm(blankClover(s));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load your Clover settings.")
      );
  }, []);

  const set = <K extends keyof CloverForm>(k: K, v: CloverForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const next = await stores.saveClover(form);
      setStatus(next);
      setForm(blankClover(next));
      notify.success("Connected to Clover", {
        message: next.merchantName ? `Signed in to ${next.merchantName}.` : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect.";
      setError(message);
      notify.error("Clover didn't accept those details", { message });
    }
    setBusy(false);
  }

  async function disconnect() {
    const ok = await notify.confirm({
      title: "Disconnect Clover?",
      message:
        "Sales rung up on the register stop coming through until you connect again. Nothing on the Clover account itself is changed.",
      confirmText: "Disconnect",
      variant: "error",
    });
    if (!ok) return;

    setBusy(true);
    setError("");
    try {
      const next = await stores.disconnectClover();
      setStatus(next);
      setForm(blankClover(next));
      notify.success("Clover disconnected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not disconnect.";
      setError(message);
      notify.error("Could not disconnect", { message });
    }
    setBusy(false);
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Connect to Clover</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Links this store to your Clover merchant account. Enter these once and the app stays
            connected — serials you add are pushed to Clover, and sales rung up on the register
            come back here.
          </p>
        </div>
        <CloverPill status={status} />
      </div>


      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Environment</label>
          <select
            className={inputClass}
            value={form.env}
            disabled={!mayEdit || busy}
            onChange={(e) => set("env", e.target.value as CloverEnv)}
          >
            {CLOVER_ENVS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>
            Merchant ID <span className="text-error-500">*</span>
          </label>
          <input
            className={inputClass}
            value={form.merchantId}
            disabled={!mayEdit || busy}
            onChange={(e) => set("merchantId", e.target.value.trim())}
          />
          <p className="mt-1.5 text-xs text-gray-400">
            In your Clover dashboard under Account &amp; Setup — a 13-character code.
          </p>
        </div>

        <div>
          <label className={labelClass}>
            API token {!status?.tokenHint && <span className="text-error-500">*</span>}
          </label>
          <input
            type="password"
            autoComplete="off"
            className={inputClass}
            value={form.token}
            disabled={!mayEdit || busy}
            onChange={(e) => set("token", e.target.value.trim())}
          />
          <p className="mt-1.5 text-xs text-gray-400">
            {status?.tokenHint
              ? `One is saved, ending ${status.tokenHint.slice(-4)}. Leave this blank to keep it, or paste a new token to replace it.`
              : "Create one in Clover under Setup → API Tokens, with read and write access to Orders, Inventory and Payments."}
          </p>
        </div>

      </div>

      {error && <p className="mt-4 text-sm text-error-500">{error}</p>}

      {mayEdit && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Checking with Clover…" : status?.merchantId ? "Save & re-check" : "Connect"}
          </button>
          {status?.merchantId && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-sm font-medium text-error-500 hover:text-error-600 disabled:opacity-60"
            >
              Disconnect
            </button>
          )}
          <span className="text-xs text-gray-400">
            Connecting checks the details against Clover before saving them.
          </span>
        </div>
      )}
    </div>
  );
}

export default function StoreSettingsPage() {
  const { can } = useAuth();
  const mayEdit = can("OWNER", "MANAGER");

  const [store, setStore] = useState<Store | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [slots, setSlots] = useState<Record<string, LogoSlot>>({});
  const [logos, setLogos] = useState<Logos>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const readLogos = (s: Store): Logos => ({
    logoLight: s.logoLight ?? null,
    logoDark: s.logoDark ?? null,
    iconLight: s.iconLight ?? null,
    iconDark: s.iconDark ?? null,
  });

  useEffect(() => {
    Promise.all([stores.settings(), stores.logoSlots()])
      .then(([s, defs]) => {
        setStore(s);
        setForm(toForm(s));
        setLogos(readLogos(s));
        setSlots(defs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your store."));
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Read one file into the slot it belongs to, refusing anything oversized. */
  function pickLogo(slot: string, file: File) {
    setError("");
    const spec = slots[slot];
    if (!file.type.startsWith("image/")) return setError("Pick an image file.");
    if (spec && file.size > spec.maxKb * 1024) {
      return setError(
        `${spec.label} is ${Math.round(file.size / 1024)} KB — keep it under ${spec.maxKb} KB.`
      );
    }
    const reader = new FileReader();
    reader.onload = () => setLogos((l) => ({ ...l, [slot]: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await stores.saveSettings({ ...form, ...logos });
      setStore(updated);
      setForm(toForm(updated));
      setLogos(readLogos(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setSaving(false);
  }

  if (error && !form) return <p className="p-10 text-center text-sm text-error-500">{error}</p>;
  if (!form || !store) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Store settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your shop's details, the label stock you print on, and the terms printed on service
          paperwork. Sharing with other stores has its own tab.
        </p>
      </div>

      {/* ------------------------------ identity ------------------------------ */}
      <div className={cardClass}>
        <h2 className="mb-4 font-semibold text-gray-800 dark:text-white/90">Details</h2>

        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Store name <span className="text-error-500">*</span>
              </label>
              <input
                className={inputClass}
                value={form.name}
                disabled={!mayEdit}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                className={inputClass}
                value={form.phone}
                disabled={!mayEdit}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input
                className={inputClass}
                value={form.website}
                disabled={!mayEdit}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Address</label>
              <textarea
                rows={3}
                className={`${inputClass} h-auto py-2.5`}
                value={form.address}
                disabled={!mayEdit}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------- logos ------------------------------- */}
      <div className={cardClass}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Logos</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          The app uses your logo at a few different shapes. An <strong>SVG</strong> is best — it
          stays sharp at any size. Otherwise use a PNG with a transparent background at twice the
          listed size, so it looks right on a high-resolution screen.
        </p>

        <div className="space-y-3">
          {Object.entries(slots).map(([slot, spec]) => (
            <LogoRow
              key={slot}
              spec={spec}
              value={logos[slot] ?? null}
              dark={DARK_SLOTS.has(slot)}
              mayEdit={mayEdit}
              onPick={(file) => pickLogo(slot, file)}
              onClear={() => setLogos((l) => ({ ...l, [slot]: null }))}
            />
          ))}
        </div>
      </div>

      {/* ------------------------------- labels ------------------------------- */}
      <div className={cardClass}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Label size</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          The label stock your printer is loaded with. Price tags are laid out to this size.
        </p>
        <div className="grid max-w-xs gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Width (mm)</label>
            <input
              type="number"
              min={10}
              max={300}
              className={inputClass}
              value={form.labelWidthMm}
              disabled={!mayEdit}
              onChange={(e) => set("labelWidthMm", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Height (mm)</label>
            <input
              type="number"
              min={10}
              max={300}
              className={inputClass}
              value={form.labelHeightMm}
              disabled={!mayEdit}
              onChange={(e) => set("labelHeightMm", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* --------------------------- service terms --------------------------- */}
      <div className={cardClass}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Service terms &amp; conditions</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          Printed on service intake and collection paperwork, above the customer's signature.
        </p>
        <textarea
          rows={7}
          className={`${inputClass} h-auto py-2.5 font-mono text-xs leading-relaxed`}
          value={form.serviceTerms}
          disabled={!mayEdit}
          onChange={(e) => set("serviceTerms", e.target.value)}
        />
      </div>


      {error && <p className="text-sm text-error-500">{error}</p>}

      {mayEdit && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          {saved && <span className="text-sm text-success-600">Saved</span>}
        </div>
      )}
    </form>

    {/* Sits outside the form above: it saves itself, and Enter in one of its
        fields must not trigger the page's Save settings. */}
    <CloverCard mayEdit={mayEdit} />
    <RegisterSalesCard />
    </div>
  );
}
