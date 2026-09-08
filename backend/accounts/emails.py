"""Transactional email for the auth flows (verification, password reset).

Sent through Resend's HTTP API (https://resend.com) — no SMTP setup needed,
works from any host with outbound HTTPS. If RESEND_API_KEY isn't configured
(e.g. local dev without a key), we log the email instead of sending it, so
registration/reset still work end-to-end without a real provider.
"""

import logging

import requests
from django.conf import settings
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes

from .tokens import email_verification_token, password_reset_token

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def _uidb64(user) -> str:
    return urlsafe_base64_encode(force_bytes(user.pk))


def _send(to_email: str, subject: str, html: str) -> None:
    api_key = getattr(settings, "RESEND_API_KEY", "")
    from_addr = getattr(settings, "EMAIL_FROM", "Ruta 210 App <onboarding@resend.dev>")

    if not api_key:
        # No provider configured (local dev, CI) — don't block the request,
        # just make the email visible in the logs.
        logger.info("Email not sent (no RESEND_API_KEY) — to=%s subject=%s\n%s", to_email, subject, html)
        return

    try:
        response = requests.post(
            RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": from_addr, "to": [to_email], "subject": subject, "html": html},
            timeout=10,
        )
        if response.status_code >= 400:
            logger.error("Resend API error %s: %s", response.status_code, response.text)
    except requests.RequestException:
        logger.exception("Failed to send email to %s", to_email)


def send_verification_email(user) -> None:
    uid = _uidb64(user)
    token = email_verification_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/verificar-email?uid={uid}&token={token}"
    html = f"""
      <p>Hola{f' {user.display_name}' if user.display_name else ''},</p>
      <p>Confirmá tu email para activar tu cuenta en Ruta 210 App:</p>
      <p><a href="{link}">{link}</a></p>
      <p>Si no creaste esta cuenta, podés ignorar este mensaje.</p>
    """
    _send(user.email, "Confirmá tu cuenta — Ruta 210 App", html)


def send_password_reset_email(user) -> None:
    uid = _uidb64(user)
    token = password_reset_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/restablecer-contrasena?uid={uid}&token={token}"
    html = f"""
      <p>Hola{f' {user.display_name}' if user.display_name else ''},</p>
      <p>Pediste restablecer tu contraseña en Ruta 210 App. Este link vence en 24&nbsp;horas:</p>
      <p><a href="{link}">{link}</a></p>
      <p>Si no fuiste vos, ignorá este mensaje — tu contraseña actual sigue funcionando.</p>
    """
    _send(user.email, "Restablecer contraseña — Ruta 210 App", html)
