"""Small geometry helpers shared by the routing and HOS-engine services."""

from __future__ import annotations

import math

EARTH_RADIUS_MILES = 3958.8


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points, in miles."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1, math.sqrt(a)))


def point_at_distance(geometry: list[list[float]], target_miles: float) -> list[float]:
    """
    Walk a polyline (list of [lat, lon] points) and return the [lat, lon]
    that sits `target_miles` along it from the start.

    Clamps to the first/last point if `target_miles` is outside the polyline's
    range. Used to place fuel/rest/reset markers at their approximate
    real-world position along a route leg.
    """
    if not geometry:
        return [0.0, 0.0]
    if target_miles <= 0:
        return geometry[0]

    cumulative = 0.0
    for i in range(len(geometry) - 1):
        lat1, lon1 = geometry[i]
        lat2, lon2 = geometry[i + 1]
        segment_len = haversine_miles(lat1, lon1, lat2, lon2)
        if cumulative + segment_len >= target_miles:
            remaining = target_miles - cumulative
            fraction = 0.0 if segment_len == 0 else remaining / segment_len
            lat = lat1 + (lat2 - lat1) * fraction
            lon = lon1 + (lon2 - lon1) * fraction
            return [lat, lon]
        cumulative += segment_len

    return geometry[-1]
