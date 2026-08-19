const fs = require("fs");
const path = require("path");

// Tokens live in a JSON file next to the server (single-merchant shop).
// Add ".clover-tokens.json" to .gitignore — it holds live credentials.
const STORE = path.join(__dirname, "..", ".clover-tokens.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return null;
  }
}

function write(tokens) {
  fs.writeFileSync(STORE, JSON.stringify(tokens, null, 2));
}

/** Merge-write — for updating one field (e.g. webhookAuth) without clobbering the rest. */
function patch(fields) {
  const current = read() || {};
  const next = { ...current, ...fields };
  write(next);
  return next;
}

// Refresh 5 minutes before the token actually expires, not after.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// De-dupes concurrent refreshes within this process — Clover's refresh token
// is single-use, so two simultaneous callers can't both redeem the same one.
let refreshing = null;

async function doRefresh(refreshToken) {
  const apiBase = process.env.CLOVER_API_BASE || "https://apisandbox.dev.clover.com";
  const resp = await fetch(`${apiBase}/oauth/v2/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.CLOVER_APP_ID, refresh_token: refreshToken }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(data.message || "Clover token refresh failed — reconnect at /oauth/connect.");
  }
  return patch({
    accessToken: data.access_token,
    accessExp: data.access_token_expiration ?? null,
    // The refresh token itself rotates on every use — the old one is dead the instant this responds.
    refreshToken: data.refresh_token ?? refreshToken,
    refreshExp: data.refresh_token_expiration ?? null,
    savedAt: Date.now(),
  });
}

/**
 * A merchant API token pasted straight into .env (Clover dashboard → Setup →
 * API Tokens). It never expires and needs no OAuth round trip, so a
 * single-merchant shop can skip /oauth/connect entirely. It is set
 * deliberately, so it wins over the token store — otherwise a stale sandbox
 * connection would silently shadow it. CLOVER_OAUTH_TOKEN is the older name.
 */
const staticToken = () => process.env.CLOVER_API_TOKEN || process.env.CLOVER_OAUTH_TOKEN || null;

/**
 * A live access token, transparently refreshing it first if it's expired or
 * about to be. Callers never need to think about expiry — this is the one
 * true way to get a token for a Clover API call. Throws if there is neither a
 * static token nor a completed /oauth/connect authorization.
 */
async function getAccessToken() {
  const manual = staticToken();
  if (manual) return manual;

  const tokens = read();
  if (!tokens?.accessToken) {
    const e = new Error(
      "Clover isn't connected — set CLOVER_API_TOKEN in the server .env, or visit /oauth/connect once to authorize it."
    );
    e.status = 501;
    throw e;
  }

  const expiresAt = tokens.accessExp ? Number(tokens.accessExp) * 1000 : 0;
  if (expiresAt && Date.now() < expiresAt - REFRESH_BUFFER_MS) return tokens.accessToken;
  if (!tokens.refreshToken) return tokens.accessToken; // nothing to refresh with — best effort

  if (!refreshing) refreshing = doRefresh(tokens.refreshToken).finally(() => { refreshing = null; });
  const updated = await refreshing;
  return updated.accessToken;
}

module.exports = { read, write, patch, getAccessToken, staticToken };