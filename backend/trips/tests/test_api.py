"""Integration tests for POST /api/trips/plan/, with geocoding/routing mocked out
so the suite doesn't depend on network access."""

from unittest.mock import patch

from django.test import TestCase


FAKE_CURRENT = {"lat": 32.7767, "lon": -96.7970, "display_name": "Dallas, TX"}
FAKE_PICKUP = {"lat": 32.7555, "lon": -97.3308, "display_name": "Fort Worth, TX"}
FAKE_DROPOFF = {"lat": 35.4676, "lon": -97.5164, "display_name": "Oklahoma City, OK"}


def fake_geocode(address):
    mapping = {"Dallas, TX": FAKE_CURRENT, "Fort Worth, TX": FAKE_PICKUP, "Oklahoma City, OK": FAKE_DROPOFF}
    return mapping.get(address, FAKE_CURRENT)


def fake_route_leg(origin, destination):
    return {
        "geometry": [[origin["lat"], origin["lon"]], [destination["lat"], destination["lon"]]],
        "distance_miles": 200.0,
        "duration_hours": 3.5,
    }


class TripPlanEndpointTests(TestCase):
    @patch("trips.services.trip_planner.routing.get_route_leg", side_effect=fake_route_leg)
    @patch("trips.services.trip_planner.geocoding.geocode", side_effect=fake_geocode)
    def test_valid_request_returns_full_plan(self, mock_geocode, mock_route):
        response = self.client.post(
            "/api/trips/plan/",
            data={
                "current_location": "Dallas, TX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Oklahoma City, OK",
                "current_cycle_used": 10,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("summary", body)
        self.assertIn("route", body)
        self.assertIn("stops", body)
        self.assertIn("daily_logs", body)
        self.assertGreater(len(body["daily_logs"]), 0)

    @patch("trips.services.trip_planner.routing.get_route_leg", side_effect=fake_route_leg)
    @patch("trips.services.trip_planner.geocoding.geocode", side_effect=fake_geocode)
    def test_custom_start_datetime_and_durations_are_reflected(self, mock_geocode, mock_route):
        response = self.client.post(
            "/api/trips/plan/",
            data={
                "current_location": "Dallas, TX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Oklahoma City, OK",
                "current_cycle_used": 10,
                "start_datetime": "2026-01-05T08:00:00Z",
                "pickup_duration_hours": 2,
                "dropoff_duration_hours": 1.5,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["summary"]["start_datetime"], "2026-01-05T08:00:00+00:00")
        self.assertEqual(body["daily_logs"][0]["date"], "2026-01-05")
        pickup_stop = next(s for s in body["stops"] if s["type"] == "pickup")
        dropoff_stop = next(s for s in body["stops"] if s["type"] == "dropoff")
        self.assertAlmostEqual(pickup_stop["duration_hours"], 2.0, places=2)
        self.assertAlmostEqual(dropoff_stop["duration_hours"], 1.5, places=2)
        self.assertIn("timestamp", pickup_stop)

    @patch("trips.services.trip_planner.routing.get_route_leg", side_effect=fake_route_leg)
    @patch("trips.services.trip_planner.geocoding.geocode", side_effect=fake_geocode)
    def test_start_datetime_and_durations_are_optional(self, mock_geocode, mock_route):
        response = self.client.post(
            "/api/trips/plan/",
            data={
                "current_location": "Dallas, TX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Oklahoma City, OK",
                "current_cycle_used": 10,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        # Defaults to "now" server-side, but it must always be present.
        self.assertIn("start_datetime", body["summary"])
        pickup_stop = next(s for s in body["stops"] if s["type"] == "pickup")
        self.assertAlmostEqual(pickup_stop["duration_hours"], 1.0, places=2)

    def test_missing_field_returns_400(self):
        response = self.client.post(
            "/api/trips/plan/",
            data={"current_location": "Dallas, TX"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cycle_used_out_of_range_returns_400(self):
        response = self.client.post(
            "/api/trips/plan/",
            data={
                "current_location": "Dallas, TX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Oklahoma City, OK",
                "current_cycle_used": 90,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("trips.services.trip_planner.geocoding.geocode")
    def test_geocoding_failure_returns_502(self, mock_geocode):
        from trips.services.geocoding import GeocodingError

        mock_geocode.side_effect = GeocodingError("No se encontró la dirección")
        response = self.client.post(
            "/api/trips/plan/",
            data={
                "current_location": "Nowhere, XX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Oklahoma City, OK",
                "current_cycle_used": 10,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 502)
        self.assertIn("error", response.json())
