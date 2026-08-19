/**
 * Printing a rendered chart onto one A4 sheet, landscape.
 *
 * The chart is lifted out of the page as SVG rather than redrawn, so what
 * prints is exactly what was on screen. The legend is rebuilt by hand:
 * ApexCharts draws it as HTML beside the SVG, not inside it, so lifting the
 * SVG alone would print a chart whose colours mean nothing.
 *
 * Follows the same window.open approach as the label and receipt printers
 * rather than a print stylesheet on the app itself — a separate document can
 * set its own page size without every other page having to know about it.
 */

const escapeHtml = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );

export interface PrintChartOptions {
  /** The element the chart was rendered into. */
  container: HTMLElement | null;
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  /** Rows of figures printed under the chart, so the sheet stands alone. */
  facts?: { label: string; value: string }[];
  /** Called instead of printing when the browser blocks the window. */
  onBlocked?: () => void;
}

export function printChart({
  container,
  title,
  subtitle,
  legend = [],
  facts = [],
  onBlocked,
}: PrintChartOptions): void {
  const svg = container?.querySelector<SVGSVGElement>(".apexcharts-svg");
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;

  // ApexCharts sizes its SVG in pixels with no viewBox, so it cannot scale.
  // Giving it one — from the size it was drawn at — lets the sheet decide how
  // big it is instead of the screen.
  const w = Number(svg.getAttribute("width")) || svg.clientWidth || 1000;
  const h = Number(svg.getAttribute("height")) || svg.clientHeight || 340;
  clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.removeAttribute("width");
  clone.removeAttribute("height");
  clone.style.width = "100%";
  clone.style.height = "auto";

  // Tooltips and the crosshair belong to hovering, not to paper.
  clone
    .querySelectorAll(".apexcharts-tooltip, .apexcharts-xcrosshairs, .apexcharts-ycrosshairs")
    .forEach((n) => n.remove());

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    onBlocked?.();
    return;
  }

  const legendHtml = legend
    .map(
      (l) =>
        `<span class="key"><span class="dot" style="background:${escapeHtml(l.color)}"></span>${escapeHtml(l.label)}</span>`
    )
    .join("");

  const factsHtml = facts
    .map((f) => `<div class="fact"><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`)
    .join("");

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Outfit, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    color: #1f2937;
    /* Printers turn colour off by default; without this the series all print
       as the same grey and the legend stops meaning anything. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 16pt; margin: 0; }
  .sub { font-size: 10pt; color: #6b7280; margin: 2mm 0 0; }
  .keys { margin: 4mm 0 2mm; font-size: 9pt; color: #374151; }
  .key { display: inline-flex; align-items: center; gap: 1.5mm; margin-right: 5mm; }
  .dot { width: 2.6mm; height: 2.6mm; border-radius: 50%; display: inline-block; }
  .chart { width: 100%; }
  .facts { display: flex; flex-wrap: wrap; gap: 6mm; margin-top: 4mm;
           border-top: 0.3mm solid #e5e7eb; padding-top: 3mm; font-size: 9pt; }
  .fact dt { color: #6b7280; margin: 0; }
  .fact dd { margin: 0.5mm 0 0; font-weight: 600; font-size: 11pt; }
  .printed { margin-top: 4mm; font-size: 8pt; color: #9ca3af; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
  ${legendHtml ? `<div class="keys">${legendHtml}</div>` : ""}
  <div class="chart">${clone.outerHTML}</div>
  ${factsHtml ? `<dl class="facts">${factsHtml}</dl>` : ""}
  <p class="printed">Printed ${escapeHtml(new Date().toLocaleString())}</p>
</body>
</html>`);
  win.document.close();

  // Let the sheet lay out before the dialog measures it; printing a document
  // mid-layout is how you get a blank first page.
  win.onload = () => {
    win.focus();
    win.print();
  };
}
