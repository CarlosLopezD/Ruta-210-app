import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  API_BASE_URL,
  login as apiLogin,
  register as apiRegister,
  refreshAccessToken,
  logoutRequest,
} from "../api/authApi";
import type { AuthUser } from "../api/authApi";

const ACCESS_KEY = "eld-trip-planner:access";
const REFRESH_KEY = "eld-trip-planner:refresh";
const USER_KEY = "eld-trip-planner:user";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore — private browsing / storage disabled
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<{ email: string }>;
  logout: () => Promise<void>;
  authFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = readStorage(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [ready, setReady] = useState(false);

  // Tokens live in a ref (not state) so authFetch always reads the latest
  // value without re-creating the callback on every render.
  const tokens = useRef({ access: readStorage(ACCESS_KEY), refresh: readStorage(REFRESH_KEY) });

  function persistSession(access: string, refresh: string, nextUser: AuthUser) {
    tokens.current = { access, refresh };
    writeStorage(ACCESS_KEY, access);
    writeStorage(REFRESH_KEY, refresh);
    writeStorage(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function clearSession() {
    tokens.current = { access: null, refresh: null };
    writeStorage(ACCESS_KEY, null);
    writeStorage(REFRESH_KEY, null);
    writeStorage(USER_KEY, null);
    setUser(null);
  }

  async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const doFetch = (accessToken: string | null) =>
      fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

    let response = await doFetch(tokens.current.access);

    if (response.status === 401 && tokens.current.refresh) {
      try {
        // Refresh tokens rotate server-side (SIMPLE_JWT.ROTATE_REFRESH_TOKENS):
        // every use returns a NEW refresh token and blacklists the old one,
        // so we must persist the one we get back or the *next* refresh fails.
        const { access, refresh: rotated } = await refreshAccessToken(tokens.current.refresh);
        tokens.current = { access, refresh: rotated ?? tokens.current.refresh };
        writeStorage(ACCESS_KEY, access);
        if (rotated) writeStorage(REFRESH_KEY, rotated);
        response = await doFetch(access);
      } catch {
        clearSession();
      }
    }

    return response;
  }

  useEffect(() => {
    // Validate any persisted session once on load; drop it if it no longer works.
    (async () => {
      if (!tokens.current.access && !tokens.current.refresh) {
        setReady(true);
        return;
      }
      try {
        const response = await authFetch("/api/auth/me/");
        if (response.ok) {
          const freshUser = (await response.json()) as AuthUser;
          writeStorage(USER_KEY, JSON.stringify(freshUser));
          setUser(freshUser);
        } else {
          clearSession();
        }
      } catch {
        // network error on boot — keep whatever we had cached, don't log out
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      ready,
      authFetch,
      async login(email, password) {
        // No try/catch here on purpose: apiLogin already throws AuthApiError
        // for API errors, and a raw network failure throws its own Error.
        // AuthModal tells them apart (instanceof AuthApiError) to pick between
        // the API's specific message and the translated generic one — wrapping
        // errors here would only get in the way of that, as it used to (a
        // hardcoded English "Login failed" was leaking past the translations).
        const data = await apiLogin(email, password);
        persistSession(data.access, data.refresh, data.user);
      },
      async register(email, password, displayName) {
        // Registering no longer logs the user in — the account needs email
        // verification first (see accounts.views.RegisterView). See login()
        // above for why errors aren't caught/rewrapped here either.
        const data = await apiRegister(email, password, displayName);
        return { email: data.email };
      },
      async logout() {
        const refresh = tokens.current.refresh;
        const access = tokens.current.access;
        clearSession();
        if (refresh) {
          try {
            await logoutRequest(refresh, access);
          } catch {
            // best-effort — the local session is already cleared either way
          }
        }
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
