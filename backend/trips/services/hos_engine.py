"""
HOS (Hours of Service) simulation engine.

Given the driving legs of a trip (current -> pickup -> dropoff) and the driver's
already-used cycle hours, this module simulates the trip minute-by-constraint and
produces a chronological list of duty-status events. Those events are then split
into per-calendar-day segments to render as Daily Log Sheets.

Rules implemented (property-carrying driver, 70hrs/8days cycle, no adverse driving
conditions):

- 11-hour driving limit per shift.
- 14-hour on-duty window per shift (elapsed time, not just driving).
- 30-minute break required after 8 cumulative hours of driving.
- 70-hour / 8-day cycle limit, with a 34-hour restart when reached.
- 10 consecutive hours off-duty required to start a new shift.
- Fuel stop (30 min, on-duty not driving) at least every 1000 miles.
- On-duty (not driving) at pickup and at dropoff — 1 hour by default, but
  configurable per trip (`pickup_duration_hours` / `dropoff_duration_hours`).

Simplifications:
- No split sleeper-berth (7/3, 8/2); off-duty resets are modeled as one
  continuous 10-hour (or 34-hour) block.
- The trip is assumed to start at hour 0 = the start of Day 1 (00:00), and the
  driver's current on-duty shift is assumed to start at trip start.
- The 30-minute break is modeled as off-duty ("OFF") for simplicity; FMCSA also
  allows on-duty-not-driving to satisfy it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .geo_utils import point_at_distance

# --- Rule constants ---------------------------------------------------------

MAX_DRIVING_HOURS_PER_SHIFT = 11.0
MAX_ONDUTY_WINDOW_HOURS = 14.0
MAX_DRIVING_BEFORE_BREAK = 8.0
BREAK_DURATION_HOURS = 0.5
OFF_DUTY_RESET_HOURS = 10.0
MAX_CYCLE_HOURS = 70.0
CYCLE_RESET_HOURS = 34.0
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_DURATION_HOURS = 0.5
STOP_DURATION_HOURS = 1.0

STATUS_OFF = "OFF"
STATUS_SLEEPER = "SB"
STATUS_DRIVING = "D"
STATUS_ON_DUTY = "ON"

EPSILON = 1e-6
MAX_ITERATIONS = 20000


@dataclass
class Leg:
    label: str
    distance_miles: float
    duration_hours: float
    geometry: list
    origin: dict
    destination: dict
    # On-duty (not driving) time spent at this leg's destination — 1 hour by
    # default (pickup/dropoff), but configurable per trip.
    stop_duration_hours: float = STOP_DURATION_HOURS


@dataclass
class Event:
    start: float
    end: float
    status: str
    kind: str
    label: str
    lat: float
    lon: float

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class _State:
    clock: float = 0.0
    cycle_used: float = 0.0
    shift_onduty_start: float = 0.0
    shift_driving_hours: float = 0.0
    since_break_driving_hours: float = 0.0
    distance_since_fuel: float = 0.0
    cycle_reset_triggered: bool = False
    events: list = field(default_factory=list)


def _emit(state: _State, duration: float, status: str, kind: str, label: str, lat: float, lon: float) -> None:
    if duration <= EPSILON:
        return
    state.events.append(
        Event(start=state.clock, end=state.clock + duration, status=status, kind=kind, label=label, lat=lat, lon=lon)
    )
    state.clock += duration


def _drive(state: _State, hours: float, distance: float, lat: float, lon: float, label: str) -> None:
    _emit(state, hours, STATUS_DRIVING, "driving", label, lat, lon)
    state.shift_driving_hours += hours
    state.since_break_driving_hours += hours
    state.cycle_used += hours
    state.distance_since_fuel += distance


def _off_duty_reset(state: _State, hours: float, lat: float, lon: float, kind: str, label: str) -> None:
    _emit(state, hours, STATUS_OFF, kind, label, lat, lon)
    state.shift_driving_hours = 0.0
    state.since_break_driving_hours = 0.0
    state.shift_onduty_start = state.clock


def _break(state: _State, lat: float, lon: float) -> None:
    _emit(state, BREAK_DURATION_HOURS, STATUS_OFF, "break_30min", "30-minute break", lat, lon)
    state.since_break_driving_hours = 0.0


def _on_duty_stop(state: _State, hours: float, kind: str, label: str, lat: float, lon: float) -> None:
    _emit(state, hours, STATUS_ON_DUTY, kind, label, lat, lon)
    state.cycle_used += hours
    state.since_break_driving_hours = 0.0  # non-driving time of >=30min satisfies the break too


def simulate(legs: list[Leg], current_cycle_used_hours: float) -> dict:
    """Run the HOS simulation over the given legs and return events/stops/daily_logs/summary."""
    state = _State(cycle_used=current_cycle_used_hours)
    fuel_stop_count = 0
    cycle_reset_required = False

    for leg in legs:
        remaining_miles = leg.distance_miles
        remaining_hours = leg.duration_hours
        speed = leg.distance_miles / leg.duration_hours if leg.duration_hours > EPSILON else 0.0
        distance_into_leg = 0.0
        iterations = 0

        while remaining_hours > EPSILON:
            iterations += 1
            if iterations > MAX_ITERATIONS:
                raise RuntimeError("HOS simulation did not converge — check inputs.")

            here = point_at_distance(leg.geometry, distance_into_leg) if leg.geometry else [
                leg.origin["lat"],
                leg.origin["lon"],
            ]

            hrs_to_cycle_limit = MAX_CYCLE_HOURS - state.cycle_used
            hrs_to_shift_driving_limit = MAX_DRIVING_HOURS_PER_SHIFT - state.shift_driving_hours
            hrs_to_window_limit = MAX_ONDUTY_WINDOW_HOURS - (state.clock - state.shift_onduty_start)
            hrs_to_break_limit = MAX_DRIVING_BEFORE_BREAK - state.since_break_driving_hours
            miles_to_fuel = FUEL_INTERVAL_MILES - state.distance_since_fuel
            hrs_to_fuel_limit = (miles_to_fuel / speed) if speed > EPSILON else float("inf")

            drivable_hours = min(
                hrs_to_cycle_limit,
                hrs_to_shift_driving_limit,
                hrs_to_window_limit,
                hrs_to_break_limit,
                hrs_to_fuel_limit,
                remaining_hours,
            )

            if drivable_hours > EPSILON:
                distance_driven = drivable_hours * speed
                _drive(state, drivable_hours, distance_driven, here[0], here[1], f"Driving toward {leg.label}")
                remaining_hours -= drivable_hours
                remaining_miles -= distance_driven
                distance_into_leg += distance_driven
                continue

            # A constraint is exhausted — resolve the most restrictive one first.
            if hrs_to_cycle_limit <= EPSILON:
                cycle_reset_required = True
                _off_duty_reset(state, CYCLE_RESET_HOURS, here[0], here[1], "cycle_reset_34h", "34-hour cycle restart")
                state.cycle_used = 0.0
            elif hrs_to_shift_driving_limit <= EPSILON or hrs_to_window_limit <= EPSILON:
                _off_duty_reset(state, OFF_DUTY_RESET_HOURS, here[0], here[1], "off_duty_10h", "10-hour off-duty reset")
            elif hrs_to_break_limit <= EPSILON:
                _break(state, here[0], here[1])
            elif hrs_to_fuel_limit <= EPSILON:
                _on_duty_stop(state, FUEL_STOP_DURATION_HOURS, "fuel", "Fuel stop", here[0], here[1])
                state.distance_since_fuel = 0.0
                fuel_stop_count += 1
            else:  # pragma: no cover - defensive fallback, should not happen
                break

        # Arrived at this leg's destination: on-duty stop (pickup/dropoff),
        # for however long that stop is configured to take.
        dest = leg.destination
        _on_duty_stop(state, leg.stop_duration_hours, leg.label, leg.label.capitalize(), dest["lat"], dest["lon"])

    # Pad the final day with OFF so totals always sum to 24h.
    end_of_last_day = (int(state.clock // 24) + 1) * 24
    if end_of_last_day > state.clock:
        last_lat, last_lon = (state.events[-1].lat, state.events[-1].lon) if state.events else (0.0, 0.0)
        _emit(
            state,
            end_of_last_day - state.clock,
            STATUS_OFF,
            "trip_complete",
            "Off duty (resto del día)",
            last_lat,
            last_lon,
        )

    daily_logs = _split_into_daily_logs(state.events)
    stops = _events_to_stops(state.events)
    total_distance = sum(leg.distance_miles for leg in legs)
    total_driving_hours = sum(e.duration for e in state.events if e.status == STATUS_DRIVING)

    summary = {
        "total_distance_miles": round(total_distance, 1),
        "total_driving_hours": round(total_driving_hours, 2),
        "total_trip_hours": round(state.clock, 2),
        "days_required": len(daily_logs),
        "fuel_stops": fuel_stop_count,
        "cycle_reset_required": cycle_reset_required,
    }

    return {
        "summary": summary,
        "stops": stops,
        "daily_logs": daily_logs,
    }


def _events_to_stops(events: list[Event]) -> list[dict]:
    stop_kinds = {"pickup", "dropoff", "fuel", "break_30min", "off_duty_10h", "cycle_reset_34h"}
    return [
        {
            "type": e.kind,
            "label": e.label,
            "status": e.status,
            "lat": round(e.lat, 6),
            "lon": round(e.lon, 6),
            "hour_offset": round(e.start, 2),
            "duration_hours": round(e.duration, 2),
        }
        for e in events
        if e.kind in stop_kinds
    ]


def _split_into_daily_logs(events: list[Event]) -> list[dict]:
    if not events:
        return []

    last_end = max(e.end for e in events)
    num_days = max(1, int(last_end // 24) + (1 if last_end % 24 > EPSILON else 0))

    days = []
    for day_index in range(num_days):
        day_start = day_index * 24.0
        day_end = day_start + 24.0
        segments = []
        for e in events:
            overlap_start = max(e.start, day_start)
            overlap_end = min(e.end, day_end)
            if overlap_end - overlap_start > EPSILON:
                segments.append(
                    {
                        "start_hour": round(overlap_start - day_start, 3),
                        "end_hour": round(overlap_end - day_start, 3),
                        "status": e.status,
                        "label": e.label,
                        "kind": e.kind,
                    }
                )

        totals = {STATUS_OFF: 0.0, STATUS_SLEEPER: 0.0, STATUS_DRIVING: 0.0, STATUS_ON_DUTY: 0.0}
        for seg in segments:
            totals[seg["status"]] += seg["end_hour"] - seg["start_hour"]

        days.append(
            {
                "day": day_index + 1,
                "segments": segments,
                "totals": {k: round(v, 2) for k, v in totals.items()},
            }
        )

    return days
