import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../context/LanguageContext";
import { deleteTrip, listTrips, updateTripPlanResult, updateTripStatus, TripHistoryApiError } from "../api/tripHistoryApi";
import type { TripHistoryItem, TripPlanResponse, TripStatus } from "../types";
import TripStatusControl from "../components/TripStatusControl";
import RouteMap from "../components/RouteMap";
import DailyLogSheet from "../components/DailyLogSheet";
import AuthModal from "../components/AuthModal";

function formatDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleString(language === "es" ? "es-AR" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatLogDate(iso: string, language: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(language === "es" ? "es-AR" : "en-US", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  const { isAuthenticated, authFetch, ready } = useAuth();
  const { t, language } = useTranslation();
  const [trips, setTrips] = useState<TripHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listTrips(authFetch)
      .then(setTrips)
      .catch((err) => setError(err instanceof TripHistoryApiError ? err.message : t("error.network")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready]);

  async function handleStatusChange(trip: TripHistoryItem, status: TripStatus) {
    const previous = trips;
    setTrips((current) => current.map((item) => (item.id === trip.id ? { ...item, status } : item)));
    try {
      await updateTripStatus(authFetch, trip.id, status);
    } catch {
      setTrips(previous);
    }
  }

  async function handleDelete(trip: TripHistoryItem) {
    if (!window.confirm(t("history.delete_confirm"))) return;
    const previous = trips;
    setTrips((current) => current.filter((item) => item.id !== trip.id));
    try {
      await deleteTrip(authFetch, trip.id);
    } catch {
      setTrips(previous);
    }
  }

  async function persistAnnotations(trip: TripHistoryItem, planResult: TripPlanResponse) {
    const previous = trips;
    setTrips((current) => current.map((item) => (item.id === trip.id ? { ...item, plan_result: planResult } : item)));
    try {
      await updateTripPlanResult(authFetch, trip.id, planResult);
    } catch {
      setTrips(previous);
    }
  }

  function handleAddAnnotation(trip: TripHistoryItem, day: number, hour: number, text: string) {
    const planResult: TripPlanResponse = {
      ...trip.plan_result,
      daily_logs: trip.plan_result.daily_logs.map((log) =>
        log.day === day ? { ...log, annotations: [...(log.annotations ?? []), { hour, text }] } : log
      ),
    };
    persistAnnotations(trip, planResult);
  }

  function handleDeleteAnnotation(trip: TripHistoryItem, day: number, index: number) {
    const planResult: TripPlanResponse = {
      ...trip.plan_result,
      daily_logs: trip.plan_result.daily_logs.map((log) =>
        log.day === day ? { ...log, annotations: (log.annotations ?? []).filter((_, i) => i !== index) } : log
      ),
    };
    persistAnnotations(trip, planResult);
  }

  if (ready && !isAuthenticated) {
    return (
      <div className="card empty-state">
        <h3>{t("history.login_required.title")}</h3>
        <p>{t("history.login_required.body")}</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setAuthModalOpen(true)}>
          {t("nav.login")}
        </button>
        {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t("history.title")}</h2>

      {loading && <div className="card">…</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && trips.length === 0 && (
        <div className="card empty-state">
          <p>{t("history.empty")}</p>
        </div>
      )}

      {trips.map((trip) => {
        const isExpanded = expandedId === trip.id;
        return (
          <div className="card trip-history-card" key={trip.id}>
            <div className="trip-history-card__header">
              <div>
                <strong>
                  {trip.pickup_location} → {trip.dropoff_location}
                </strong>
                <div className="trip-history-card__meta">{t("history.saved_on", { date: formatDate(trip.created_at, language) })}</div>
              </div>
              <TripStatusControl value={trip.status} onChange={(status) => handleStatusChange(trip, status)} />
            </div>

            <div className="trip-history-card__actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedId(isExpanded ? null : trip.id)}>
                {isExpanded ? t("history.hide") : t("history.view")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => handleDelete(trip)}>
                {t("history.delete")}
              </button>
            </div>

            {isExpanded && (
              <div className="trip-history-card__detail">
                <RouteMap
                  route={trip.plan_result.route}
                  stops={trip.plan_result.stops}
                  locations={trip.plan_result.locations}
                />
                {trip.plan_result.daily_logs.map((log) => (
                  <div className="card" key={log.day}>
                    <div className="log-sheet-header">
                      <h3>
                        {log.date
                          ? t("logsheet.title_with_date", { day: log.day, date: formatLogDate(log.date, language) })
                          : t("logsheet.title", { day: log.day })}
                      </h3>
                    </div>
                    <DailyLogSheet
                      log={log}
                      onAddAnnotation={(hour, text) => handleAddAnnotation(trip, log.day, hour, text)}
                      onDeleteAnnotation={(index) => handleDeleteAnnotation(trip, log.day, index)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
