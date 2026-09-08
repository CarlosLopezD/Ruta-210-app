from django.conf import settings
from django.db import models


class Trip(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "A futuro"
        IN_PROGRESS = "in_progress", "En curso"
        COMPLETED = "completed", "Finalizado"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trips")

    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used = models.FloatField()

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)

    # Full response of POST /api/trips/plan/ at save time (summary, route,
    # locations, stops, daily_logs) — re-displaying a saved trip doesn't need
    # a fresh Nominatim/OSRM round-trip.
    plan_result = models.JSONField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.pickup_location} -> {self.dropoff_location} ({self.owner_id})"
