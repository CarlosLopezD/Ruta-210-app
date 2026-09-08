import type { TripSummary as TripSummaryType } from "../types";
import { useTranslation } from "../context/LanguageContext";

interface Props {
  summary: TripSummaryType;
}

export default function TripSummary({ summary }: Props) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="summary-grid">
        <div className="stat-tile">
          <span className="stat-tile__label">{t("summary.distance")}</span>
          <span className="stat-tile__value">
            {summary.total_distance_miles.toLocaleString()} <span className="stat-tile__unit">mi</span>
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">{t("summary.duration")}</span>
          <span className="stat-tile__value">
            {summary.total_trip_hours} <span className="stat-tile__unit">hrs</span>
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">{t("summary.days")}</span>
          <span className="stat-tile__value">{summary.days_required}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">{t("summary.fuel_stops")}</span>
          <span className="stat-tile__value">{summary.fuel_stops}</span>
        </div>
      </div>

      {summary.cycle_reset_required && (
        <div className="alert alert-warning" style={{ marginTop: 14 }}>
          {t("summary.cycle_warning")}
        </div>
      )}
    </div>
  );
}
