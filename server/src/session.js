// The shift ceiling and the hourly PIN lock, plus the state machine that reads them.
const SHIFT_MS = 6 * 60 * 60 * 1000; // a full password login covers a 6-hour shift
const LOCK_MS = 60 * 60 * 1000; // the screen locks for a PIN every hour

/**
 * "active"  — within the current hour, full access
 * "locked"  — a PIN is needed: either to finish logging in, or the hour lapsed
 * "expired" — the 6-hour shift is over (or no PIN on file); needs a password
 *
 * awaitingPin is the second step of login — password accepted, PIN not yet given,
 * so the shift hasn't started. It reads as "locked" so the PIN screen shows.
 */
function stateOf(session) {
  if (!session || !session.user) return "expired";
  if (session.awaitingPin) return "locked";
  const now = Date.now();
  if (!session.shiftEndsAt || now >= session.shiftEndsAt) return "expired";
  if (session.lockAt && now < session.lockAt) return "active";
  return session.hasPin ? "locked" : "expired";
}

module.exports = { SHIFT_MS, LOCK_MS, stateOf };