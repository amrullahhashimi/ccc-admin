import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { tools, ApiError, type ImeiCheck } from "../../lib/api";

const inputClass =
  "h-12 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 font-mono text-base tracking-[0.15em] text-gray-800 placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

/** One label/value row. */
function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

type Source = "ours" | "tac" | "none";

const SOURCE_CHIP: Record<Source, { label: string; className: string }> = {
  ours: {
    label: "Your records",
    className: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  },
  tac: {
    label: "From the IMEI",
    className: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  },
  none: {
    label: "Not free",
    className: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
  },
};

/** One of the four status lines: what we can say, and where it came from. */
function StatusRow({
  label,
  source,
  value,
  note,
  children,
}: {
  label: string;
  source: Source;
  value: string;
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const chip = SOURCE_CHIP[source];
  return (
    <div className="border-t border-gray-100 py-4 first:border-t-0 first:pt-0 dark:border-gray-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">{label}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.className}`}>
          {chip.label}
        </span>
      </div>
      <p
        className={`mt-1 text-sm ${
          source === "none"
            ? "text-gray-500 dark:text-gray-400"
            : "font-semibold text-gray-800 dark:text-white/90"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      {children}
    </div>
  );
}

export default function ImeiCheckerPage() {
  const [imei, setImei] = useState("");
  const [result, setResult] = useState<ImeiCheck | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tacEntries, setTacEntries] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    tools
      .imeiConfig()
      .then((c) => setTacEntries(c.tacEntries))
      .catch(() => setTacEntries(0));
  }, []);

  const digits = imei.replace(/\D+/g, "");

  async function check() {
    if (!digits) {
      setError("Enter an IMEI.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(await tools.checkImei(digits));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Couldn't check that IMEI.");
    } finally {
      setBusy(false);
    }
  }

  function copyFull() {
    if (!result?.full) return;
    navigator.clipboard.writeText(result.full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const device = result?.device;
  const carrier = result?.insights?.carrier;
  const warranty = result?.insights?.warranty;
  const unit = result?.records?.unit;
  const tickets = result?.records?.tickets ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">IMEI Checker</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Dial <span className="font-mono">*#06#</span> on the phone to show its IMEI, or scan the barcode
          under the battery / on the box.
        </p>
      </div>

      {/* ------------------------------ input ------------------------------ */}
      <div className={cardClass}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="flex-1">
            <input
              ref={inputRef}
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              placeholder="123456789012345"
              inputMode="numeric"
              autoComplete="off"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-gray-400">{digits.length} / 15 digits</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-lg bg-brand-500 px-6 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Check"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
      </div>

      {result && (
        <>
          {/* ---------------------------- structure ---------------------------- */}
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-lg tracking-[0.2em] text-gray-800 dark:text-white/90">
                  {result.full}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {result.kind}
                  {result.length === 14 && " — check digit added"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyFull}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    result.valid
                      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                      : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
                  }`}
                >
                  {result.valid ? "Valid" : "Invalid check digit"}
                </span>
              </div>
            </div>

            {!result.valid && (
              <p className="mt-3 rounded-lg bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                The last digit should be <strong>{result.expectedCheckDigit}</strong>, not{" "}
                <strong>{result.checkDigit}</strong>. Usually a typo — check the number again before you
                trust it.
              </p>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-4 dark:border-gray-800">
              <Field label="TAC" value={result.tac} />
              <Field label="Serial" value={result.serialNumber} />
              <Field
                label="Check digit"
                value={String(result.checkDigit ?? result.expectedCheckDigit ?? "")}
              />
              <Field label="Software ver." value={result.softwareVersion} />
              <Field label="Allocated by" value={result.reportingBody ?? undefined} />
            </dl>
          </div>

          {/* ----------------------------- device ----------------------------- */}
          <div className={cardClass}>
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">Device</h2>

            {device ? (
              <>
                <p className="mt-3 text-xl font-semibold text-gray-800 dark:text-white/90">
                  {device.model}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Brand" value={device.brand} />
                  <Field label="Released" value={device.year ? String(device.year) : undefined} />
                  {device.details && (
                    <div className="col-span-2 sm:col-span-4">
                      <dt className="text-xs uppercase tracking-wide text-gray-400">Model numbers</dt>
                      <dd className="mt-1 text-sm text-gray-600 dark:text-gray-300">{device.details}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-4 text-xs text-gray-400">
                  From the bundled TAC database
                  {tacEntries ? ` (${tacEntries.toLocaleString()} devices)` : ""} — no internet needed.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                TAC <span className="font-mono">{result.tac}</span> isn't in the bundled database. It's
                either very new or a rare model — run{" "}
                <span className="font-mono">node scripts/build-tacdb.js</span> on the server to pull a
                fresher list.
              </p>
            )}
          </div>

          {/* ------------------ blacklist / carrier / lock / warranty ------------------ */}
          <div className={cardClass}>
            <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-white/90">
              Blacklist, carrier, lock &amp; warranty
            </h2>

            <StatusRow
              label="Blacklist (lost or stolen)"
              source={unit || tickets.length > 0 ? "ours" : "none"}
              value={
                unit
                  ? `This is one of ours — ${unit.status.toLowerCase().replace("_", " ")}`
                  : tickets.length > 0
                  ? `We've had this handset in for repair ${tickets.length} time${
                      tickets.length === 1 ? "" : "s"
                    }`
                  : "No free source can answer this"
              }
              note={
                <>
                  The national lost/stolen list is held by the carriers. In Canada that's{" "}
                  <a
                    href="https://www.devicecheck.ca/businesses/device-lookup/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-500 hover:text-brand-600"
                  >
                    DeviceCheck.ca
                  </a>
                  , free to search but only with a business account — their consumer lookup forbids
                  commercial use, so don't use that one for the shop.
                </>
              }
            />

            <StatusRow
              label="Carrier"
              source={carrier?.variant || carrier?.region ? "tac" : "none"}
              value={
                carrier?.variant
                  ? `${carrier.variant} variant`
                  : carrier?.region
                  ? carrier.region
                  : "Not a carrier-branded model"
              }
              note={
                carrier?.variant
                  ? "The IMEI was allocated to this network's own version of the handset. That's what it was built for, not proof of who it's on now."
                  : carrier?.region
                  ? "A region variant rather than a carrier one — no network branding in the IMEI."
                  : "Only carrier-branded models can be told apart this way. Which network a handset is actually on isn't in the IMEI."
              }
            >
              {(carrier?.region || carrier?.dualSim) && carrier?.variant && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {[carrier.region, carrier.dualSim ? "Dual SIM" : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </StatusRow>

            <StatusRow
              label="SIM lock"
              source="none"
              value={
                carrier?.variant
                  ? `Unknown — but a ${carrier.variant} model is more likely to be locked`
                  : "Unknown"
              }
              note="Lock state lives in the carrier's own systems and changes over time, so nothing free can read it. The reliable test is a SIM from another network."
            />

            <StatusRow
              label="Warranty"
              source={warranty?.ours ? "ours" : device?.year ? "tac" : "none"}
              value={
                warranty?.ours
                  ? warranty.ours.expired
                    ? `Our ${warranty.ours.months}-month warranty ended ${date(warranty.ours.expires)}`
                    : `Under our warranty until ${date(warranty.ours.expires)}`
                  : warranty?.manufacturer.verdict === "expired"
                  ? "Out of manufacturer warranty"
                  : warranty?.manufacturer.verdict === "possible"
                  ? "May still be under manufacturer warranty"
                  : "Unknown"
              }
              note={
                warranty?.ours
                  ? `${warranty.ours.months} months from ${date(warranty.ours.from)} — ${warranty.ours.basis}.`
                  : warranty?.manufacturer.note
              }
            />
          </div>

          {/* --------------------------- our own records --------------------------- */}
          {(unit || tickets.length > 0) && (
            <div className={cardClass}>
              <h2 className="text-base font-medium text-gray-800 dark:text-white/90">Our records</h2>

              {unit && (
                <div className="mt-4">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field label="Status" value={unit.status.replace("_", " ")} />
                    <Field label="Condition" value={unit.condition.replace(/_/g, " ")} />
                    <Field label="Storage" value={unit.storage} />
                    <Field label="Colour" value={unit.color} />
                    <Field label="Stocked" value={date(unit.stockedAt)} />
                    <Field label="Location" value={unit.location} />
                    <Field label="Bought from" value={unit.vendor} />
                    <Field label="Warranty" value={`${unit.warrantyMonths} months`} />
                  </dl>
                  {unit.product && (
                    <Link
                      to={`/inventory/items/${unit.product.id}`}
                      className="mt-3 inline-block text-sm text-brand-500 hover:text-brand-600"
                    >
                      {unit.product.name} ({unit.product.sku}) →
                    </Link>
                  )}
                </div>
              )}

              {tickets.length > 0 && (
                <div className={unit ? "mt-5 border-t border-gray-100 pt-4 dark:border-gray-800" : "mt-4"}>
                  <h3 className="text-xs uppercase tracking-wide text-gray-400">Repair history</h3>
                  <ul className="mt-2 space-y-2">
                    {tickets.map((t) => (
                      <li key={t.id} className="text-sm">
                        <Link
                          to={`/service/${t.id}`}
                          className="font-medium text-brand-500 hover:text-brand-600"
                        >
                          #{t.number}
                        </Link>{" "}
                        <span className="text-gray-600 dark:text-gray-300">{t.issue}</span>
                        <span className="text-gray-400">
                          {" "}
                          — {t.status.toLowerCase().replace(/_/g, " ")}, {date(t.at)}
                          {t.customer ? ` · ${t.customer}` : ""}
                          {t.warranty ? " · warranty job" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
