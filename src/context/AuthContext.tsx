import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router";
import { auth, type Role, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  locked: boolean;
  hasPin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user, locked, hasPin } = await auth.me();
      setUser(user);
      setLocked(locked);
      setHasPin(hasPin);
    } catch {
      setUser(null);
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Idle lock: real user activity pushes the server's 2-hour lock forward
  // (throttled to once a minute). No activity for 2h → server locks → the poll
  // below picks it up and shows the PIN screen.
  useEffect(() => {
    if (!user || locked) return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 60000) return; // ping at most once a minute
      last = now;
      auth.ping().catch(() => {});
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [user, locked]);

  // Poll so the lock appears on time — every 30s and whenever the tab regains focus.
  useEffect(() => {
    if (!user) return;
    const tick = () => refresh();
    const id = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [user, refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user, needPin } = await auth.login(email, password);
    setUser(user);
    setHasPin(needPin);
    setLocked(needPin); // account has a PIN → show the PIN step before letting them in
  }, []);

  const unlock = useCallback(async (pin: string) => {
    const { user } = await auth.unlock(pin);
    setUser(user);
    setLocked(false);
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout().catch(() => {});
    setUser(null);
    setLocked(false);
  }, []);

  const can = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, locked, hasPin, loading, signIn, unlock, signOut, refresh, can }),
    [user, locked, hasPin, loading, signIn, unlock, signOut, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Wrap any route that needs a signed-in user. Shows the PIN lock when the shift lapses. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, locked, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/signin" state={{ from: location }} replace />;

  if (locked) return <LockScreen />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
          <p className="font-medium text-red-700 dark:text-red-400">
            Your role doesn't have access to this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/* ------------------------------ lock screen ------------------------------ */

function LockScreen() {
  const { unlock, signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await unlock(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong PIN.");
      setPin("");
      inputRef.current?.focus();
    }
    setBusy(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">Screen locked</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter your PIN to unlock and continue.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••"
            className="h-14 w-full rounded-xl border border-gray-300 bg-transparent text-center text-2xl tracking-[0.5em] text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
          />
          {error && <p className="text-sm text-error-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="h-12 w-full rounded-xl bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>

        <button
          onClick={signOut}
          className="mt-4 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}