require("dotenv").config();

const express = require("express");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-in-env",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12, // 12 hours — a shift
    },
  })
);

/* --------------------------- auth guards --------------------------- */

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: "Please sign in." });
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: "Your role can't do that." });
    }
    next();
  };
}

/* ----------------------------- routes ----------------------------- */

app.use("/api/auth", require("./routes/auth")(prisma));
app.use("/api/products", requireLogin, require("./routes/products")(prisma, requireRole));
app.use("/api/customers", requireLogin, require("./routes/customers")(prisma, requireRole));
app.use("/api/vendors", requireLogin, require("./routes/vendors")(prisma, requireRole));
app.use("/api/categories", requireLogin, require("./routes/categories")(prisma, requireRole));
app.use("/api/brands", requireLogin, require("./routes/brands")(prisma, requireRole));
app.use("/api/meta", requireLogin, require("./routes/meta")(prisma, requireRole));
app.use("/api/dashboard", requireLogin, require("./routes/dashboard")(prisma));

// API only — the React UI runs separately (Vite on 5173, proxying /api here).
app.get("/", (_req, res) => {
  res.json({ service: "CCC Admin API", status: "running" });
});

app.listen(PORT, () => {
  console.log(`CCC POS → http://localhost:${PORT}`);
});
