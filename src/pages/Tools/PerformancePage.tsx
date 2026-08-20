import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import {
  money,
  performance as performanceApi,
  type PerformanceOptions,
  type PerformanceReport,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import { useTheme } from "../../context/ThemeContext";
import { useNotify } from "../../components/ui/notify";
import { printChart } from "./printChart";

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

/** How the daily figures can be drawn. Same numbers either way. */
const SHAPES = [
  { value: "area" as const, label: "Lines" },
  { value: "bar" as const, label: "Bars" },
];

type Shape = (typeof SHAPES)[number]["value"];

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

/**
 * The weekday for a plain date string.
 *
 * Parsed as UTC, matching how the API sends it. Reading it as local time
 * shifts the day backwards anywhere west of Greenwich, which would label a
 * Monday as Sunday for exactly the shops that care about the difference.
 */
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
};

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
  const { store } = useStore();
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
  const [shape, setShape] = useState<Shape>("area");
  const dailyChartRef = useRef<HTMLDivElement>(null);

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

  /**
   * Put the chart on one A4 sheet, landscape.
   *
   * The totals travel with it: a printed chart with no figures on it is a
   * shape, and whoever picks the sheet up later has no way to check it.
   */
  function printDaily() {
    printChart({
      container: dailyChartRef.current,
      // Drop the dash when there's no shop name to put after it.
      title: store?.name ? `Taken each day — ${store.name}` : "Taken each day",
      subtitle: report ? `${dayLabel(report.from)} to ${dayLabel(report.to)}` : undefined,
      legend: paymentTypes.map((t, i) => ({ label: t.label, color: colors[i % colors.length] })),
      facts: [
        { label: "Total taken", value: money(report?.totalCents ?? 0) },
        { label: "Service", value: money(report?.bySaleType?.SERVICE ?? 0) },
        { label: "Inventory", value: money(report?.bySaleType?.INVENTORY ?? 0) },
        { label: "Entries", value: String(report?.count ?? 0) },
      ],
      onBlocked: () =>
        notify.warning("Pop-ups are blocked", {
          message: "Allow pop-ups for this site to print the chart.",
        }),
    });
  }

  /* Daily takings, one line per way of paying. */
  const days = report?.byDay ?? [];

  // Two lines per tick: the day over its weekday. ApexCharts renders an array
  // as a stacked label, which is what the shop reads the chart by — a quiet
  // Sunday is only obvious if the axis says Sunday.
  const dayNumbers = days.map((d) => [String(Number(d.date.slice(8, 10))), weekdayOf(d.date)]);
  const fullDates = days.map((d) => `${weekdayOf(d.date)} ${dayLabel(d.date)}`);

  const dailySeries = paymentTypes.map((t) => ({
    name: t.label,
    // null, not 0, for a day nobody has entered: the line breaks rather than
    // diving to the floor and claiming the shop took nothing. A day that does
    // have entries but not this payment type is a real zero.
    data: days.map((d) => (d.hasEntries ? Number(d[t.value] ?? 0) / 100 : null)),
  }));

  /**
   * The scale runs in $100 steps, up to the next hundred above the biggest
   * figure on the chart.
   *
   * Capped, because the step is fixed and the axis is not: a $9,000 day would
   * otherwise ask for ninety gridlines on a 340px plot, which is a grey smear
   * with unreadable labels rather than a scale. Past the cap the steps widen
   * so the axis stays legible — the alternative is honouring the $100 exactly
   * and rendering something nobody can read.
   */
  const DAILY_STEP = 100;
  const MAX_TICKS = 20;

  /**
   * The scale never shrinks below this, so an empty month still draws its
   * ladder — $0 to $1,500 in hundreds, fifteen gridlines — instead of a blank
   * rectangle. A chart with nothing on it should still say what it measures.
   */
  const FLOOR_CEILING = 1500;

  /** Round a peak up to a readable ladder of $100 steps. */
  const scaleFor = (peak: number) => {
    const target = Math.max(peak, FLOOR_CEILING);
    const step = DAILY_STEP * Math.max(1, Math.ceil(target / DAILY_STEP / MAX_TICKS));
    return { step, max: Math.max(step, Math.ceil(target / step) * step) };
  };

  // Both views draw each payment type on its own — lines over one another,
  // bars side by side — so the tallest mark in either is the biggest single
  // figure, and one ceiling serves both. Switching view keeps the same scale.
  const dailyPeak = Math.max(
    0,
    ...dailySeries.flatMap((s) => s.data.filter((v): v is number => v != null))
  );
  const { step: dailyStep, max: dailyMax } = scaleFor(dailyPeak);

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
      // Every gridline is $100. Given as an explicit ceiling and tick count
      // rather than a stepSize, because ApexCharts will otherwise round the
      // scale to whatever it finds tidy and quietly land on $150s or $250s.
      min: 0,
      max: dailyMax,
      tickAmount: dailyMax / dailyStep,
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

  /**
   * The same days as columns, in the template's Bar Chart 5 style: thin bars
   * with rounded tops sitting square on the baseline, grouped rather than
   * stacked, separated by a gap in the surface colour rather than an outline.
   *
   * Everything but the marks is shared with the area view — same colours, same
   * scale, same axis — so switching between them changes how the figures are
   * drawn and never what they say.
   */
  const dailyBarOptions: ApexOptions = {
    ...dailyOptions,
    // Grouped: each payment type gets its own bar under the date, side by side.
    // Five bars a day across a month is 155 of them, far more than a screen's
    // width divides into legibly — so the plot is given the width it needs and
    // the card scrolls. It is the card that scrolls, not the page.
    chart: { ...dailyOptions.chart, type: "bar", stacked: false },
    // A 2px gap in the surface colour between neighbours, rather than an
    // outline around each bar.
    stroke: { show: true, width: 2, colors: ["transparent"] },
    fill: { type: "solid", opacity: 1 },
    plotOptions: {
      bar: {
        columnWidth: "85%",
        borderRadius: 4,
        // Rounded at the top, square where it meets the baseline.
        borderRadiusApplication: "end",
      },
    },
    markers: { size: 0 },
    // Grouped bars stand alone, so the tallest is the biggest single payment
    // type — the same ceiling the lines use. No override needed.
  };

  /**
   * How wide the bar view needs to be to stay readable.
   *
   * Five bars plus their gaps want roughly 58px per day. Below that they thin
   * out to hairlines; measured at a screen's width a full month came out at
   * 2px a bar. The lines view has no such need — it fills whatever it is given.
   */
  const barMinWidth = Math.max(640, days.length * 58);

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


  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
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
        <div className="space-y-6">
            <div className={`${cardClass} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-white/90">Taken each day</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {shape === "area"
                      ? "One line per way of paying. Hover a day for the exact figures."
                      : "One bar per way of paying, side by side. Hover a day for the exact figures."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Two views of one set of figures, so the control names the
                      drawing rather than pretending to be a different report. */}
                  <div className="flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
                    {SHAPES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setShape(s.value)}
                        aria-pressed={shape === s.value}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                          shape === s.value
                            ? "bg-brand-500 text-white"
                            : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={printDaily}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    Print
                  </button>
                </div>
              </div>

              {/* Lines fill the card. Bars need more room than a screen has,
                  so they get a floor and this scrolls — the card, not the
                  page, which is what min-w-0 on the layout column buys. */}
              <div ref={dailyChartRef} className="mt-3 min-w-0 max-w-full overflow-x-auto custom-scrollbar">
                <div style={shape === "bar" ? { minWidth: barMinWidth } : undefined}>
                <Chart
                  // Keyed by shape: ApexCharts animates between types rather
                  // than rebuilding, and half-morphed bars are worse than a
                  // clean redraw.
                  key={shape}
                  options={shape === "area" ? dailyOptions : dailyBarOptions}
                  series={dailySeries}
                  type={shape}
                  height={340}
                />
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
                    {!(report?.entries ?? []).length && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                          {loading ? "Loading…" : "Nothing recorded for these dates yet."}
                        </td>
                      </tr>
                    )}

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
      </div>
    </div>
  );
}
