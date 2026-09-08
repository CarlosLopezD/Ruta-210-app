from django.contrib.auth import get_user_model
from django.test import TestCase

from trips.models import Trip

User = get_user_model()

SAMPLE_PLAN_RESULT = {
    "summary": {
        "total_distance_miles": 200.0,
        "total_driving_hours": 4.0,
        "total_trip_hours": 6.0,
        "days_required": 1,
        "fuel_stops": 0,
        "cycle_reset_required": False,
    },
    "route": {"geometry": [[32.7, -96.8], [32.8, -97.3]], "legs": []},
    "locations": {
        "current_location": {"lat": 32.7, "lon": -96.8, "display_name": "Dallas, TX"},
        "pickup_location": {"lat": 32.75, "lon": -97.3, "display_name": "Fort Worth, TX"},
        "dropoff_location": {"lat": 35.4, "lon": -97.5, "display_name": "Oklahoma City, OK"},
    },
    "stops": [],
    "daily_logs": [{"day": 1, "segments": [], "totals": {"OFF": 24, "SB": 0, "D": 0, "ON": 0}}],
}


class TripHistoryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="carlos@example.com", password="supersecreta123")
        self.other_user = User.objects.create_user(email="other@example.com", password="supersecreta123")
        login = self.client.post(
            "/api/auth/login/",
            data={"email": "carlos@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}

        other_login = self.client.post(
            "/api/auth/login/",
            data={"email": "other@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.other_auth_header = {"HTTP_AUTHORIZATION": f"Bearer {other_login.json()['access']}"}

    def _save_trip_payload(self, status="planned"):
        return {
            "current_location": "Dallas, TX",
            "pickup_location": "Fort Worth, TX",
            "dropoff_location": "Oklahoma City, OK",
            "current_cycle_used": 10,
            "status": status,
            "plan_result": SAMPLE_PLAN_RESULT,
        }

    def test_history_requires_auth(self):
        response = self.client.get("/api/trips/history/")
        self.assertEqual(response.status_code, 401)

    def test_save_and_list_trip(self):
        create = self.client.post(
            "/api/trips/history/", data=self._save_trip_payload(), content_type="application/json", **self.auth_header
        )
        self.assertEqual(create.status_code, 201)

        listing = self.client.get("/api/trips/history/", **self.auth_header)
        self.assertEqual(listing.status_code, 200)
        body = listing.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["status"], "planned")
        self.assertEqual(body[0]["plan_result"]["summary"]["total_distance_miles"], 200.0)

    def test_save_trip_rejects_incomplete_plan_result(self):
        payload = self._save_trip_payload()
        payload["plan_result"] = {"summary": {}}
        response = self.client.post("/api/trips/history/", data=payload, content_type="application/json", **self.auth_header)
        self.assertEqual(response.status_code, 400)

    def test_update_status(self):
        trip = Trip.objects.create(
            owner=self.user,
            current_location="Dallas, TX",
            pickup_location="Fort Worth, TX",
            dropoff_location="Oklahoma City, OK",
            current_cycle_used=10,
            status=Trip.Status.PLANNED,
            plan_result=SAMPLE_PLAN_RESULT,
        )
        response = self.client.patch(
            f"/api/trips/history/{trip.id}/",
            data={"status": "completed"},
            content_type="application/json",
            **self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(trip.status, Trip.Status.COMPLETED)

    def test_update_annotations_via_plan_result(self):
        trip = Trip.objects.create(
            owner=self.user,
            current_location="Dallas, TX",
            pickup_location="Fort Worth, TX",
            dropoff_location="Oklahoma City, OK",
            current_cycle_used=10,
            status=Trip.Status.PLANNED,
            plan_result=SAMPLE_PLAN_RESULT,
        )
        annotated = {
            **SAMPLE_PLAN_RESULT,
            "daily_logs": [
                {
                    "day": 1,
                    "segments": [],
                    "totals": {"OFF": 24, "SB": 0, "D": 0, "ON": 0},
                    "annotations": [{"hour": 7.5, "text": "Llamó el cliente para confirmar el horario"}],
                }
            ],
        }
        response = self.client.patch(
            f"/api/trips/history/{trip.id}/",
            data={"plan_result": annotated},
            content_type="application/json",
            **self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(len(trip.plan_result["daily_logs"][0]["annotations"]), 1)
        self.assertEqual(
            trip.plan_result["daily_logs"][0]["annotations"][0]["text"],
            "Llamó el cliente para confirmar el horario",
        )
        # Updating plan_result must not touch status.
        self.assertEqual(trip.status, Trip.Status.PLANNED)

    def test_update_plan_result_rejects_incomplete_payload(self):
        trip = Trip.objects.create(
            owner=self.user,
            current_location="Dallas, TX",
            pickup_location="Fort Worth, TX",
            dropoff_location="Oklahoma City, OK",
            current_cycle_used=10,
            status=Trip.Status.PLANNED,
            plan_result=SAMPLE_PLAN_RESULT,
        )
        response = self.client.patch(
            f"/api/trips/history/{trip.id}/",
            data={"plan_result": {"summary": {}}},
            content_type="application/json",
            **self.auth_header,
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_see_or_modify_other_users_trip(self):
        trip = Trip.objects.create(
            owner=self.other_user,
            current_location="Dallas, TX",
            pickup_location="Fort Worth, TX",
            dropoff_location="Oklahoma City, OK",
            current_cycle_used=10,
            status=Trip.Status.PLANNED,
            plan_result=SAMPLE_PLAN_RESULT,
        )

        get_response = self.client.get(f"/api/trips/history/{trip.id}/", **self.auth_header)
        self.assertEqual(get_response.status_code, 404)

        patch_response = self.client.patch(
            f"/api/trips/history/{trip.id}/",
            data={"status": "completed"},
            content_type="application/json",
            **self.auth_header,
        )
        self.assertEqual(patch_response.status_code, 404)

        annotate_response = self.client.patch(
            f"/api/trips/history/{trip.id}/",
            data={"plan_result": SAMPLE_PLAN_RESULT},
            content_type="application/json",
            **self.auth_header,
        )
        self.assertEqual(annotate_response.status_code, 404)

        delete_response = self.client.delete(f"/api/trips/history/{trip.id}/", **self.auth_header)
        self.assertEqual(delete_response.status_code, 404)

        trip.refresh_from_db()
        self.assertEqual(trip.status, Trip.Status.PLANNED)

    def test_delete_own_trip(self):
        trip = Trip.objects.create(
            owner=self.user,
            current_location="Dallas, TX",
            pickup_location="Fort Worth, TX",
            dropoff_location="Oklahoma City, OK",
            current_cycle_used=10,
            status=Trip.Status.PLANNED,
            plan_result=SAMPLE_PLAN_RESULT,
        )
        response = self.client.delete(f"/api/trips/history/{trip.id}/", **self.auth_header)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Trip.objects.filter(id=trip.id).exists())

    def test_list_only_shows_own_trips(self):
        Trip.objects.create(
            owner=self.other_user,
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            current_cycle_used=5,
            plan_result=SAMPLE_PLAN_RESULT,
        )
        self.client.post(
            "/api/trips/history/", data=self._save_trip_payload(), content_type="application/json", **self.auth_header
        )
        response = self.client.get("/api/trips/history/", **self.auth_header)
        self.assertEqual(len(response.json()), 1)
