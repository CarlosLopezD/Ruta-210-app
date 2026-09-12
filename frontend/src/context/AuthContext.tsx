import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  API_BASE_URL,
  AuthApiError,
  login as apiLogin,
  register as apiRegister,
  refreshAccessToken,
  logoutRequest,
} from "../api/authApi";
import type { AuthUser } from "../api/authApi";

// The refresh token is never stored here at all anymore — it lives only in
// an httpOnly cookie the browser manages, invisible to this (or any) script.
// The access token isn't persisted either; it lives only in the `accessToken`
// ref below, in memory. On a full page reload that memory is gone, so we
// silently ask /api/auth/refresh/ for a new one using the cookie (see the
// boot effect) instead of trusting anything read back from storage.
//
// USER_KEY is the one thing still cached: it's profile info, not a
// credential, so keeping it lets a returning user see their name
// immediately instead of a loading flicker while that silent refresh runs.
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

  // In-memory only (see the module-level comment above) — not a ref that
  // mirrors storage, the ONLY copy of the access token there is.
  const accessToken = useRef<string | null>(null);

  function persistSession(access: string, nextUser: AuthUser) {
    accessToken.current = access;
    writeStorage(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function clearSession() {
    accessToken.current = null;
    writeStorage(USER_KEY, null);
    setUser(null);
  }

  async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const doFetch = (token: string | null) =>
      fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "same-origin",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    let response = await doFetch(accessToken.current);

    if (response.status === 401) {
      try {
        // The refresh token itself isn't handled here at all — it's an
        // httpOnly cookie the browser already attached to that request.
        const { access } = await refreshAccessToken();
        accessToken.current = access;
        response = await doFetch(access);
      } catch {
        clearSession();
      }
    }

    return response;
  }

  useEffect(() => {
    // A cached user is just a display hint (see USER_KEY comment above) —
    // if there isn't one, this was never a logged-in session, so skip the
    // round-trip entirely and land on "logged out" immediately.
    if (!readStorage(USER_KEY)) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        // No access token survives a reload, so the session is re-derived
        // from scratch: ask for a fresh access token using the refresh
        // cookie, then fetch the current user with it.
        const { access } = await refreshAccessToken();
        accessToken.current = access;
        const response = await authFetch("/api/auth/me/");
        if (response.ok) {
          const freshUser = (await response.json()) as AuthUser;
          writeStorage(USER_KEY, JSON.stringify(freshUser));
          setUser(freshUser);
        } else {
          clearSession();
        }
      } catch (err) {
        // A 401 here means the refresh cookie is missing/expired/invalid —
        // there's genuinely no session anymore, so drop the cached display.
        // Anything else (network hiccup, backend briefly down) keeps
        // whatever was cached rather than bouncing the user to "logged out".
        if (err instanceof AuthApiError && err.status === 401) {
          clearSession();
        }
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
        persistSession(data.access, data.user);
      },
      async register(email, password, displayName) {
        // Registering no longer logs the user in — the account needs email
        // verification first (see accounts.views.RegisterView). See login()
        // above for why errors aren't caught/rewrapped here either.
        const data = await apiRegister(email, password, displayName);
        return { email: data.email };
      },
      async logout() {
        const access = accessToken.current;
        clearSession();
        try {
          // The backend reads the refresh token from the cookie itself and
          // clears it server-side (blacklist + delete the cookie) — nothing
          // to pass here besides the access token, for the Authorization header.
          await logoutRequest(access);
        } catch {
          // best-effort — the local session is already cleared either way
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
