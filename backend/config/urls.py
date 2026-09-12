"""
URL configuration for the Ruta 210 App backend.
"""

from django.contrib import admin
from django.urls import include, path

from .views import ResetDemoDataView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/trips/", include("trips.urls")),
    path("api/system/reset-demo/", ResetDemoDataView.as_view(), name="reset-demo-data"),
]
