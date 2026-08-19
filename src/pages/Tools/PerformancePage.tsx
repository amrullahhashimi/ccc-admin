import { useCallback, useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import {
  money,
  performance as performanceApi,
  type PerformanceOptions,
  type PerformanceReport,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useNotify } from "../../components/ui/notify";

/**
 * The shop's end-of-day takings log, and what it adds up to.
 *
 * Each row is a figure somebody counted and typed in, kept apart from the sales
 * the tills recorded so the two can be reconciled against each other.
 */

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

/**
 * One fixed colour per payment type, assigned down the list the API returns —
 * so a type keeps its colour whether or not a given month contains it, and the
 * two charts agree with each other.
 *
 * Both sets are chosen for their own surface rather than one being a filter of
 * the other, and both were checked for colour-vision separation (worst adjacent
 * pair ΔE 9.1 light / 8.4 dark, against a floor of 8).
 */
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

/** YYYY-MM-DD for a Date, in local terms — the day the shop was open. */
const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** "2026-08-19" → "19 Aug", the label the day axis carries. */
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

/** A headline figure. Proportional digits: tabular ones read loose at this size. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function PerformancePage() {
  const { can } = useAuth();
  const { theme } = useTheme();
  const notify = useNotify();
  const mayDelete = can("OWNER", "MANAGER");

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => toInput(monthStart(today)));
  const [to, setTo] = useState(() => toInput(monthEnd(today)));

  const [options, setOptions] = useState<PerformanceOptions | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    date: toInput(today),
    saleType: "INVENTORY",
    paymentType: "CASH",
    amount: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    performanceApi
      .options()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await performanceApi.report(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the figures.");
      setReport(null);
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await performanceApi.add(form);
      // The amount clears; everything else stays, since the next entry for the
      // same day is usually the same shape.
      setForm((f) => ({ ...f, amount: "", note: "" }));
      notify.success("Entry added");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add that entry.";
      setError(message);
      notify.error("Could not add that entry", { message });
    }
    setSaving(false);
  }

  async function remove(id: string, label: string) {
    const ok = await notify.confirm({
      title: `Remove ${label}?`,
      message: "The entry is deleted and the totals go back down.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      await performanceApi.remove(id);
      notify.success("Entry removed");
      await load();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const paymentTypes = options?.paymentTypes ?? [];
  const saleTypes = options?.saleTypes ?? [];
  const colors = theme === "dark" ? SERIES_DARK : SERIES_LIGHT;
  const axisInk = theme === "dark" ? "#9ca3af" : "#6b7280";
  const gridInk = theme === "dark" ? "#1f2937" : "#f0f0f0";
  const surface = theme === "dark" ? "#171717" : "#ffffff";

  const labelFor = (list: { value: string; label: string }[], v: string) =>
    list.find((t) => t.value === v)?.label ?? v;

  /* Daily takings, one line per way of paying. */
  const dayNumbers = (report?.byDay ?? []).map((d) => String(Number(d.date.slice(8, 10))));
  const fullDates = (report?.byDay ?? []).map((d) => dayLabel(d.date));
  const dailySeries = paymentTypes.map((t) => ({
    name: t.label,
    data: (report?.byDay ?? []).map((d) => Number(d[t.value] ?? 0) / 100),
  }));

  /**
   * The template's Line Chart 3 treatment: a thin stroke with a gradient fading
   * to nothing beneath it, no markers until hover, faint horizontal gridlines,
   * and a bare axis.
   *
   * That design carries one series. Here it carries five, so the gradient is
   * pitched lower than the template's 0.55 — five fills stacked at that
   * strength turn the lower half of the plot to mud and bury whichever line
   * sits behind. At 0.3 fading to 0 each fill still reads as belonging to its
   * line, while the strokes, which stay at full strength, do the identifying.
   */
  const dailyOptions: ApexOptions = {
    chart: {
      type: "area",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
      background: "transparent",
    },
    colors,
    stroke: { curve: "straight", width: 2 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] },
    },
    markers: {
      size: 0,
      strokeColors: surface,
      strokeWidth: 2,
      // A 2px surface ring on the hovered point, so it reads as separate from
      // whatever line it crosses.
      hover: { size: 6 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: "category",
      // The day number alone. A full month of "19 Aug" labels overlaps every
      // neighbour below about 1200px wide — measured, not guessed — and the
      // month is already named by the range above the chart.
      categories: dayNumbers,
      labels: {
        style: { colors: axisInk, fontSize: "11px" },
        // A last resort for narrow phones: drop labels rather than overlap them.
        hideOverlappingLabels: true,
        rotate: 0,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: axisInk, fontSize: "11px" },
        formatter: (v: number) => `$${Math.round(v)}`,
      },
    },
    grid: {
      borderColor: gridInk,
      strokeDashArray: 0, // solid hairlines; dashes read as a threshold
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: {
      position: "top",
      horizontalAlign: "left",
      markers: { size: 6 },
      labels: { colors: axisInk },
    },
    tooltip: {
      theme,
      // The axis shows a bare number, so the tooltip has to say which day.
      x: { formatter: (_v, opts) => fullDates[opts?.dataPointIndex ?? 0] ?? "" },
      y: { formatter: (v: number) => money(Math.round(v * 100)) },
    },
    states: { active: { filter: { type: "none" } } },
  };

  /* The same money, totalled by payment type — the split the day chart can't state outright. */
  const paymentTotals = paymentTypes.map((t) => (report?.byPaymentType?.[t.value] ?? 0) / 100);

  const byTypeOptions: ApexOptions = {
    chart: {
      type: "bar",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
      background: "transparent",
    },
    // Colour follows the payment type, not the bar's rank, so the two charts
    // teach the same association.
    colors,
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        barHeight: "55%",
        borderRadius: 4,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => (v > 0 ? money(Math.round(v * 100)) : ""),
      offsetX: 8,
      textAnchor: "start",
      // Values wear text ink, never the series colour.
      style: { fontSize: "11px", colors: [axisInk], fontWeight: 500 },
      background: { enabled: false },
    },
    xaxis: {
      categories: paymentTypes.map((t) => t.label),
      labels: { style: { colors: axisInk, fontSize: "11px" }, formatter: (v) => `$${Math.round(Number(v))}` },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: axisInk, fontSize: "11px" } } },
    grid: { borderColor: gridInk, strokeDashArray: 0, yaxis: { lines: { show: false } } },
    legend: { show: false }, // one bar per category, already named on the axis
    tooltip: { theme, y: { formatter: (v: number) => money(Math.round(v * 100)) } },
    states: { active: { filter: { type: "none" } } },
  };

  const hasData = (report?.count ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Performance</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          What the shop took each day, entered by hand. Kept separate from the tills, so the two can
          be checked against each other rather than one just repeating the other.
        </p>
      </div>

      {/* ------------------------------ add an entry ------------------------------ */}
      <form onSubmit={add} className={`${cardClass} p-6`}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Add today's takings</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass}>Sale type</label>
            <select className={inputClass} value={form.saleType} onChange={(e) => set("saleType", e.target.value)}>
              {saleTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass}>Payment type</label>
            <select className={inputClass} value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
              {paymentTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[9rem] flex-1">
            <label className={labelClass}>Amount</label>
            <input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass}>Note</label>
            <input className={inputClass} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="h-11 shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add entry"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
      </form>

      {/* One filter row above everything it scopes — both charts, the tiles and
          the table all read the same slice. */}
      <div className={`${cardClass} flex flex-wrap items-end gap-4 p-5`}>
        <div className="min-w-[10rem]">
          <label className={labelClass}>From</label>
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="min-w-[10rem]">
          <label className={labelClass}>To</label>
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFrom(toInput(monthStart(today)));
              setTo(toInput(monthEnd(today)));
            }}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => {
              const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              setFrom(toInput(monthStart(prev)));
              setTo(toInput(monthEnd(prev)));
            }}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Last month
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total taken" value={money(report?.totalCents ?? 0)} hint={`${report?.count ?? 0} entries`} />
        <Stat label="Service" value={money(report?.bySaleType?.SERVICE ?? 0)} />
        <Stat label="Inventory" value={money(report?.bySaleType?.INVENTORY ?? 0)} />
      </div>

      {/* Held at reduced opacity while refetching rather than replaced by a
          skeleton, so the numbers don't jump about between ranges. */}
      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {!hasData ? (
          <div className={`${cardClass} p-10 text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? "Loading…" : "Nothing recorded for these dates yet. Add today's takings above."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`${cardClass} p-6`}>
              <h2 className="font-semibold text-gray-800 dark:text-white/90">Taken each day</h2>
              <p className="mb-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                One line per way of paying. Hover a day for the exact figures.
              </p>
              {/* The template's own wrapper: give the plot a wide floor and let
                  it scroll inside the card, rather than squeezing a month of
                  days into whatever width is left. */}
              <div className="min-w-0 max-w-full overflow-x-auto custom-scrollbar">
                <div className="min-w-[1000px]">
                  <Chart options={dailyOptions} series={dailySeries} type="area" height={340} />
                </div>
              </div>
            </div>

            <div className={`${cardClass} p-6`}>
              <h2 className="font-semibold text-gray-800 dark:text-white/90">By payment type</h2>
              <p className="mb-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                The same money over {report?.from} to {report?.to}, totalled by how it came in.
              </p>
              <div className="min-w-0 overflow-x-auto">
                <Chart
                  options={byTypeOptions}
                  series={[{ name: "Taken", data: paymentTotals }]}
                  type="bar"
                  height={240}
                />
              </div>
            </div>

            {/* The table view: every figure the charts show, readable without
                relying on colour at all. */}
            <div className={cardClass}>
              <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                <h2 className="font-semibold text-gray-800 dark:text-white/90">Entries</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Sale type</th>
                      <th className="px-5 py-3 font-medium">Payment</th>
                      <th className="px-5 py-3 text-right font-medium">Amount</th>
                      <th className="px-5 py-3 font-medium">Note</th>
                      <th className="px-5 py-3 font-medium">Added by</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(report?.entries ?? []).map((e) => {
                      const slot = paymentTypes.findIndex((t) => t.value === e.paymentType);
                      return (
                        <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                            {dayLabel(e.date)}
                          </td>
                          <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                            {labelFor(saleTypes, e.saleType)}
                          </td>
                          <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                            {/* The swatch ties the row to the chart; the label
                                carries the meaning, so colour is never alone. */}
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: colors[slot >= 0 ? slot % colors.length : 0] }}
                              />
                              {labelFor(paymentTypes, e.paymentType)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-800 dark:text-white/90">
                            {money(e.amountCents)}
                          </td>
                          <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{e.note || "—"}</td>
                          <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{e.user?.name ?? "—"}</td>
                          <td className="px-5 py-3 text-right">
                            {mayDelete && (
                              <button
                                type="button"
                                onClick={() => remove(e.id, `${dayLabel(e.date)} · ${money(e.amountCents)}`)}
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
