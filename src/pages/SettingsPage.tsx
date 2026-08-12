import { useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const panelClass =
  "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, 6);

/* --------------------------------- PIN --------------------------------- */

function PinCard() {
  const { hasPin, refresh } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN must be 4 to 6 digits.");
    if (pin !== confirm) return setError("The two PINs don't match.");

    setBusy(true);
    try {
      await auth.setPin(pin);
      await refresh();
      setPin("");
      setConfirm("");
      setMsg("PIN saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the PIN.");
    }
    setBusy(false);
  };

  return (
    <div className={panelClass}>
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Unlock PIN</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          After the first hour of a shift the screen locks. Your PIN unlocks it for another hour,
          up to six hours — then you sign in with your password again.
        </p>
      </div>

      <form onSubmit={save} className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{hasPin ? "New PIN" : "PIN"} (4–6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              className={inputClass}
              value={pin}
              onChange={(e) => setPin(onlyDigits(e.target.value))}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(onlyDigits(e.target.value))}
              autoComplete="off"
            />
          </div>
        </div>

        {error && <p className="text-sm text-error-500">{error}</p>}
        {msg && <p className="text-sm text-success-600">{msg}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Saving…" : hasPin ? "Change PIN" : "Set PIN"}
          </button>
        </div>

        {!hasPin && (
          <p className="rounded-lg bg-warning-50 px-4 py-3 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
            You don't have a PIN yet, so the screen will ask for your full password every hour.
            Set one to unlock more quickly.
          </p>
        )}
      </form>
    </div>
  );
}

/* ------------------------------- password ------------------------------- */

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("The two passwords don't match.");

    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg("Password changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    }
    setBusy(false);
  };

  return (
    <div className={panelClass}>
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Password</h2>
      </div>
      <form onSubmit={save} className="space-y-4 p-6">
        <div>
          <label className={labelClass}>Current password</label>
          <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>New password</label>
            <input type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className={labelClass}>Confirm new password</label>
            <input type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </div>

        {error && <p className="text-sm text-error-500">{error}</p>}
        {msg && <p className="text-sm text-success-600">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Settings</h1>
        {user && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user.name} · {user.email}
          </p>
        )}
      </div>

      <PinCard />
      <PasswordCard />
    </div>
  );
}