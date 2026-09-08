"""Token generators for the email-verification and password-reset flows.

Both build on Django's PasswordResetTokenGenerator (HMAC of a hash value +
timestamp, no DB storage needed), so tokens self-expire after
settings.PASSWORD_RESET_TIMEOUT seconds and can't be reused once the state
they were issued for changes.
"""

from django.contrib.auth.tokens import PasswordResetTokenGenerator, default_token_generator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Like the password-reset generator, but keyed off is_email_verified
    instead of the password hash, so it works before the user ever has a
    session and stops validating once the address has been confirmed."""

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.is_email_verified}{timestamp}"


email_verification_token = EmailVerificationTokenGenerator()

# Password resets reuse Django's own generator (keyed off the password hash
# and last_login, so a token is invalidated the moment it's used).
password_reset_token = default_token_generator
