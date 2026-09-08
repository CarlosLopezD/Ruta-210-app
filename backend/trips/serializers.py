from rest_framework import serializers

from .models import Trip


class TripRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    pickup_location = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    dropoff_location = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    current_cycle_used = serializers.FloatField(min_value=0, max_value=70)
    # All three are optional: omit start_datetime to default to "now", omit
    # either duration to default to the previous fixed 1-hour behavior.
    start_datetime = serializers.DateTimeField(required=False, allow_null=True, default=None)
    pickup_duration_hours = serializers.FloatField(required=False, default=1.0, min_value=0.25, max_value=8)
    dropoff_duration_hours = serializers.FloatField(required=False, default=1.0, min_value=0.25, max_value=8)


class TripHistorySerializer(serializers.ModelSerializer):
    """Used to list and to save a trip to history. `plan_result` is the exact
    JSON already returned by POST /api/trips/plan/ — the client sends back
    what it already computed, so saving doesn't repeat the geocoding/routing
    calls."""

    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used",
            "status",
            "plan_result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_plan_result(self, value):
        required_keys = {"summary", "route", "locations", "stops", "daily_logs"}
        if not isinstance(value, dict) or not required_keys.issubset(value.keys()):
            raise serializers.ValidationError("plan_result debe ser la respuesta completa de /api/trips/plan/.")
        return value


class TripStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = ["status"]


class TripPlanResultUpdateSerializer(serializers.ModelSerializer):
    """Used to update just the `plan_result` of an already-saved trip — e.g.
    when the user adds/edits/removes free-text annotations on its Daily Log
    Sheets. Same validation as TripHistorySerializer."""

    class Meta:
        model = Trip
        fields = ["plan_result"]

    def validate_plan_result(self, value):
        required_keys = {"summary", "route", "locations", "stops", "daily_logs"}
        if not isinstance(value, dict) or not required_keys.issubset(value.keys()):
            raise serializers.ValidationError("plan_result debe ser la respuesta completa de /api/trips/plan/.")
        return value
