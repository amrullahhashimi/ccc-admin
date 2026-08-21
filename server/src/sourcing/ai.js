/**
 * The escape hatch for messages the rules-based parser can't read.
 *
 * There is no AI service wired into this project, and this doesn't add one as a
 * dependency: it speaks the OpenAI-compatible /chat/completions shape that
 * nearly every provider (and every local runner) exposes, and stays switched off
 * until someone sets the two environment variables. With them unset, the
 * feature works exactly as it does today — the deterministic parser handles
 * everything, and nothing leaves the building.
 *
 *   SOURCING_AI_URL   e.g. https://api.example.com/v1/chat/completions
 *   SOURCING_AI_KEY   bearer token
 *   SOURCING_AI_MODEL optional, defaults below
 *
 * The important rule, and the reason this file is so defensive: model output is
 * treated as *worse* input than the vendor's own text. It is parsed as strict
 * JSON, every field is checked against the same vocabulary the parser uses,
 * anything unrecognised is dropped, and the result still lands in the review
 * table for a person to approve. No path from here reaches the database.
 */

const { normalizeAttributes } = require("./normalize");

const MODEL = process.env.SOURCING_AI_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 20000;

const isEnabled = () => !!(process.env.SOURCING_AI_URL && process.env.SOURCING_AI_KEY);

const SYSTEM_PROMPT = `You extract product offers from a wholesale vendor's price message.

Return STRICT JSON only, no prose, in this exact shape:
{"items":[{"brand":string|null,"model":string|null,"storage":string|null,"ram":string|null,
"connectivity":string|null,"carrier":string|null,"condition":string|null,"grade":string|null,
"color":string|null,"cpu":string|null,"price":number|null,"currency":"CAD"|"USD",
"minimumQuantity":number,"maximumQuantity":number|null,"raw":string}]}

Rules:
- Never invent a value. If the message does not state something, use null.
- price is the per-unit price as a number, not a string, without a currency symbol.
- minimumQuantity is 1 unless the message states a quantity rebate ("if you take 10 or more" -> 10).
- connectivity is one of "WiFi", "Cellular", "WiFi + Cellular", "5G", or null.
- condition is one of "New", "Open box", "Used", "Refurbished", "For parts", or null.
- grade is a single letter A-D or null.
- raw is the original line the item came from.
- Skip greetings, headings and anything that is not a product.`;

/** Only these values are accepted back; anything else becomes null. */
const CONNECTIVITY = ["WiFi", "Cellular", "WiFi + Cellular", "5G"];
const CONDITIONS = ["New", "Open box", "Used", "Refurbished", "For parts"];

const str = (v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t.toLowerCase() === "null" ? null : t.slice(0, 120);
};

const oneOf = (v, allowed) => {
  const t = str(v);
  if (!t) return null;
  return allowed.find((a) => a.toLowerCase() === t.toLowerCase()) ?? null;
};

const qty = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 1000000 ? n : fallback;
};

/**
 * Model output → the same item shape the rules parser produces.
 *
 * Everything is re-derived through normalizeAttributes, so a model that invents
 * "IPAD 8TH GEN WIFI" still comes out as the house spelling and gets the same
 * match key as a line the parser read itself.
 */
function sanitizeItems(payload) {
  const raw = Array.isArray(payload?.items) ? payload.items : [];

  return raw.slice(0, 500).map((item) => {
    const price = Number(item?.price);
    const priceCents = Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null;

    const attributes = normalizeAttributes({
      brand: str(item?.brand),
      model: str(item?.model),
      storage: str(item?.storage),
      ram: str(item?.ram),
      connectivity: oneOf(item?.connectivity, CONNECTIVITY),
      carrier: str(item?.carrier),
      condition: oneOf(item?.condition, CONDITIONS),
      grade: str(item?.grade),
      color: str(item?.color),
      cpu: str(item?.cpu),
    });

    const minQuantity = qty(item?.minimumQuantity, 1);
    const maxRaw = item?.maximumQuantity;
    const maxQuantity = maxRaw == null ? null : qty(maxRaw, null);

    return {
      raw: str(item?.raw) || "",
      ...attributes,
      priceCents,
      currency: oneOf(item?.currency, ["CAD", "USD"]),
      minQuantity,
      maxQuantity: maxQuantity && maxQuantity >= minQuantity ? maxQuantity : null,
      confidence: 60, // read by a model, not by rules — always worth a look
      warnings: ["Read by the AI assistant — check this row before saving."],
      source: "ai",
    };
  }).filter((item) => item.model || item.priceCents != null);
}

/**
 * Ask the model to read a message. Resolves to null whenever anything at all
 * goes wrong, so the caller quietly keeps the rules-based result.
 */
async function parseWithAi(message) {
  if (!isEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(process.env.SOURCING_AI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SOURCING_AI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: String(message || "").slice(0, 20000) },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[sourcing/ai] provider answered ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    // Models sometimes wrap JSON in a code fence however firmly you ask.
    const json = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    return sanitizeItems(JSON.parse(json));
  } catch (err) {
    console.warn("[sourcing/ai] unavailable:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isEnabled, parseWithAi, sanitizeItems };
