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
        self.assertEqual(body["user"]["email"], "login@example.com")

    def test_login_does_not_put_refresh_token_in_the_response_body(self):
        # The refresh token must only ever leave the server as an httpOnly
        # cookie — if it's in the JSON body, frontend JS (and thus an XSS
        # payload) can read it.
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.assertNotIn("refresh", response.json())

    def test_login_sets_httponly_refresh_cookie(self):
        response = self.client.post(
            "/api/auth/login/",
            data={"email": "login@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        cookie = response.cookies["refresh_token"]
        self.assertTrue(cookie.value)
        self.assertEqual(cookie["httponly"], True)
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/api/auth/")

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
        self.access = login.json()["access"]
        # self.client persists cookies across requests like a real browser,
        # so the refresh_token cookie set by login above is already attached
        # to every subsequent self.client.post() in these tests below.

    def test_logout_blacklists_refresh_token(self):
        response = self.client.post(
            "/api/auth/logout/",
            HTTP_AUTHORIZATION=f"Bearer {self.access}",
        )
        self.assertEqual(response.status_code, 205)

        # The blacklisted refresh token (still in self.client's cookie jar)
        # can no longer mint new access tokens.
        refresh_response = self.client.post("/api/auth/refresh/")
        self.assertEqual(refresh_response.status_code, 401)

    def test_logout_clears_the_refresh_cookie(self):
        response = self.client.post(
            "/api/auth/logout/",
            HTTP_AUTHORIZATION=f"Bearer {self.access}",
        )
        cookie = response.cookies["refresh_token"]
        # Django expires a cleared cookie in the past / with an empty value —
        # either is fine, the point is the browser won't keep sending it.
        self.assertEqual(cookie.value, "")

    def test_logout_requires_auth(self):
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 401)


class TokenRefreshTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="refresh@example.com", password="supersecreta123", is_email_verified=True
        )
        login = self.client.post(
            "/api/auth/login/",
            data={"email": "refresh@example.com", "password": "supersecreta123"},
            content_type="application/json",
        )
        self.original_refresh_cookie = login.cookies["refresh_token"].value

    def test_refresh_reads_the_cookie_and_returns_only_an_access_token(self):
        # self.client already carries the refresh_token cookie set by login
        # in setUp — no body needed, unlike the old {"refresh": ...} flow.
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access", body)
        self.assertNotIn("refresh", body)

    def test_refresh_rotates_the_cookie(self):
        response = self.client.post("/api/auth/refresh/")
        rotated_value = response.cookies["refresh_token"].value
        self.assertTrue(rotated_value)
        self.assertNotEqual(rotated_value, self.original_refresh_cookie)

    def test_old_refresh_token_is_blacklisted_after_rotation(self):
        self.client.post("/api/auth/refresh/")  # rotates — self.client now holds the new cookie

        # Manually replay the ORIGINAL (now-superseded) refresh token, the
        # way a stolen/duplicated cookie would.
        self.client.cookies["refresh_token"] = self.original_refresh_cookie
        replay_response = self.client.post("/api/auth/refresh/")
        self.assertEqual(replay_response.status_code, 401)

    def test_refresh_without_a_cookie_returns_401(self):
        self.client.cookies.clear()
        response = self.client.post("/api/auth/refresh/")
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
