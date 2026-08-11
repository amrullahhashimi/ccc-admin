const express = require("express");
const store = require("../clover-store");

/**
 * Clover OAuth (v2) for the semi-integrated app.
 *  GET /oauth/connect   -> sends the merchant to Clover to authorize
 *  GET /oauth/callback  -> Clover returns ?code=; we swap it for tokens
 *  GET /oauth/status    -> { connected, merchantId, accessExp } for the UI
 *
 * ENV (server .env):
 *   CLOVER_APP_ID       your app's App ID (client_id)
 *   CLOVER_APP_SECRET   your app's App Secret (client_secret)
 *   CLOVER_SITE_URL     https://admin.caceco.ca
 *   CLOVER_OAUTH_AUTHORIZE_BASE  sandbox: https://sandbox.dev.clover.com
 *                                production: https://www.clover.com
 *   CLOVER_API_BASE     sandbox: https://apisandbox.dev.clover.com
 *                       production: https://api.clover.com
 */
module.exports = () => {
  const router = express.Router();

  const env = () => ({
    appId: process.env.CLOVER_APP_ID,
    appSecret: process.env.CLOVER_APP_SECRET,
    siteUrl: (process.env.CLOVER_SITE_URL || "").replace(/\/$/, ""),
    authorizeBase: process.env.CLOVER_OAUTH_AUTHORIZE_BASE || "https://sandbox.dev.clover.com",
    apiBase: process.env.CLOVER_API_BASE || "https://apisandbox.dev.clover.com",
  });

  router.get("/connect", (req, res) => {
    const { appId, siteUrl, authorizeBase } = env();
    if (!appId || !siteUrl) return res.status(501).send("Set CLOVER_APP_ID and CLOVER_SITE_URL first.");
    const redirectUri = `${siteUrl}/oauth/callback`;
    const url = `${authorizeBase}/oauth/v2/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(url);
  });

  router.get("/callback", async (req, res) => {
    const { code, merchant_id: merchantId } = req.query;
    if (!code) return res.status(400).send("Missing authorization code.");
    const { appId, appSecret, apiBase } = env();
    try {
      const resp = await fetch(`${apiBase}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: appId, client_secret: appSecret, code }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.access_token) throw new Error(data.message || "Token exchange failed.");
      store.write({
        merchantId: merchantId || null,
        accessToken: data.access_token,
        accessExp: data.access_token_expiration || null,
        refreshToken: data.refresh_token || null,
        refreshExp: data.refresh_token_expiration || null,
        savedAt: Date.now(),
      });
      res.redirect("/sales?clover=connected");
    } catch (err) {
      res.status(400).send("Clover connect failed: " + err.message);
    }
  });

  router.get("/status", (req, res) => {
    const t = store.read();
    res.json({
      connected: !!t?.accessToken,
      merchantId: t?.merchantId ?? null,
      accessExp: t?.accessExp ?? null,
      // One-time webhook handshake code, shown here so it doesn't have to be dug out of server logs.
      webhookVerificationCode: t?.webhookVerificationCode ?? null,
    });
  });

  return router;
};