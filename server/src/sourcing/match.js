/**
 * Deciding whether a parsed line is a product we already know.
 *
 * The dangerous failure here is not "failed to match" — that just makes one
 * extra catalogue row a person can merge later. The dangerous failure is a
 * confident wrong match: pricing a 32GB WiFi iPad against a vendor's 64GB
 * Cellular stock loses real money and nobody notices until the box arrives.
 *
 * So the scoring is asymmetric. Agreement raises the score gently; a conflict
 * on an attribute that changes what you receive slams the ceiling down below
 * the auto-accept line, no matter how well the names read. Silence (one side
 * simply not saying) is treated as unknown, not as agreement.
 */

const { SIGNIFICANT_FIELDS, buildMatchKey, editDistance } = require("./normalize");

/** A match at or above this may be accepted without anyone looking. */
const AUTO_ACCEPT = 95;
/** Below this, propose a new product instead of a match. */
const NEW_PRODUCT = 50;
/** A conflicting significant attribute can never score above this. */
const CONFLICT_CEILING = 65;
/**
 * Neither can a match where one side simply didn't say.
 *
 * "iPhone XR 64GB Good" and "iPhone XR 64GB Good Unlocked" agree on everything
 * they both state, which is strong evidence — but not proof, because unlocked
 * and carrier-locked stock are priced differently. Scores like this sit just
 * below the auto line so a person still ticks them.
 */
const UNKNOWN_CEILING = 94;

const tokens = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/i)
    .filter(Boolean);

/** 0..1 over word overlap, with a character-level fallback for near-misses. */
function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const setB = new Set(tb);
  let shared = 0;
  for (const t of new Set(ta)) {
    if (setB.has(t)) {
      shared++;
      continue;
    }
    // "fold" vs "fol" — one edit on a word long enough to mean it.
    if (t.length >= 4 && [...setB].some((u) => u.length >= 4 && editDistance(t, u) === 1)) shared += 0.75;
  }

  const overlap = (2 * shared) / (new Set(ta).size + setB.size);

  const sa = ta.join(" ");
  const sb = tb.join(" ");
  const distance = editDistance(sa, sb);
  const charRatio = 1 - distance / Math.max(sa.length, sb.length, 1);

  return Math.max(0, Math.min(1, overlap * 0.75 + charRatio * 0.25));
}

/**
 * How alike one parsed line and one existing product are.
 *
 * Returns the score, the attributes that disagree, and the ones only one side
 * mentions — the review screen shows both, because "they didn't say" and "they
 * said something else" are very different things to a buyer.
 */
function scoreMatch(parsed, candidate) {
  const parsedKey = parsed.matchKey || buildMatchKey(parsed);
  const candidateKey = candidate.matchKey || buildMatchKey(candidate);

  if (parsedKey && parsedKey === candidateKey) {
    return { score: 100, conflicts: [], unknowns: [], exact: true };
  }

  const conflicts = [];
  const unknowns = [];

  // Brand disagreement is close to fatal: an iPad is not a Galaxy Tab.
  const brandA = (parsed.brand || "").toLowerCase();
  const brandB = (candidate.brand || "").toLowerCase();
  const brandConflict = brandA && brandB && brandA !== brandB;
  if (brandConflict) conflicts.push("brand");

  let score = nameSimilarity(
    [parsed.brand, parsed.model, parsed.generation].filter(Boolean).join(" "),
    [candidate.brand, candidate.model, candidate.generation].filter(Boolean).join(" ")
  ) * 70;

  /* Attribute agreement is scored over the attributes both sides actually
     state. Spreading it across all seven would punish an honest short line —
     a vendor who says nothing about RAM has not disagreed about RAM. */
  let comparable = 0;
  let agreed = 0;

  for (const field of SIGNIFICANT_FIELDS) {
    const a = parsed[field] == null || parsed[field] === "" ? null : String(parsed[field]).toLowerCase();
    const b = candidate[field] == null || candidate[field] === "" ? null : String(candidate[field]).toLowerCase();

    if (a && b) {
      comparable++;
      if (a === b) agreed++;
      else conflicts.push(field);
    } else if (a || b) {
      unknowns.push(field); // one side is silent — plausible, but not evidence
    }
  }

  if (comparable) score += 30 * (agreed / comparable);
  score -= Math.min(12, unknowns.length * 6);

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (unknowns.length) score = Math.min(score, UNKNOWN_CEILING);
  if (brandConflict) score = Math.min(score, 20);
  if (conflicts.length) score = Math.min(score, CONFLICT_CEILING);

  return { score, conflicts, unknowns, exact: false };
}

/**
 * Best matches for a parsed line, strongest first.
 *
 * `decision` tells the UI what it is allowed to do on its own:
 *   accept  — identical signature, safe to attach
 *   review  — plausible, but a person confirms
 *   new     — nothing close enough; propose a new product
 */
function rankMatches(parsed, candidates, limit = 5) {
  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreMatch(parsed, candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const best = scored[0];
  let decision = "new";
  if (best) {
    if (best.score >= AUTO_ACCEPT && !best.conflicts.length) decision = "accept";
    else if (best.score >= NEW_PRODUCT) decision = "review";
  }

  /**
   * A strong match with nothing actually contradicting it is put *in* the
   * dropdown ready to go, flagged for confirmation. The alternative default —
   * "create a new product" — quietly grows a second copy of a product every
   * time a vendor writes a shorter line than usual, and nobody notices until
   * the comparison has two half-populated rows for the same thing.
   */
  const suggested = best && decision === "review" && best.score >= 85 && !best.conflicts.length ? best.candidate.id : null;

  return { matches: scored, decision, best: best ?? null, suggested };
}

/** Wording for a score, so the API and the UI can't describe it differently. */
function confidenceLabel(score) {
  if (score >= 100) return "Exact";
  if (score >= 90) return "Very strong";
  if (score >= 70) return "Possible";
  if (score >= 50) return "Weak";
  return "No match";
}

module.exports = { AUTO_ACCEPT, CONFLICT_CEILING, NEW_PRODUCT, confidenceLabel, nameSimilarity, rankMatches, scoreMatch };
