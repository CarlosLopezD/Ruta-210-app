from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class RegisterTests(TestCase):
    def test_register_creates_user_and_returns_tokens(self):
        response = self.client.post(
            "/api/auth/register/",
            data={"email": "carlos@example.com", "password": "supersecreta123", "display_name": "Carlos"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertEqual(body["user"]["email"], "carlos@example.com")
        self.assertTrue(User.objects.filter(email="carlos@example.com").exists())

    def test_register_duplicate_email_returns_400(self):
        User.objects.create_user(email="dup@example.com", password="supersecreta123")
        response = self.client.post(
            "/api/auth/register/",
            data={"email": "dup@example.com", "password": "otrasegura123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_register_weak_password_returns_400(self):
        response = self.client.post(
            "/api/auth/register/",
            data={"email": "weak@example.com", "password": "123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class LoginTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="login@example.com", password="supersecreta123")

    def test_login_with_correct_credentials(self):
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertEqual(body["user"]["email"], "login@example.com")

    def test_login_with_wrong_password_returns_401(self):
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "incorrecta"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)


class MeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="me@example.com", password="supersecreta123")

    def _access_token(self):
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "me@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        return response.json()["access"]

    def test_me_requires_auth(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_current_user(self):
        token = self._access_token()
        response = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "me@example.com")
