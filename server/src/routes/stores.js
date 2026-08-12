const express = require("express");
const { ah } = require("../async-route");
const { storeId } = require("../tenancy");

/**
 * A store's own settings: name, branding, contact details, label stock and the
 * terms printed on service paperwork.
 *
 * Sharing with other stores lives in routes/sharing.js.
 */

/**
 * The logo slots the app actually uses, with the size each is drawn at.
 * The settings page renders its upload boxes straight from this, so the advice
 * shown to the shop can't drift from what the code enforces.
 *
 * `width`/`height` are the on-screen size; the advice asks for double that so
 * the artwork stays sharp on a high-resolution screen. An SVG ignores all of
 * that and scales perfectly, which is why it's the first suggestion.
 */
const LOGO_SLOTS = {
  logoLight: {
    label: "Full logo — light background",
    use: "Sidebar and header in light mode, and printed service paperwork.",
    width: 150,
    height: 40,
    maxKb: 300,
  },
  logoDark: {
    label: "Full logo — dark background",
    use: "Sidebar and header when the app is in dark mode.",
    width: 150,
    height: 40,
    maxKb: 300,
  },
  iconLight: {
    label: "Icon — light background",
    use: "Shown instead of the full logo when the sidebar is collapsed.",
    width: 32,
    height: 32,
    maxKb: 100,
  },
  iconDark: {
    label: "Icon — dark background",
    use: "The collapsed sidebar in dark mode.",
    width: 32,
    height: 32,
    maxKb: 100,
  },
  authLogo: {
    label: "Sign-in screen",
    use: "The large logo beside the sign-in form.",
    width: 231,
    height: 48,
    maxKb: 300,
  },
};

/** Base64 inflates a file by about a third — this is the raw data: URL length. */
const charLimit = (maxKb) => Math.round(maxKb * 1024 * 1.37);

function shapeSettings(body) {
  const d = {};

  ["name", "phone", "website"].forEach((k) => {
    if (body[k] !== undefined) {
      const v = String(body[k] ?? "").trim();
      if (k === "name") {
        if (v) d.name = v;
      } else {
        d[k] = v || null;
      }
    }
  });

  ["address", "serviceTerms"].forEach((k) => {
    if (body[k] !== undefined) d[k] = String(body[k] ?? "").trim() || null;
  });

  ["labelWidthMm", "labelHeightMm"].forEach((k) => {
    if (body[k] !== undefined && body[k] !== "") {
      const n = parseInt(body[k], 10);
      if (Number.isFinite(n) && n > 0 && n <= 300) d[k] = n;
    }
  });


  return d;
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /* ------------------------- my store's settings ------------------------- */

  router.get("/settings", ah(async (req, res) => {
    const store = await prisma.store.findUnique({ where: { id: storeId(req) } });
    if (!store) return res.status(404).json({ error: "Store not found." });
    res.json(store);
  }));

  /** So the settings page draws the same slots the server accepts. */
  router.get("/logo-slots", (_req, res) => res.json(LOGO_SLOTS));

  router.patch("/settings", requireRole("OWNER", "MANAGER"), ah(async (req, res) => {
    try {
      const data = shapeSettings(req.body);

      for (const [slot, spec] of Object.entries(LOGO_SLOTS)) {
        if (req.body?.[slot] === undefined) continue;

        const value = req.body[slot];
        if (value === null || value === "") {
          data[slot] = null;
          continue;
        }

        const url = String(value);
        if (!url.startsWith("data:image/")) {
          return res.status(400).json({ error: `${spec.label} needs to be an image file.` });
        }
        if (url.length > charLimit(spec.maxKb)) {
          return res.status(400).json({
            error: `${spec.label} is too large — keep it under ${spec.maxKb} KB.`,
          });
        }
        data[slot] = url;
      }

      const updated = await prisma.store.update({ where: { id: storeId(req) }, data });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }));

  return router;
};
