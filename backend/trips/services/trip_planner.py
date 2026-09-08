"""Orchestrates geocoding + routing + the HOS engine into a single trip plan."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.utils import timezone

from . import geocoding, routing
from .hos_engine import Leg, simulate


class TripPlanningError(Exception):
    """Raised when any step of the planning pipeline fails; carries a user-facing message."""


def plan_trip(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    current_cycle_used: float,
    pickup_duration_hours: float = 1.0,
    dropoff_duration_hours: float = 1.0,
    start_datetime: datetime | None = None,
) -> dict:
    try:
        current = geocoding.geocode(current_location)
        pickup = geocoding.geocode(pickup_location)
        dropoff = geocoding.geocode(dropoff_location)
    except geocoding.GeocodingError as exc:
        raise TripPlanningError(str(exc)) from exc

    try:
        leg1_route = routing.get_route_leg(current, pickup)
        leg2_route = routing.get_route_leg(pickup, dropoff)
    except routing.RoutingError as exc:
        raise TripPlanningError(str(exc)) from exc

    legs = [
        Leg(
            label="pickup",
            distance_miles=leg1_route["distance_miles"],
            duration_hours=leg1_route["duration_hours"],
            geometry=leg1_route["geometry"],
            origin=current,
            destination=pickup,
            stop_duration_hours=pickup_duration_hours,
        ),
        Leg(
            label="dropoff",
            distance_miles=leg2_route["distance_miles"],
            duration_hours=leg2_route["duration_hours"],
            geometry=leg2_route["geometry"],
            origin=pickup,
            destination=dropoff,
            stop_duration_hours=dropoff_duration_hours,
        ),
    ]

    result = simulate(legs, current_cycle_used)

    # The engine itself works purely in hours-relative-to-trip-start (see
    # hos_engine.py docstring). `start_datetime` is only used here, to enrich
    # the response with real calendar dates/times for display — defaults to
    # "now" when the caller doesn't provide one, so the response always has one.
    trip_start = start_datetime or timezone.now()
    result["summary"]["start_datetime"] = trip_start.isoformat()
    for stop in result["stops"]:
        stop["timestamp"] = (trip_start + timedelta(hours=stop["hour_offset"])).isoformat()
    for day in result["daily_logs"]:
        day["date"] = (trip_start + timedelta(days=day["day"] - 1)).date().isoformat()

    full_geometry = leg1_route["geometry"] + leg2_route["geometry"]
    route = {
        "geometry": full_geometry,
        "legs": [
            {
                "from": "current_location",
                "to": "pickup_location",
                "distance_miles": round(leg1_route["distance_miles"], 1),
                "duration_hours": round(leg1_route["duration_hours"], 2),
            },
            {
                "from": "pickup_location",
                "to": "dropoff_location",
                "distance_miles": round(leg2_route["distance_miles"], 1),
                "duration_hours": round(leg2_route["duration_hours"], 2),
            },
        ],
    }

    locations = {
        "current_location": {"lat": current["lat"], "lon": current["lon"], "display_name": current["display_name"]},
        "pickup_location": {"lat": pickup["lat"], "lon": pickup["lon"], "display_name": pickup["display_name"]},
        "dropoff_location": {"lat": dropoff["lat"], "lon": dropoff["lon"], "display_name": dropoff["display_name"]},
    }

    return {
        "summary": result["summary"],
        "route": route,
        "locations": locations,
        "stops": result["stops"],
        "daily_logs": result["daily_logs"],
    }
