import { useState } from "react";
import TripForm from "../components/TripForm";
import TripSummary from "../components/TripSummary";
import RouteMap from "../components/RouteMap";
import DailyLogSheet from "../components/DailyLogSheet";
import AuthModal from "../components/AuthModal";
import { planTrip, TripApiError } from "../api/tripApi";
import { saveTrip } from "../api/tripHistoryApi";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../context/LanguageContext";
import type { TripPlanResponse, TripRequest } from "../types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PlannerPage() {
  const { t, language } = useTranslation();
  const { isAuthenticated, authFetch } = useAuth();

  const [result, setResult] = useState<TripPlanResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  async function handleSubmit(payload: TripRequest) {
    setLoading(true);
    setError(null);
    setSaveState("idle");
    try {
      const data = await planTrip(payload);
      setResult(data);
      setLastRequest(payload);
    } catch (err) {
      setResult(null);
      setError(err instanceof TripApiError ? err.message : t("error.network"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result || !lastRequest) return;
    setSaveState("saving");
    try {
      await saveTrip(authFetch, { ...lastRequest, status: "planned", plan_result: result });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function handleAddAnnotation(day: number, hour: number, text: string) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            daily_logs: prev.daily_logs.map((log) =>
              log.day === day ? { ...log, annotations: [...(log.annotations ?? []), { hour, text }] } : log
            ),
          }
        : prev
    );
  }

  function handleDeleteAnnotation(day: number, index: number) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            daily_logs: prev.daily_logs.map((log) =>
              log.day === day ? { ...log, annotations: (log.annotations ?? []).filter((_, i) => i !== index) } : log
            ),
          }
        : prev
    );
  }

  function formatLogDate(iso: string): string {
    try {
      return new Date(`${iso}T00:00:00`).toLocaleDateString(language === "es" ? "es-AR" : "en-US", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="card">
          <TripForm onSubmit={handleSubmit} loading={loading} />
        </div>
      </aside>

      <main className="results">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="card empty-state">
            <h3>{t("empty.title")}</h3>
            <p>{t("empty.body")}</p>
          </div>
        )}

        {result && (
          <>
            <TripSummary summary={result.summary} />

            <div className="save-trip-bar card">
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saveState === "saving" || saveState === "saved"}
                  onClick={handleSave}
                >
                  {saveState === "saving" && <span className="spinner" />}
                  {saveState === "saved" ? `✓ ${t("save.button_saved")}` : t("save.button")}
                </button>
              ) : (
                <div className="save-trip-bar__prompt">
                  <span>{t("save.login_prompt")}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAuthModalOpen(true)}>
                    {t("save.login_cta")}
                  </button>
                </div>
              )}
              {saveState === "error" && <span className="field__error">{t("save.error")}</span>}
            </div>

            <RouteMap route={result.route} stops={result.stops} locations={result.locations} />

            {result.daily_logs.map((log) => (
              <div className="card" key={log.day}>
                <div className="log-sheet-header">
                  <h3>
                    {log.date
                      ? t("logsheet.title_with_date", { day: log.day, date: formatLogDate(log.date) })
                      : t("logsheet.title", { day: log.day })}
                  </h3>
                  <span>{t("logsheet.count", { count: result.daily_logs.length })}</span>
                </div>
                <DailyLogSheet
                  log={log}
                  onAddAnnotation={(hour, text) => handleAddAnnotation(log.day, hour, text)}
                  onDeleteAnnotation={(index) => handleDeleteAnnotation(log.day, index)}
                />
              </div>
            ))}
          </>
        )}

        <footer className="app-footer">{t("footer.text")}</footer>
      </main>

      {authModalOpen && <AuthModal initialMode="login" onClose={() => setAuthModalOpen(false)} onSuccess={handleSave} />}
    </div>
  );
}
