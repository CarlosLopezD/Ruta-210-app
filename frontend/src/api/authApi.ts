const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

export class AuthApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.error === "string") return body.error;
    if (body && typeof body === "object") {
      const parts = Object.entries(body).map(([field, errors]) => {
        const text = Array.isArray(errors) ? errors.join(", ") : String(errors);
        return `${field}: ${text}`;
      });
      if (parts.length) return parts.join(" — ");
    }
  } catch {
    // ignore
  }
  return `Error ${response.status}`;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new AuthApiError(await parseErrorMessage(response), response.status);
  return response.json();
}

export async function register(email: string, password: string, display_name?: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: display_name ?? "" }),
  });
  if (!response.ok) throw new AuthApiError(await parseErrorMessage(response), response.status);
  return response.json();
}

export async function refreshAccessToken(refresh: string): Promise<{ access: string }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) throw new AuthApiError(await parseErrorMessage(response), response.status);
  return response.json();
}

export { API_BASE_URL };
