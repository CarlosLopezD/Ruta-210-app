"""Routing via the public OSRM demo server — free, no API key required.

Known limitation: this is a shared public demo instance with no SLA. For a
production deployment this should be swapped for a self-hosted OSRM instance
or a keyed provider such as OpenRouteService.
"""

from __future__ import annotations

import requests

OSRM_BASE_URL = "https://router.project-osrm.org"
METERS_PER_MILE = 1609.34
TIMEOUT_SECONDS = 15


class RoutingError(Exception):
    """Raised when a route can't be computed between two points."""


def get_route_leg(origin: dict, destination: dict) -> dict:
    """
    origin / destination: {"lat": float, "lon": float}

    Returns:
        {
            "geometry": [[lat, lon], ...],
            "distance_miles": float,
            "duration_hours": float,
        }
    """
    coords = f"{origin['lon']},{origin['lat']};{destination['lon']},{destination['lat']}"
    url = f"{OSRM_BASE_URL}/route/v1/driving/{coords}"

    try:
        response = requests.get(
            url,
            params={"overview": "full", "geometries": "geojson"},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise RoutingError(f"No se pudo contactar el servicio de ruteo: {exc}") from exc

    if data.get("code") != "Ok" or not data.get("routes"):
        raise RoutingError(f"No se pudo calcular una ruta: {data.get('message', data.get('code'))}")

    route = data["routes"][0]
    coordinates = route["geometry"]["coordinates"]  # [[lon, lat], ...]
    geometry = [[lat, lon] for lon, lat in coordinates]

    return {
        "geometry": geometry,
        "distance_miles": route["distance"] / METERS_PER_MILE,
        "duration_hours": route["duration"] / 3600,
    }
