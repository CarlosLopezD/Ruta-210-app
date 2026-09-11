"""Geocoding via Nominatim (OpenStreetMap) — free, no API key required.

Usage policy (https://operations.osmfoundation.org/policies/nominatim/) requires a
descriptive User-Agent and at most ~1 request/second, which comfortably fits this
app's use case (up to 3 geocode calls per trip request).
"""

from __future__ import annotations

import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ruta-210-app/1.0 (+https://ruta-210-app.lcarlosdario2020.workers.dev)"
TIMEOUT_SECONDS = 10


class GeocodingError(Exception):
    """Raised when an address can't be resolved to coordinates."""


def geocode(address: str) -> dict:
    """
    Resolve a free-text address to coordinates.

    Returns {"lat": float, "lon": float, "display_name": str}.
    Raises GeocodingError if the address can't be found or the service fails.
    """
    if not address or not address.strip():
        raise GeocodingError("La dirección no puede estar vacía.")

    try:
        response = requests.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json()
    except requests.RequestException as exc:
        raise GeocodingError(f"No se pudo contactar el servicio de geocoding: {exc}") from exc

    if not results:
        raise GeocodingError(f"No se encontró la dirección: '{address}'")

    result = results[0]
    return {
        "lat": float(result["lat"]),
        "lon": float(result["lon"]),
        "display_name": result.get("display_name", address),
    }
