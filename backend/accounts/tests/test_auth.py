from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.models import MAX_FAILED_LOGIN_ATTEMPTS
from accounts.tokens import email_verification_token, password_reset_token

User = get_user_model()


def _uidb64(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


class RegisterTests(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters are process-global, not per-test

    def test_register_creates_unverified_user_no_tokens(self):
        response = self.client.post(
            "/api/auth/register/",
            data={"email": "carlos@example.com", "password": "supersecreta123", "display_name": "Carlos"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        # No tokens on register anymore — the account must be verified first.
        self.assertNotIn("access", body)
        self.assertNotIn("refresh", body)
        self.assertEqual(body["email"], "carlos@example.com")
        user = User.objects.get(email="carlos@example.com")
        self.assertFalse(user.is_email_verified)

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
        cache.clear()  # throttle counters are process-global, not per-test
        self.user = User.objects.create_user(
            email="login@example.com", password="supersecreta123", is_email_verified=True
        )

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

    def test_login_blocked_until_email_verified(self):
        User.objects.create_user(email="unverified@example.com", password="supersecreta123")
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "unverified@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email_not_verified", response.json()["code"])

    def test_account_locks_after_repeated_failed_logins(self):
        for _ in range(MAX_FAILED_LOGIN_ATTEMPTS):
            self.client.post(
                "/api/auth/login/",
                data={"email": "login@example.com", "password": "incorrecta"},
                content_type="application/json",
            )
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_locked())

        # Even the correct password is now rejected while locked.
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("account_locked", response.json()["code"])

    def test_successful_login_resets_failed_attempts(self):
        self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "incorrecta"},
            content_type="application/json",
        )
        self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 0)


class MeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="me@example.com", password="supersecreta123", is_email_verified=True
        )

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


class EmailVerificationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="verify@example.com", password="supersecreta123")

    def test_valid_token_verifies_account(self):
        token = email_verification_token.make_token(self.user)
        response = self.client.post(
            "/api/auth/verify-email/",
            data={"uid": _uidb64(self.user), "token": token},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

    def test_invalid_token_rejected(self):
        response = self.client.post(
            "/api/auth/verify-email/",
            data={"uid": _uidb64(self.user), "token": "not-a-real-token"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_token_cannot_be_reused_after_verification(self):
        token = email_verification_token.make_token(self.user)
        self.client.post(
            "/api/auth/verify-email/",
            data={"uid": _uidb64(self.user), "token": token},
            content_type="application/json",
        )
        # Same token, second attempt — is_email_verified is now part of the
        # token's hash, so it should no longer validate.
        response = self.client.post(
            "/api/auth/verify-email/",
            data={"uid": _uidb64(self.user), "token": token},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_resend_verification_is_generic_for_unknown_email(self):
        response = self.client.post(
            "/api/auth/resend-verification/",
            data={"email": "doesnotexist@example.com"},
            content_type="application/json",
        )
        # Same 200 + generic message whether or not the email exists, so the
        # endpoint can't be used to enumerate registered accounts.
        self.assertEqual(response.status_code, 200)


class PasswordResetTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="reset@example.com", password="oldpassword123", is_email_verified=True
        )

    def test_request_is_generic_for_unknown_email(self):
        response = self.client.post(
            "/api/auth/password-reset/",
            data={"email": "unknown@example.com"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

    def test_confirm_with_valid_token_changes_password(self):
        token = password_reset_token.make_token(self.user)
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            data={"uid": _uidb64(self.user), "token": token, "new_password": "brandnewpass123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brandnewpass123"))

    def test_confirm_with_invalid_token_rejected(self):
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            data={"uid": _uidb64(self.user), "token": "bogus", "new_password": "brandnewpass123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("oldpassword123"))

    def test_confirm_with_weak_password_rejected(self):
        token = password_reset_token.make_token(self.user)
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            data={"uid": _uidb64(self.user), "token": token, "new_password": "123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class LogoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="logout@example.com", password="supersecreta123", is_email_verified=True
        )
        login = self.client.post(
            "/api/auth/login/",
            data={"email": "logout@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.tokens = login.json()

    def test_logout_blacklists_refresh_token(self):
        response = self.client.post(
            "/api/auth/logout/",
            data={"refresh": self.tokens["refresh"]},
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.tokens['access']}",
        )
        self.assertEqual(response.status_code, 205)

        # The blacklisted refresh token can no longer mint new access tokens.
        refresh_response = self.client.post(
            "/api/auth/refresh/",
            data={"refresh": self.tokens["refresh"]},
            content_type="application/json",
        )
        self.assertEqual(refresh_response.status_code, 401)

    def test_logout_requires_auth(self):
        response = self.client.post(
            "/api/auth/logout/",
            data={"refresh": self.tokens["refresh"]},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)


class ThrottlingTests(TestCase):
    """Confirms the login endpoint actually enforces its configured rate
    limit (settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["auth-login"]).

    DRF's SimpleRateThrottle reads its rate table once at class-definition
    time, so @override_settings can't lower it for a test — this exercises
    the real configured "10/min" instead of trying to fake a smaller one.
    """

    def setUp(self):
        cache.clear()

    def test_login_is_rate_limited_per_ip(self):
        from rest_framework.throttling import ScopedRateThrottle

        limit, _ = ScopedRateThrottle().parse_rate(
            ScopedRateThrottle.THROTTLE_RATES["auth-login"]
        )

        def attempt():
            # A nonexistent email so this exercises throttling in isolation —
            # no matching user means the account-lockout layer never engages
            # (there's nothing to lock), so every pre-limit response is a
            # plain 401 rather than switching to a lockout 400 partway through.
            return self.client.post(
                "/api/auth/login/",
                data={"email": "nobody@example.com", "password": "wrong"},
                content_type="application/json",
            )

        statuses = [attempt().status_code for _ in range(limit + 1)]
        self.assertTrue(all(s == 401 for s in statuses[:limit]), statuses)
        self.assertEqual(statuses[limit], 429)
