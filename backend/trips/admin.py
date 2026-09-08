from django.contrib import admin

from .models import Trip


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ["id", "owner", "pickup_location", "dropoff_location", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["pickup_location", "dropoff_location", "owner__email"]
