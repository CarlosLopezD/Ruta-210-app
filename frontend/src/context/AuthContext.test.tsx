import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthApiError } from "../api/authApi";
import * as authApi from "../api/authApi";

// Same approach as AuthModal.test.tsx: mock the whole module so no real
// network call happens, but keep AuthApiError real since AuthContext's boot
// logic uses `instanceof AuthApiError` to tell "definitely logged out" (401)
// apart from "just a network hiccup" (anything else).
vi.mock("../api/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/authApi")>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    refreshAccessToken: vi.fn(),
    logoutRequest: vi.fn(),
  };
});

const USER_KEY = "eld-trip-planner:user";
const CACHED_USER = { id: 1, email: "carlos@example.com", display_name: "Carlos", is_email_verified: true };

// A minimal consumer that exposes AuthContext's state/actions as plain DOM
// so tests can read and drive it without reaching into React internals.
function Consumer() {
  const { ready, isAuthenticated, user, login, logout, authFetch } = useAuth();
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? ""}</span>
      <button onClick={() => void login("carlos@example.com", "supersecreta123")}>login</button>
      <button onClick={() => void logout()}>logout</button>
      <button onClick={() => void authFetch("/api/trips/history/")}>call-protected</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

async function waitUntilReady() {
  await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

describe("AuthContext boot behavior", () => {
  it("sin usuario cacheado, queda lista de inmediato sin pedir un refresh", async () => {
    renderAuth();
    await waitUntilReady();
    expect(screen.getByTestId("authed").textContent).toBe("false");
    expect(authApi.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("con usuario cacheado, pide un access token con la cookie y revalida con /me/", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CACHED_USER));
    vi.mocked(authApi.refreshAccessToken).mockResolvedValue({ access: "new-access" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(CACHED_USER), { status: 200 }));

    renderAuth();
    await waitUntilReady();

    expect(screen.getByTestId("authed").textContent).toBe("true");
    expect(screen.getByTestId("email").textContent).toBe("carlos@example.com");
    expect(authApi.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("si el refresh da 401 (cookie ausente o vencida), limpia la sesión cacheada", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CACHED_USER));
    vi.mocked(authApi.refreshAccessToken).mockRejectedValue(new AuthApiError("No session", 401));

    renderAuth();
    await waitUntilReady();

    expect(screen.getByTestId("authed").textContent).toBe("false");
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it("si el refresh falla por un error de red, mantiene el usuario cacheado en vez de desloguear", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CACHED_USER));
    vi.mocked(authApi.refreshAccessToken).mockRejectedValue(new TypeError("Failed to fetch"));

    renderAuth();
    await waitUntilReady();

    expect(screen.getByTestId("authed").textContent).toBe("true");
    expect(screen.getByTestId("email").textContent).toBe("carlos@example.com");
  });
});

describe("AuthContext login/logout", () => {
  it("login exitoso deja al usuario autenticado y cachea su perfil (sin refresh token en juego)", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ access: "access-token", user: CACHED_USER });
    renderAuth();
    await waitUntilReady();

    await user.click(screen.getByText("login"));

    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("true"));
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? "null")).toEqual(CACHED_USER);
  });

  it("logout limpia la sesión local y avisa al backend con el access token (no con un refresh token)", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ access: "access-token", user: CACHED_USER });
    vi.mocked(authApi.logoutRequest).mockResolvedValue(undefined);
    renderAuth();
    await waitUntilReady();
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("true"));

    await user.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("false"));
    expect(authApi.logoutRequest).toHaveBeenCalledWith("access-token");
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});

describe("AuthContext.authFetch", () => {
  it("ante un 401, pide un access token nuevo con la cookie y reintenta la request", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ access: "stale-access", user: CACHED_USER });
    vi.mocked(authApi.refreshAccessToken).mockResolvedValue({ access: "fresh-access" });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    renderAuth();
    await waitUntilReady();
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("true"));

    await user.click(screen.getByText("call-protected"));

    await waitFor(() => expect(authApi.refreshAccessToken).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondCallOptions = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = secondCallOptions.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fresh-access");
  });

  it("si el refresh también falla, deja al usuario deslogueado", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ access: "stale-access", user: CACHED_USER });
    vi.mocked(authApi.refreshAccessToken).mockRejectedValue(new AuthApiError("No session", 401));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));

    renderAuth();
    await waitUntilReady();
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("true"));

    await user.click(screen.getByText("call-protected"));

    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("false"));
  });
});
