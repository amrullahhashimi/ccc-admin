require("dotenv").config();

const express = require("express");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");
const { stateOf } = require("./session");

// Sessions live in MySQL, not memory, so a restart or deploy doesn't sign everyone out.
const expressMySQLSession = require("express-mysql-session");
const MySQLStore = expressMySQLSession(session);

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === "production";

// Behind Railway's HTTPS proxy — needed for secure cookies to work.
if (isProd) app.set("trust proxy", 1);

/* ------------------------------ CORS ------------------------------ */
// The UI and API sit on different subdomains in production, so the browser
// needs explicit permission to send the session cookie across.
const FRONTEND_URL = process.env.FRONTEND_URL || "";
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin === FRONTEND_URL) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// Pull the MySQL connection details straight from DATABASE_URL.
const dbUrl = new URL(process.env.DATABASE_URL);
const sessionStore = new MySQLStore({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 3306),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
  createDatabaseTable: true,
});

app.use(
  session({
    key: "ccc.sid",
    secret: process.env.SESSION_SECRET || "change-this-in-env",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax", // "none" lets the cookie cross subdomains
      secure: isProd, // required whenever sameSite is "none"
      maxAge: 1000 * 60 * 60 * 6, // 6 hours — outlives a full shift
    },
  })
);

/* --------------------------- auth guards --------------------------- */
// These use stateOf so the PIN lock and shift expiry are enforced server-side,
// not just in the browser.

function requireLogin(req, res, next) {
  const state = stateOf(req.session);
  if (state === "active") return next();
  if (state === "locked") return res.status(401).json({ error: "Session locked.", locked: true });
  return res.status(401).json({ error: "Please sign in." });
}

function requireRole(...roles) {
  return (req, res, next) => {
    const state = stateOf(req.session);
    if (state === "locked") return res.status(401).json({ error: "Session locked.", locked: true });
    if (state !== "active") return res.status(401).json({ error: "Please sign in." });
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

// Health check.
app.get("/", (_req, res) => {
  res.json({ service: "CCC Admin API", status: "running" });
});

app.listen(PORT, () => {
  console.log(`CCC Admin API → port ${PORT}`);
});