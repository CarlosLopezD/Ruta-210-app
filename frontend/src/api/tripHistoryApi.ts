import type { TripHistoryItem, TripPlanResponse, TripRequest, TripStatus } from "../types";

type AuthFetch = (path: string, options?: RequestInit) => Promise<Response>;

export class TripHistoryApiError extends Error {}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.error === "string") return body.error;
  } catch {
    // ignore
  }
  return `Error ${response.status}`;
}

export interface SaveTripPayload extends TripRequest {
  status: TripStatus;
  plan_result: TripPlanResponse;
}

export async function saveTrip(authFetch: AuthFetch, payload: SaveTripPayload): Promise<TripHistoryItem> {
  const response = await authFetch("/api/trips/history/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new TripHistoryApiError(await parseErrorMessage(response));
  return response.json();
}

export async function listTrips(authFetch: AuthFetch): Promise<TripHistoryItem[]> {
  const response = await authFetch("/api/trips/history/");
  if (!response.ok) throw new TripHistoryApiError(await parseErrorMessage(response));
  return response.json();
}

export async function updateTripStatus(
  authFetch: AuthFetch,
  id: number,
  status: TripStatus
): Promise<TripHistoryItem> {
  const response = await authFetch(`/api/trips/history/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new TripHistoryApiError(await parseErrorMessage(response));
  return response.json();
}

export async function updateTripPlanResult(
  authFetch: AuthFetch,
  id: number,
  planResult: TripPlanResponse
): Promise<TripHistoryItem> {
  const response = await authFetch(`/api/trips/history/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ plan_result: planResult }),
  });
  if (!response.ok) throw new TripHistoryApiError(await parseErrorMessage(response));
  return response.json();
}

export async function deleteTrip(authFetch: AuthFetch, id: number): Promise<void> {
  const response = await authFetch(`/api/trips/history/${id}/`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) throw new TripHistoryApiError(await parseErrorMessage(response));
}
