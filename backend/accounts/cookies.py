"""Helpers for the httpOnly refresh-token cookie.

The refresh token used to travel in the JSON body of /login/, /refresh/ and
/logout/, which meant the frontend kept it in localStorage — readable by any
JavaScript running on the page, including an XSS payload, for its whole
7-day lifetime. It now travels only as an httpOnly cookie: invisible to
JavaScript, attached by the browser automatically on requests to this API.

This is only safe as SameSite=Lax because the frontend proxies /api/* through
its own Cloudflare Worker (see frontend/worker/) — that makes the browser's
requests to this API same-site, so the cookie is never sent on a cross-site
request (the classic CSRF vector). Do not change this to SameSite=None
without adding real CSRF protection (SameSite=None cookies are sent
cross-site, so they need it).
"""

from django.conf import settings
from django.http import HttpResponse

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth/"


def set_refresh_cookie(response: HttpResponse, refresh_token: str) -> None:
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=int(lifetime.total_seconds()),
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        # Secure requires HTTPS, which is why this is DEBUG-gated: local dev
        # over plain http would otherwise never receive the cookie back.
        secure=not settings.DEBUG,
        samesite="Lax",
    )


def clear_refresh_cookie(response: HttpResponse) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH, samesite="Lax")
