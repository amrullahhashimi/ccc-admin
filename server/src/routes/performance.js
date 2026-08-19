const express = require("express");
const { ah } = require("../async-route");
const { scope, stamp, storeId } = require("../tenancy");

/**
 * The shop's end-of-day takings log.
 *
 * Deliberately its own record rather than a view over Sale: this is what was
 * counted at the counter and typed in by hand, and it is allowed to disagree
 * with what the tills recorded. Two independent numbers can be reconciled;
 * one number derived from the other can only agree with itself.
 *
 * The options live here so the page draws its dropdowns from the same list the
 * API validates against — they can't drift apart.
 */

const SALE_TYPES = [
  { value: "SERVICE", label: "Service" },
  { value: "INVENTORY", label: "Inventory" },
];

/**
 * Order matters: the chart assigns its fixed colour slots down this list, so a
 * payment type keeps its colour no matter which types a given month contains.
 */
const PAYMENT_TYPES = [
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_CARD", label: "Credit card" },
  { value: "DEBIT_CARD", label: "Debit card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ETRANSFER", label: "E-transfer" },
];

const isSaleType = (v) => SALE_TYPES.some((t) => t.value === v);
const isPaymentType = (v) => PAYMENT_TYPES.some((t) => t.value === v);

/** "2026-08-19" → a date with no time, so a day means the same in every timezone. */
function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const toDayString = (d) => new Date(d).toISOString().slice(0, 10);

/** Money arrives as dollars from the form and is stored as cents. */
function centsFrom(value) {
  const n = Math.round(parseFloat(String(value ?? "").replace(/[^0-9.-]/g, "")) * 100);
  return Number.isFinite(n) ? n : null;
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /** So the page's dropdowns and the API's validation can't drift apart. */
  router.get("/options", (_req, res) => res.json({ saleTypes: SALE_TYPES, paymentTypes: PAYMENT_TYPES }));

  /**
   * Every entry in a date range, plus the totals the charts need.
   *
   * The totals are worked out here rather than in the browser so the page shows
   * the same figures however it is opened, and so a long range doesn't ship
   * thousands of rows just to add them up.
   */
  router.get("/", ah(async (req, res) => {
    // Default window: the month containing today.
    const now = new Date();
    const from =
      parseDay(req.query.from) ?? new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const to =
      parseDay(req.query.to) ?? new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));

    if (from > to) return res.status(400).json({ error: "The start date is after the end date." });

    const entries = await prisma.performanceEntry.findMany({
      where: { ...scope(req), date: { gte: from, lte: to } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    // Every day in the range, whether or not anything was taken. A chart that
    // only plots the days with entries silently closes the gaps, so a quiet
    // week looks the same as a busy one and the axis stops being a calendar.
    const byDay = new Map();
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      byDay.set(toDayString(d), {
        ...Object.fromEntries(PAYMENT_TYPES.map((t) => [t.value, 0])),
        // Tells "nothing was taken" apart from "nobody has entered this yet" —
        // which matters for the days of a month that haven't happened.
        hasEntries: false,
      });
    }

    const byPaymentType = Object.fromEntries(PAYMENT_TYPES.map((t) => [t.value, 0]));
    const bySaleType = Object.fromEntries(SALE_TYPES.map((t) => [t.value, 0]));
    let totalCents = 0;

    for (const e of entries) {
      const day = toDayString(e.date);
      // An entry can only fall outside the seeded range if the range moved
      // under us; seed it rather than drop the money on the floor.
      if (!byDay.has(day)) {
        byDay.set(day, {
          ...Object.fromEntries(PAYMENT_TYPES.map((t) => [t.value, 0])),
          hasEntries: false,
        });
      }
      const bucket = byDay.get(day);
      bucket[e.paymentType] += e.amountCents;
      bucket.hasEntries = true;
      byPaymentType[e.paymentType] += e.amountCents;
      bySaleType[e.saleType] += e.amountCents;
      totalCents += e.amountCents;
    }

    res.json({
      from: toDayString(from),
      to: toDayString(to),
      entries: entries.map((e) => ({ ...e, date: toDayString(e.date) })),
      // Ascending for the chart's x-axis, while the table above reads newest first.
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amounts]) => ({ date, ...amounts })),
      byPaymentType,
      bySaleType,
      totalCents,
      count: entries.length,
    });
  }));

  router.post("/", ah(async (req, res) => {
    const date = parseDay(req.body?.date);
    if (!date) return res.status(400).json({ error: "Pick a date." });
    if (!isSaleType(req.body?.saleType)) return res.status(400).json({ error: "Pick a sale type." });
    if (!isPaymentType(req.body?.paymentType)) {
      return res.status(400).json({ error: "Pick a payment type." });
    }

    const amountCents = centsFrom(req.body?.amount);
    if (amountCents === null) return res.status(400).json({ error: "Enter an amount." });
    if (amountCents === 0) return res.status(400).json({ error: "An amount of zero is nothing to record." });

    const created = await prisma.performanceEntry.create({
      data: {
        date,
        saleType: req.body.saleType,
        paymentType: req.body.paymentType,
        amountCents,
        note: String(req.body?.note ?? "").trim() || null,
        userId: req.session?.user?.id ?? null,
        ...stamp(req),
      },
      include: { user: { select: { id: true, name: true } } },
    });

    res.status(201).json({ ...created, date: toDayString(created.date) });
  }));

  router.delete("/:id", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    // Scoped in the query rather than checked after, so one store can't reach
    // another's rows by guessing an id.
    const { count } = await prisma.performanceEntry.deleteMany({
      where: { id: req.params.id, storeId: storeId(req) },
    });
    if (!count) return res.status(404).json({ error: "That entry was not found." });
    res.json({ ok: true });
  }));

  return router;
};
