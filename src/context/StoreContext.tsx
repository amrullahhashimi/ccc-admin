import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { stores, type Store } from "../lib/api";
import { useAuth } from "./AuthContext";

/**
 * The signed-in user's store, loaded once and shared with everything that draws
 * a logo, an address or a phone number.
 *
 * The master account belongs to no store, so this stays null for them and every
 * consumer falls back to the bundled artwork.
 */

/** Shipped artwork, used until a store uploads its own. */
const DEFAULT_LOGOS = {
  logoLight: "/images/logo/logo.svg",
  logoDark: "/images/logo/logo-dark.svg",
  iconLight: "/images/logo/logo-icon.svg",
  iconDark: "/images/logo/logo-icon-dark.svg",
} as const;

export type LogoSlotName = keyof typeof DEFAULT_LOGOS;

/**
 * The shop's name is remembered on this device so a signed-out screen can
 * still greet someone by it. The sign-in artwork is fixed and needs no cache.
 */
const CACHE_KEY = "ccc.branding";

type Branding = { name?: string };

function readCache(): Branding {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(store: Store) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ name: store.name })
    );
  } catch {
    // A full or blocked localStorage just means the sign-in screen shows defaults.
  }
}

interface StoreState {
  store: Store | null;
  /** Last known shop name and sign-in logo, available before signing in. */
  branding: Branding;
  loading: boolean;
  refresh: () => Promise<void>;
  /** The store's artwork for a slot, or the bundled default. */
  logo: (slot: LogoSlotName) => string;
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [branding, setBranding] = useState<Branding>(() => readCache());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    // No user, or a master account with no store of its own.
    if (!user || !user.storeId) {
      setStore(null);
      return;
    }
    setLoading(true);
    try {
      const s = await stores.settings();
      setStore(s);
      writeCache(s);
      setBranding({ name: s.name });
    } catch {
      setStore(null); // fall back to the bundled artwork
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logo = useCallback(
    (slot: LogoSlotName) => {
      const own = store?.[slot];
      if (own) return own;
      return DEFAULT_LOGOS[slot];
    },
    [store]
  );

  const value = useMemo(
    () => ({ store, branding, loading, refresh, logo }),
    [store, branding, loading, refresh, logo]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
