const express = require("express");
const bcrypt = require("bcryptjs");
const { SHIFT_MS, LOCK_MS, stateOf } = require("../session");

module.exports = (prisma) => {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { store: { select: { id: true, name: true, active: true } } },
    });

    const bad = () => res.status(401).json({ error: "Email or password is incorrect." });
    if (!user || !user.active) return bad();
    // The master belongs to no store; everyone else needs theirs switched on.
    if (user.storeId && !user.store?.active) {
      return res.status(403).json({ error: "This store has been switched off. Contact your administrator." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return bad();

    const now = Date.now();
    // storeId rides in the session — every query below the API layer filters on it.
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      storeName: user.store?.name ?? null,
      superAdmin: user.superAdmin,
    };
    req.session.hasPin = !!user.pinHash;
    req.session.cookie.maxAge = SHIFT_MS;

    if (user.pinHash) {
      // Password accepted — now require the PIN as a second step before the shift starts.
      req.session.awaitingPin = true;
      req.session.shiftEndsAt = null;
      req.session.lockAt = null;
      return res.json({ user: req.session.user, needPin: true });
    }

    // No PIN configured yet — let them in on the password alone so they can set one.
    req.session.awaitingPin = false;
    req.session.shiftEndsAt = now + SHIFT_MS;
    req.session.lockAt = now + LOCK_MS;
    res.json({ user: req.session.user, needPin: false });
  });

  router.get("/me", (req, res) => {
    const state = stateOf(req.session);
    if (state === "active") {
      return res.json({ user: req.session.user, locked: false, hasPin: !!req.session.hasPin });
    }
    if (state === "locked") {
      return res.json({ user: req.session.user, locked: true, hasPin: true });
    }
    return res.status(401).json({ error: "Please sign in." });
  });

  // Activity ping — real user activity pushes the inactivity lock forward,
  // capped at the shift ceiling. Does nothing if the shift has ended or a PIN is pending.
  router.post("/ping", (req, res) => {
    const s = req.session;
    if (s && s.user && !s.awaitingPin && s.shiftEndsAt && Date.now() < s.shiftEndsAt) {
      s.lockAt = Math.min(Date.now() + LOCK_MS, s.shiftEndsAt);
    }
    res.json({ ok: true });
  });

  /** Handles both the second step of login and the inactivity unlock. */
  router.post("/unlock", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Please sign in." });

    // Unlocks need the shift still running; the login PIN step doesn't (no shift yet).
    if (!req.session.awaitingPin) {
      if (!req.session.shiftEndsAt || Date.now() >= req.session.shiftEndsAt) {
        return res.status(401).json({
          error: "Your shift has ended — please sign in with your password.",
          expired: true,
        });
      }
    }

    if (!req.session.hasPin) {
      return res.status(401).json({ error: "No PIN set — please sign in with your password." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
    if (!user || !user.active || !user.pinHash) {
      return res.status(401).json({ error: "Please sign in with your password." });
    }

    const ok = await bcrypt.compare(String(req.body?.pin || ""), user.pinHash);
    if (!ok) return res.status(401).json({ error: "Wrong PIN." });

    const now = Date.now();
    if (req.session.awaitingPin) {
      // Second step of login done — start the shift now.
      req.session.awaitingPin = false;
      req.session.shiftEndsAt = now + SHIFT_MS;
    }
    req.session.lockAt = now + LOCK_MS;
    res.json({ user: req.session.user });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.post("/password", async (req, res) => {
    if (stateOf(req.session) !== "active") return res.status(401).json({ error: "Please sign in." });
    const { current, next } = req.body || {};
    if (!next || next.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
    const ok = await bcrypt.compare(current || "", user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(next, 12) },
    });
    res.json({ ok: true });
  });

  router.post("/pin", async (req, res) => {
    if (stateOf(req.session) !== "active") return res.status(401).json({ error: "Please sign in." });
    const pin = String(req.body?.pin || "");
    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be 4 to 6 digits." });
    }
    await prisma.user.update({
      where: { id: req.session.user.id },
      data: { pinHash: await bcrypt.hash(pin, 12) },
    });
    req.session.hasPin = true;
    res.json({ ok: true });
  });

  return router;
};