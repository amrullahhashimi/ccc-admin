/**
 * Rewrites CSS media query range syntax into the older min-/max-width form.
 *
 * Tailwind 4 emits `@media (width>=1024px)`. That is Media Queries Level 4,
 * which Safari only understands from 16.4 — and an iPad Mini 4 stops at
 * iPadOS 15. A browser that cannot parse a media query drops the whole block,
 * so on that device every responsive utility in the build simply vanished:
 * the sidebar never docked, the content never took its margin, and no `sm:`,
 * `md:` or `lg:` rule applied at any width.
 *
 * The transformation is mechanical and lossless for the forms Tailwind emits:
 *
 *   (width>=1024px)            -> (min-width: 1024px)
 *   (width<=639px)             -> (max-width: 639px)
 *   (width>1024px)             -> (min-width: 1024.02px)
 *   (width<640px)              -> (max-width: 639.98px)
 *   (640px<=width<=1024px)     -> (min-width: 640px) and (max-width: 1024px)
 *
 * The 0.02px nudge on the exclusive forms is the usual convention: it is
 * smaller than any device pixel yet large enough to survive the rounding
 * browsers do at fractional zoom levels.
 *
 * Runs after Tailwind, and leaves queries that are already min-/max- alone, so
 * it is a no-op the day the browsers we support all speak range syntax.
 */

const EXCLUSIVE_NUDGE = 0.02;

/** "1024px" -> { value: 1024, unit: "px" }, or null for anything unexpected. */
function parseLength(raw) {
  const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(String(raw).trim());
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? { value, unit: m[2] || "" } : null;
}

/** Shift a length by the smallest amount that still reads as "not equal". */
function nudge(length, direction) {
  // rem and em are far larger than a pixel, so a pixel-sized nudge is wrong;
  // scale it to the unit rather than assuming px.
  const step = length.unit === "rem" || length.unit === "em" ? EXCLUSIVE_NUDGE / 16 : EXCLUSIVE_NUDGE;
  const shifted = length.value + direction * step;
  // Trim the float noise that arithmetic on decimals leaves behind.
  return `${Number(shifted.toFixed(4))}${length.unit}`;
}

const bound = (feature, kind, length) => `(${kind}-${feature}: ${length})`;

function rewriteQuery(params) {
  let out = params;

  // Two-sided: (640px <= width <= 1024px)
  out = out.replace(
    /\(\s*([\d.]+[a-z%]*)\s*(<=?|>=?)\s*([a-z-]+)\s*(<=?|>=?)\s*([\d.]+[a-z%]*)\s*\)/gi,
    (whole, leftRaw, leftOp, feature, rightOp, rightRaw) => {
      const left = parseLength(leftRaw);
      const right = parseLength(rightRaw);
      if (!left || !right) return whole;

      // The left comparison points back at the feature, so it flips: with
      // `640px <= width`, the feature is the larger side.
      const lower = leftOp.startsWith("<")
        ? bound(feature, "min", leftOp === "<=" ? leftRaw : nudge(left, +1))
        : bound(feature, "max", leftOp === ">=" ? leftRaw : nudge(left, -1));

      const upper = rightOp.startsWith("<")
        ? bound(feature, "max", rightOp === "<=" ? rightRaw : nudge(right, -1))
        : bound(feature, "min", rightOp === ">=" ? rightRaw : nudge(right, +1));

      return `${lower} and ${upper}`;
    }
  );

  // One-sided: (width >= 1024px)
  out = out.replace(
    /\(\s*([a-z-]+)\s*(<=|>=|<|>)\s*([\d.]+[a-z%]*)\s*\)/gi,
    (whole, feature, op, raw) => {
      const length = parseLength(raw);
      if (!length) return whole;

      if (op === ">=") return bound(feature, "min", raw);
      if (op === "<=") return bound(feature, "max", raw);
      if (op === ">") return bound(feature, "min", nudge(length, +1));
      return bound(feature, "max", nudge(length, -1));
    }
  );

  return out;
}

const plugin = () => ({
  postcssPlugin: "media-minmax",
  AtRule: {
    media: (rule) => {
      const rewritten = rewriteQuery(rule.params);
      if (rewritten !== rule.params) rule.params = rewritten;
    },
  },
});

plugin.postcss = true;

export default plugin;
export { rewriteQuery };
