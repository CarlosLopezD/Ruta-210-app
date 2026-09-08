import type { TripPlanResponse, TripRequest } from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

export class TripApiError extends Error {}

export async function planTrip(payload: TripRequest): Promise<TripPlanResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/trips/plan/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new TripApiError(
      "No se pudo conectar con el servidor. Verificá tu conexión o que el backend esté disponible."
    );
  }

  if (!response.ok) {
    let message = `Ocurrió un error al planificar el viaje (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      } else if (body && typeof body === "object") {
        const parts = Object.entries(body).map(([field, errors]) => {
          const text = Array.isArray(errors) ? errors.join(", ") : String(errors);
          return `${field}: ${text}`;
        });
        if (parts.length) message = parts.join(" — ");
      }
    } catch {
      // keep default message
    }
    throw new TripApiError(message);
  }

  return (await response.json()) as TripPlanResponse;
}
