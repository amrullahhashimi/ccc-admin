const express = require("express");
const { deviceFromTac, stats } = require("../tacdb");
const { scope } = require("../tenancy");

/**
 * Shop tools. First one: IMEI checker.
 *
 * Everything here is free and offline. The structure (length, Luhn check digit,
 * TAC split, who allocated it) is arithmetic, and the brand/model comes from the
 * bundled TAC database in server/data — no API, no key, no per-check cost.
 *
 * Blacklist, carrier, SIM-lock and iCloud status are deliberately not here: they
 * are held by operators and the GSMA, and every source for them charges per
 * lookup. See server/data/README.md.
 */

/* First two digits of the TAC say who allocated it. Only the ones we're sure
   about are listed; anything else comes back as unknown rather than a guess. */
const REPORTING_BODIES = {
  "00": "Test / private use",
  "01": "PTCRB (North America)",
  "10": "PTCRB (North America)",
  "35": "BABT (United Kingdom)",
  "44": "BABT (United Kingdom)",
  "86": "TAF (China)",
};

const digitsOnly = (value) => String(value ?? "").replace(/\D+/g, "");

/** Luhn check digit for the first 14 digits of an IMEI. */
function checkDigitFor(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(first14[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Everything we can say about an IMEI from the number itself.
 * Accepts 14 (no check digit), 15 (full IMEI) or 16 digits (IMEISV).
 */
function inspect(raw) {
  const imei = digitsOnly(raw);
  const out = {
    input: String(raw ?? "").trim(),
    imei,
    length: imei.length,
    kind: null,
    valid: null,
    checkDigit: null,
    expectedCheckDigit: null,
    tac: null,
    serialNumber: null,
    softwareVersion: null,
    reportingBodyCode: null,
    reportingBody: null,
    full: null, // the 15-digit form to show
    error: null,
  };

  if (imei.length < 14 || imei.length > 16) {
    out.error =
      imei.length === 0
        ? "Enter an IMEI."
        : `An IMEI is 15 digits (or 14 without the check digit). You entered ${imei.length}.`;
    return out;
  }

  const first14 = imei.slice(0, 14);
  const expected = checkDigitFor(first14);

  out.tac = imei.slice(0, 8);
  out.serialNumber = imei.slice(8, 14);
  out.expectedCheckDigit = expected;
  out.reportingBodyCode = imei.slice(0, 2);
  out.reportingBody = REPORTING_BODIES[out.reportingBodyCode] || null;
  out.full = first14 + expected;

  if (imei.length === 14) {
    out.kind = "IMEI (no check digit)";
    out.valid = true; // nothing to contradict — we supply the check digit
  } else if (imei.length === 15) {
    out.kind = "IMEI";
    out.checkDigit = Number(imei[14]);
    out.valid = out.checkDigit === expected;
  } else {
    out.kind = "IMEISV";
    out.softwareVersion = imei.slice(14, 16);
    out.valid = true; // IMEISV carries a software version instead of a check digit
  }

  return out;
}

/* --------------------------- warranty --------------------------- */

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Whether the maker's warranty could still be running, judged from the model's
 * release year. Standard cover is a year from purchase, so a model released a
 * few years ago is certainly out — anything recent depends on the receipt, which
 * we can't see. Deliberately says "unknown" rather than guessing.
 */
function manufacturerWarranty(year) {
  if (!year) return { verdict: "unknown", note: "No release year for this model." };

  const age = new Date().getFullYear() - year;
  if (age >= 3) {
    return {
      verdict: "expired",
      note: `Released ${year}. Standard manufacturer cover is 12 months, so it ran out years ago.`,
    };
  }
  if (age >= 2) {
    return {
      verdict: "expired",
      note: `Released ${year} — past the usual 12-month manufacturer cover unless it was bought late or has extended cover.`,
    };
  }
  return {
    verdict: "possible",
    note: `Released ${year}, so it may still be covered — that depends on the purchase date, which only the receipt or the maker can confirm.`,
  };
}

/* ------------------------------ routes ------------------------------ */

module.exports = (prisma) => {
  const router = express.Router();

  router.get("/imei/config", (_req, res) => {
    res.json({ tacEntries: stats().entries });
  });

  router.post("/imei", async (req, res) => {
    const info = inspect(req.body?.imei);
    if (info.error) return res.status(400).json({ error: info.error, ...info });

    const device = deviceFromTac(info.tac);

    // Serials get typed in a few shapes over the years — check them all.
    const forms = [...new Set([info.full, info.imei, info.imei.slice(0, 14)].filter(Boolean))];

    const [unit, tickets] = await Promise.all([
      prisma.productUnit.findFirst({
        where: { serial: { in: forms }, ...scope(req) },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { name: true } },
          vendor: { select: { name: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { deviceImei: { in: forms }, ...scope(req) },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          status: true,
          issue: true,
          dateIn: true,
          completedAt: true,
          createdAt: true,
          warranty: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    // Our own warranty, when we're the ones who sold it. There's no soldAt
    // column, so the clock starts from when the unit was marked SOLD.
    let ours = null;
    if (unit && unit.status === "SOLD") {
      const from = unit.updatedAt;
      const expires = addMonths(from, unit.warrantyMonths);
      ours = {
        months: unit.warrantyMonths,
        from,
        expires,
        expired: expires < new Date(),
        basis: "counted from when the unit was marked sold",
      };
    }

    res.json({
      ...info,
      device,
      insights: {
        carrier: device
          ? { variant: device.carrierVariant, region: device.region, dualSim: device.dualSim }
          : null,
        warranty: { ours, manufacturer: manufacturerWarranty(device?.year) },
      },
      records: {
        unit: unit
          ? {
              id: unit.id,
              serial: unit.serial,
              status: unit.status,
              condition: unit.condition,
              storage: unit.storage,
              color: unit.color,
              warrantyMonths: unit.warrantyMonths,
              stockedAt: unit.createdAt,
              updatedAt: unit.updatedAt,
              product: unit.product,
              location: unit.location?.name || null,
              vendor: unit.vendor?.name || null,
            }
          : null,
        tickets: tickets.map((t) => ({
          id: t.id,
          number: t.number,
          status: t.status,
          issue: t.issue,
          warranty: t.warranty,
          at: t.dateIn || t.createdAt,
          completedAt: t.completedAt,
          customer: [t.customer?.firstName, t.customer?.lastName].filter(Boolean).join(" ") || null,
        })),
      },
    });
  });

  return router;
};
