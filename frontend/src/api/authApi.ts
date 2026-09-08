const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  is_email_verified: boolean;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

export interface RegisterResponse {
  detail: string;
  email: string;
}

export class AuthApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// DRF wraps a field's errors in an array when it bubbles up through a
// serializer's validate() — accept both "value" and ["value"] shapes.
function firstOrSelf(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

async function parseError(response: Response): Promise<AuthApiError> {
  try {
    const body = await response.json();
    const code = firstOrSelf(body?.code);
    const detail = firstOrSelf(body?.detail) ?? firstOrSelf(body?.error);
    if (detail) return new AuthApiError(detail, response.status, code);
    if (body && typeof body === "object") {
      const parts = Object.entries(body).map(([field, errors]) => {
        const text = Array.isArray(errors) ? errors.join(", ") : String(errors);
        return `${field}: ${text}`;
      });
      if (parts.length) return new AuthApiError(parts.join(" — "), response.status, code);
    }
  } catch {
    // ignore — fall through to the generic message below
  }
  return new AuthApiError(`Error ${response.status}`, response.status);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 205) return undefined as T;
  return response.json();
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return postJson("/api/auth/login/", { email, password });
}

export function register(email: string, password: string, display_name?: string): Promise<RegisterResponse> {
  return postJson("/api/auth/register/", { email, password, display_name: display_name ?? "" });
}

export function refreshAccessToken(refresh: string): Promise<{ access: string; refresh?: string }> {
  return postJson("/api/auth/refresh/", { refresh });
}

export function logoutRequest(refresh: string, accessToken: string | null): Promise<void> {
  return fetch(`${API_BASE_URL}/api/auth/logout/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ refresh }),
  }).then(() => undefined); // best-effort — logout clears the local session either way
}

export function verifyEmail(uid: string, token: string): Promise<AuthUser> {
  return postJson("/api/auth/verify-email/", { uid, token });
}

export function resendVerification(email: string): Promise<{ detail: string }> {
  return postJson("/api/auth/resend-verification/", { email });
}

export function requestPasswordReset(email: string): Promise<{ detail: string }> {
  return postJson("/api/auth/password-reset/", { email });
}

export function confirmPasswordReset(uid: string, token: string, new_password: string): Promise<{ detail: string }> {
  return postJson("/api/auth/password-reset/confirm/", { uid, token, new_password });
}

export { API_BASE_URL };
