from django.test import TestCase, override_settings

from accounts.models import User
from trips.models import Trip

RESET_URL = "/api/system/reset-demo/"


def _make_user_and_trip() -> None:
    user = User.objects.create_user(email="demo@example.com", password="supersecreta123")
    Trip.objects.create(
        owner=user,
        current_location="Buenos Aires",
        pickup_location="Rosario",
        dropoff_location="Córdoba",
        current_cycle_used=2.5,
        plan_result={"summary": "ok"},
    )


class ResetDemoDataDisabledByDefaultTests(TestCase):
    """DEMO_RESET_TOKEN is "" unless something explicitly sets it — this must
    never accidentally allow a wipe, whatever header shows up."""

    @override_settings(DEMO_RESET_TOKEN="")
    def test_refuses_even_with_no_header_at_all(self):
        response = self.client.post(RESET_URL)
        self.assertEqual(response.status_code, 403)

    @override_settings(DEMO_RESET_TOKEN="")
    def test_refuses_an_empty_header_too(self):
        # The trivial bypass this guards against: "" == "" would otherwise pass.
        response = self.client.post(RESET_URL, HTTP_X_RESET_TOKEN="")
        self.assertEqual(response.status_code, 403)

    @override_settings(DEMO_RESET_TOKEN="")
    def test_data_survives_when_disabled(self):
        _make_user_and_trip()
        self.client.post(RESET_URL, HTTP_X_RESET_TOKEN="whatever")
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Trip.objects.count(), 1)


@override_settings(DEMO_RESET_TOKEN="the-real-secret")
class ResetDemoDataEnabledTests(TestCase):
    def test_wrong_token_is_refused_and_keeps_the_data(self):
        _make_user_and_trip()
        response = self.client.post(RESET_URL, HTTP_X_RESET_TOKEN="not-it")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Trip.objects.count(), 1)

    def test_correct_token_wipes_every_table(self):
        _make_user_and_trip()
        response = self.client.post(RESET_URL, HTTP_X_RESET_TOKEN="the-real-secret")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(Trip.objects.count(), 0)

    def test_only_accepts_post(self):
        response = self.client.get(RESET_URL, HTTP_X_RESET_TOKEN="the-real-secret")
        self.assertEqual(response.status_code, 405)
