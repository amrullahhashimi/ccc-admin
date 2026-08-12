require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");
const { stateOf } = require("./session");
const { requireStore } = require("./tenancy");

// Sessions live in MySQL, not memory, so a restart or deploy doesn't sign everyone out.
const expressMySQLSession = require("express-mysql-session");
const MySQLStore = expressMySQLSession(session);

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === "production";

// Behind Railway's HTTPS proxy — needed for secure cookies.
if (isProd) app.set("trust proxy", 1);

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
      sameSite: "lax", // same-origin now — the API and UI share one address
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 6, // 6 hours — outlives a full shift
    },
  })
);

/* --------------------------- auth guards --------------------------- */

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

/* ----------------------------- API routes ----------------------------- */

app.use("/api/auth", require("./routes/auth")(prisma));
app.use("/api/products", requireLogin, requireStore, require("./routes/products")(prisma, requireRole));
app.use("/api/customers", requireLogin, requireStore, require("./routes/customers")(prisma, requireRole));
app.use("/api/vendors", requireLogin, requireStore, require("./routes/vendors")(prisma, requireRole));
app.use("/api/categories", requireLogin, requireStore, require("./routes/categories")(prisma, requireRole));
app.use("/api/brands", requireLogin, requireStore, require("./routes/brands")(prisma, requireRole));
app.use("/api/meta", requireLogin, requireStore, require("./routes/meta")(prisma, requireRole));
app.use("/api/dashboard", requireLogin, requireStore, require("./routes/dashboard")(prisma));
app.use("/api/service", requireLogin, requireStore, require("./routes/service")(prisma, requireRole));
app.use("/api/sales", requireLogin, requireStore, require("./routes/sales")(prisma, requireRole));
app.use("/api/stores", requireLogin, requireStore, require("./routes/stores")(prisma, requireRole));
app.use("/api/sharing", requireLogin, requireStore, require("./routes/sharing")(prisma, requireRole));
app.use("/api/master", requireLogin, require("./routes/master")(prisma));
app.use("/api/tools", requireLogin, requireStore, require("./routes/tools")(prisma));
app.use("/api/track", require("./routes/track")(prisma));
app.use("/oauth", require("./routes/clover")());
app.use("/oauth", require("./routes/clover-webhook")(prisma));

/* -------------------- serve the built React app -------------------- */
// Vite builds the React app to <repo root>/dist. From server/src that's ../../dist.
// Anything that isn't /api falls through to index.html so React Router works.

const clientDir = path.join(__dirname, "..", "..", "dist");
app.use(express.static(clientDir));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found." });
  }
  res.sendFile(path.join(clientDir, "index.html"));
});

/**
 * Last stop for anything a route threw. Without this, an async handler that
 * rejects takes the whole API down with an unhandled rejection instead of
 * answering the request.
 */
app.use((err, req, res, _next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong on the server." });
});

// Anything that still escapes gets logged rather than killing the process.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

app.listen(PORT, () => {
  console.log(`CCC Admin → port ${PORT}`);
});