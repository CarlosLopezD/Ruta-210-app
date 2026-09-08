from django.urls import path

from .views import TripHistoryDetailView, TripHistoryListCreateView, TripPlanView

urlpatterns = [
    path("plan/", TripPlanView.as_view(), name="trip-plan"),
    path("history/", TripHistoryListCreateView.as_view(), name="trip-history"),
    path("history/<int:pk>/", TripHistoryDetailView.as_view(), name="trip-history-detail"),
]
