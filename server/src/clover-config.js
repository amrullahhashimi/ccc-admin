/**
 * Where a store's Clover credentials come from.
 *
 * They live on the Store row, entered once in Store settings → Connect to
 * Clover, and are used on every request from then on — there is no per-session
 * handshake to redo after signing in.
 *
 * Nothing here reaches the browser directly — routes/stores.js masks the token
 * before replying. See clover-store.js for the older OAuth token flow, which
 * is still what /oauth/connect writes.
 */

const API_BASES = {
  production: "https://api.clover.com",
  sandbox: "https://apisandbox.dev.clover.com",
};

const ENVS = Object.keys(API_BASES);

const apiBaseFor = (env) => API_BASES[env] || API_BASES.production;

/**
 * The credentials to use for one store — from its own row and nowhere else.
 *
 * Deliberately no .env fallback. Reading a shared default would mean a store
 * that has never connected anything still resolves to whatever account the
 * server was configured with, and on a multi-store deployment that shows one
 * shop another shop's merchant data. Not connected has to mean not connected.
 *
 * A missing `token` just means the store hasn't connected yet — callers report
 * that, they don't throw.
 */
function configForStore(store) {
  const env = ENVS.includes(store?.cloverEnv) ? store.cloverEnv : "production";
  return {
    env,
    apiBase: apiBaseFor(env),
    merchantId: store?.cloverMerchantId || null,
    token: store?.cloverApiToken || null,
  };
}

/** True when there's enough to talk to the merchant's REST API. */
const isConnected = (cfg) => !!(cfg.merchantId && cfg.token);

/**
 * Ask Clover whether these credentials are real, and whose account they open.
 * Resolves to the merchant's name — the useful thing to show back to the shop,
 * since it confirms they connected the account they meant to.
 */
async function verify({ apiBase, merchantId, token }) {
  let resp;
  try {
    resp = await fetch(`${apiBase}/v3/merchants/${encodeURIComponent(merchantId)}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
  } catch {
    throw new Error("Couldn't reach Clover. Check the server's internet connection.");
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Clover rejected that API token. Check the token and the environment.");
  }
  if (resp.status === 404) {
    throw new Error("Clover doesn't know that merchant ID in this environment.");
  }
  if (!resp.ok) {
    throw new Error(`Clover answered ${resp.status}. Try again in a moment.`);
  }

  const data = await resp.json().catch(() => ({}));
  return { merchantName: data.name || null };
}

/** Last four characters, so the shop can tell which token is saved without exposing it. */
const maskToken = (token) => (token ? `••••${String(token).slice(-4)}` : null);

module.exports = { API_BASES, ENVS, apiBaseFor, configForStore, isConnected, verify, maskToken };
