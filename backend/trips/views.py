from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Trip
from .serializers import (
    TripHistorySerializer,
    TripPlanResultUpdateSerializer,
    TripRequestSerializer,
    TripStatusUpdateSerializer,
)
from .services.trip_planner import TripPlanningError, plan_trip


class TripPlanView(APIView):
    """POST /api/trips/plan/ — computes route, stops and ELD daily logs for a trip.
    Public: no auth required (kept from v1 on purpose)."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = TripRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = plan_trip(
                current_location=data["current_location"],
                pickup_location=data["pickup_location"],
                dropoff_location=data["dropoff_location"],
                current_cycle_used=data["current_cycle_used"],
                pickup_duration_hours=data["pickup_duration_hours"],
                dropoff_duration_hours=data["dropoff_duration_hours"],
                start_datetime=data["start_datetime"],
            )
        except TripPlanningError as exc:
            return Response({"error": str(exc)}, status=502)

        return Response(result, status=200)


class TripHistoryListCreateView(generics.ListCreateAPIView):
    """GET: the current user's saved trips. POST: save an already-planned trip."""

    serializer_class = TripHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Trip.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class TripHistoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE a single saved trip — scoped to its owner only."""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Trip.objects.filter(owner=self.request.user)

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            # Two independent partial-update shapes: `{ status }` to move a
            # trip between planned/in_progress/completed, or `{ plan_result }`
            # to save edits to its Daily Log annotations.
            if "plan_result" in self.request.data:
                return TripPlanResultUpdateSerializer
            return TripStatusUpdateSerializer
        return TripHistorySerializer
