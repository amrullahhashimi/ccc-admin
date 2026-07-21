const express = require("express");
const bcrypt = require("bcryptjs");

module.exports = (prisma) => {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });

    // Same message either way — don't reveal which accounts exist.
    const bad = () => res.status(401).json({ error: "Email or password is incorrect." });
    if (!user || !user.active) return bad();

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return bad();

    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: req.session.user });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get("/me", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not signed in." });
    res.json({ user: req.session.user });
  });

  // Change your own password
  router.post("/password", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Please sign in." });
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

  return router;
};
