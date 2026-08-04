require("dotenv").config();

const path = require("path");
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
app.use("/api/products", requireLogin, require("./routes/products")(prisma, requireRole));
app.use("/api/customers", requireLogin, require("./routes/customers")(prisma, requireRole));
app.use("/api/vendors", requireLogin, require("./routes/vendors")(prisma, requireRole));
app.use("/api/categories", requireLogin, require("./routes/categories")(prisma, requireRole));
app.use("/api/brands", requireLogin, require("./routes/brands")(prisma, requireRole));
app.use("/api/meta", requireLogin, require("./routes/meta")(prisma, requireRole));
app.use("/api/dashboard", requireLogin, require("./routes/dashboard")(prisma));
app.use("/api/service", requireLogin, require("./routes/service")(prisma, requireRole));
app.use("/api/track", require("./routes/track")(prisma));

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

app.listen(PORT, () => {
  console.log(`CCC Admin → port ${PORT}`);
});