"""
Unit tests for the HOS simulation engine: 1-day and multi-day trips, the
11-hour driving cap, fuel stops every <=1,000 miles, the 70-hour/8-day cycle
reset, configurable pickup/dropoff duration, and optional trip start time.
"""

from django.test import SimpleTestCase

from trips.services.hos_engine import Leg, simulate


def straight_geometry(origin, destination):
    return [[origin["lat"], origin["lon"]], [destination["lat"], destination["lon"]]]


def make_leg(label, distance_miles, duration_hours, origin=None, destination=None, stop_duration_hours=None):
    origin = origin or {"lat": 0.0, "lon": 0.0}
    destination = destination or {"lat": 0.1, "lon": 0.1}
    kwargs = {}
    if stop_duration_hours is not None:
        kwargs["stop_duration_hours"] = stop_duration_hours
    return Leg(
        label=label,
        distance_miles=distance_miles,
        duration_hours=duration_hours,
        geometry=straight_geometry(origin, destination),
        origin=origin,
        destination=destination,
        **kwargs,
    )


class ShortTripTests(SimpleTestCase):
    """< 11 hrs driving total, well within all limits -> a single daily log."""

    def test_single_day_log_and_totals_sum_to_24(self):
        legs = [
            make_leg("pickup", distance_miles=30, duration_hours=0.5),
            make_leg("dropoff", distance_miles=200, duration_hours=4.0),
        ]
        result = simulate(legs, current_cycle_used_hours=0)

        self.assertEqual(len(result["daily_logs"]), 1)
        totals = result["daily_logs"][0]["totals"]
        self.assertAlmostEqual(sum(totals.values()), 24.0, places=2)
        self.assertEqual(result["summary"]["days_required"], 1)
        self.assertFalse(result["summary"]["cycle_reset_required"])

    def test_pickup_and_dropoff_each_add_one_hour_on_duty(self):
        legs = [
            make_leg("pickup", distance_miles=30, duration_hours=0.5),
            make_leg("dropoff", distance_miles=50, duration_hours=1.0),
        ]
        result = simulate(legs, current_cycle_used_hours=0)
        on_duty_stops = [s for s in result["stops"] if s["type"] in ("pickup", "dropoff")]
        self.assertEqual(len(on_duty_stops), 2)
        for stop in on_duty_stops:
            self.assertAlmostEqual(stop["duration_hours"], 1.0, places=2)

    def test_pickup_and_dropoff_use_configured_duration(self):
        legs = [
            make_leg("pickup", distance_miles=30, duration_hours=0.5, stop_duration_hours=2.5),
            make_leg("dropoff", distance_miles=50, duration_hours=1.0, stop_duration_hours=0.5),
        ]
        result = simulate(legs, current_cycle_used_hours=0)
        pickup_stop = next(s for s in result["stops"] if s["type"] == "pickup")
        dropoff_stop = next(s for s in result["stops"] if s["type"] == "dropoff")
        self.assertAlmostEqual(pickup_stop["duration_hours"], 2.5, places=2)
        self.assertAlmostEqual(dropoff_stop["duration_hours"], 0.5, places=2)
        # Totals must still sum to 24h per day regardless of stop duration.
        for day in result["daily_logs"]:
            self.assertAlmostEqual(sum(day["totals"].values()), 24.0, places=2)


class LongTripTests(SimpleTestCase):
    """> 11 hrs driving -> must insert a 10-hour off-duty reset and span multiple days."""

    def test_multi_day_logs_and_10_hour_reset_inserted(self):
        legs = [
            make_leg("pickup", distance_miles=10, duration_hours=0.2),
            make_leg("dropoff", distance_miles=900, duration_hours=15.0),
        ]
        result = simulate(legs, current_cycle_used_hours=0)

        self.assertGreater(result["summary"]["days_required"], 1)
        reset_stops = [s for s in result["stops"] if s["type"] == "off_duty_10h"]
        self.assertGreaterEqual(len(reset_stops), 1)
        for stop in reset_stops:
            self.assertAlmostEqual(stop["duration_hours"], 10.0, places=2)

        for day in result["daily_logs"]:
            self.assertAlmostEqual(sum(day["totals"].values()), 24.0, places=2)

    def test_no_shift_exceeds_11_hours_driving(self):
        legs = [
            make_leg("pickup", distance_miles=10, duration_hours=0.2),
            make_leg("dropoff", distance_miles=1400, duration_hours=23.0),
        ]
        result = simulate(legs, current_cycle_used_hours=0)

        driving_stretch = 0.0
        for day in result["daily_logs"]:
            for seg in day["segments"]:
                if seg["status"] == "D":
                    driving_stretch += seg["end_hour"] - seg["start_hour"]
                else:
                    driving_stretch = 0.0
                self.assertLessEqual(driving_stretch, 11.0 + 1e-6)


class FuelStopTests(SimpleTestCase):
    def test_fuel_stop_inserted_every_1000_miles(self):
        legs = [
            make_leg("pickup", distance_miles=10, duration_hours=0.2),
            make_leg("dropoff", distance_miles=2200, duration_hours=36.0),
        ]
        result = simulate(legs, current_cycle_used_hours=0)
        fuel_stops = [s for s in result["stops"] if s["type"] == "fuel"]
        # ~2210 total miles -> at least 2 fuel stops (every <=1000mi)
        self.assertGreaterEqual(len(fuel_stops), 2)


class CycleResetTests(SimpleTestCase):
    def test_cycle_reset_triggered_when_70_hours_reached(self):
        legs = [
            make_leg("pickup", distance_miles=10, duration_hours=0.2),
            make_leg("dropoff", distance_miles=600, duration_hours=10.0),
        ]
        result = simulate(legs, current_cycle_used_hours=65)

        self.assertTrue(result["summary"]["cycle_reset_required"])
        reset_stops = [s for s in result["stops"] if s["type"] == "cycle_reset_34h"]
        self.assertEqual(len(reset_stops), 1)
        self.assertAlmostEqual(reset_stops[0]["duration_hours"], 34.0, places=2)

    def test_cycle_already_exhausted_at_trip_start(self):
        legs = [make_leg("pickup", distance_miles=10, duration_hours=0.2), make_leg("dropoff", distance_miles=50, duration_hours=1.0)]
        result = simulate(legs, current_cycle_used_hours=70)
        reset_stops = [s for s in result["stops"] if s["type"] == "cycle_reset_34h"]
        self.assertEqual(len(reset_stops), 1)
        self.assertAlmostEqual(reset_stops[0]["hour_offset"], 0.0, places=2)
