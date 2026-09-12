"""Views that don't belong to any one app — currently just the demo-data reset."""

import hmac
import logging

from django.conf import settings
from django.core.management import call_command
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

RESET_TOKEN_HEADER = "X-Reset-Token"


class ResetDemoDataView(APIView):
    """Wipes every table back to empty (users, trips, everything).

    This is a portfolio demo, not a product with real users to protect, so a
    scheduled GitHub Actions workflow (.github/workflows/reset-demo-data.yml)
    calls this every 30 minutes to keep the public instance from filling up
    with other people's test accounts and trips.

    Protected by a shared-secret header instead of session/JWT auth, since
    the caller here is a cron job, not a logged-in user. `authentication_classes
    = []` skips JWT parsing entirely — an Authorization header, if present,
    is simply ignored rather than validated. `AllowAny` hands access control
    entirely to the token check below.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        configured_token = settings.DEMO_RESET_TOKEN
        provided_token = request.headers.get(RESET_TOKEN_HEADER, "")

        # No token configured means this deploy never opted in — refuse
        # unconditionally. Without this, a fresh deploy that forgot to set
        # DEMO_RESET_TOKEN would compare "" == "" below and let anyone with
        # no header at all wipe the database.
        if not configured_token:
            return Response(
                {"detail": "El reset de datos de demo no está habilitado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Constant-time comparison — this guards a destructive endpoint, so
        # it shouldn't leak how many leading characters of the token matched
        # through response-timing differences.
        if not hmac.compare_digest(provided_token, configured_token):
            return Response({"detail": "Token inválido."}, status=status.HTTP_403_FORBIDDEN)

        logger.warning("Demo data reset triggered — wiping all tables.")
        call_command("flush", interactive=False, verbosity=0)

        return Response({"detail": "Datos de demo reseteados."}, status=status.HTTP_200_OK)
