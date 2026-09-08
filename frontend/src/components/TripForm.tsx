import { useState } from "react";
import type { FormEvent } from "react";
import type { TripRequest } from "../types";
import { useTranslation } from "../context/LanguageContext";

interface Props {
  onSubmit: (payload: TripRequest) => void;
  loading: boolean;
}

/** Form-local shape: `start_datetime` is edited as a <input type="datetime-local">
 * string ("" means "start now") and only converted to a real ISO timestamp — and
 * merged with the rest — into a TripRequest on submit. */
interface FormValues {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  start_datetime_local: string;
  pickup_duration_hours: number;
  dropoff_duration_hours: number;
}

const EMPTY_VALUES: FormValues = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used: 0,
  start_datetime_local: "",
  pickup_duration_hours: 1,
  dropoff_duration_hours: 1,
};

const EXAMPLE_TRIP: FormValues = {
  current_location: "Dallas, TX",
  pickup_location: "Fort Worth, TX",
  dropoff_location: "Oklahoma City, OK",
  current_cycle_used: 12,
  start_datetime_local: "",
  pickup_duration_hours: 1,
  dropoff_duration_hours: 1,
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

export default function TripForm({ onSubmit, loading }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function validate(v: FormValues): FieldErrors {
    const next: FieldErrors = {};
    if (!v.current_location.trim()) next.current_location = t("form.required");
    if (!v.pickup_location.trim()) next.pickup_location = t("form.required");
    if (!v.dropoff_location.trim()) next.dropoff_location = t("form.required");
    if (Number.isNaN(v.current_cycle_used)) {
      next.current_cycle_used = t("form.required");
    } else if (v.current_cycle_used < 0 || v.current_cycle_used > 70) {
      next.current_cycle_used = t("form.range_error");
    }
    if (v.start_datetime_local && Number.isNaN(new Date(v.start_datetime_local).getTime())) {
      next.start_datetime_local = t("form.start_datetime_error");
    }
    if (Number.isNaN(v.pickup_duration_hours) || v.pickup_duration_hours < 0.25 || v.pickup_duration_hours > 8) {
      next.pickup_duration_hours = t("form.duration_range_error");
    }
    if (Number.isNaN(v.dropoff_duration_hours) || v.dropoff_duration_hours < 0.25 || v.dropoff_duration_hours > 8) {
      next.dropoff_duration_hours = t("form.duration_range_error");
    }
    return next;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationErrors = validate(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) {
      const payload: TripRequest = {
        current_location: values.current_location,
        pickup_location: values.pickup_location,
        dropoff_location: values.dropoff_location,
        current_cycle_used: values.current_cycle_used,
        pickup_duration_hours: values.pickup_duration_hours,
        dropoff_duration_hours: values.dropoff_duration_hours,
      };
      if (values.start_datetime_local) {
        payload.start_datetime = new Date(values.start_datetime_local).toISOString();
      }
      onSubmit(payload);
    }
  }

  function loadExample() {
    setValues(EXAMPLE_TRIP);
    setErrors({});
  }

  return (
    <form className="trip-form" onSubmit={handleSubmit}>
      <div>
        <h2>{t("form.title")}</h2>
        <p className="trip-form__subtitle">{t("form.subtitle")}</p>
      </div>

      <div className="field">
        <label htmlFor="current_location">{t("form.current_location")}</label>
        <input
          id="current_location"
          type="text"
          placeholder={t("form.placeholder.current")}
          value={values.current_location}
          className={errors.current_location ? "has-error" : ""}
          onChange={(e) => setValues({ ...values, current_location: e.target.value })}
        />
        {errors.current_location && <span className="field__error">{errors.current_location}</span>}
      </div>

      <div className="field">
        <label htmlFor="pickup_location">{t("form.pickup_location")}</label>
        <input
          id="pickup_location"
          type="text"
          placeholder={t("form.placeholder.pickup")}
          value={values.pickup_location}
          className={errors.pickup_location ? "has-error" : ""}
          onChange={(e) => setValues({ ...values, pickup_location: e.target.value })}
        />
        {errors.pickup_location && <span className="field__error">{errors.pickup_location}</span>}
      </div>

      <div className="field">
        <label htmlFor="dropoff_location">{t("form.dropoff_location")}</label>
        <input
          id="dropoff_location"
          type="text"
          placeholder={t("form.placeholder.dropoff")}
          value={values.dropoff_location}
          className={errors.dropoff_location ? "has-error" : ""}
          onChange={(e) => setValues({ ...values, dropoff_location: e.target.value })}
        />
        {errors.dropoff_location && <span className="field__error">{errors.dropoff_location}</span>}
      </div>

      <div className="field">
        <label htmlFor="current_cycle_used">{t("form.current_cycle_used")}</label>
        <input
          id="current_cycle_used"
          type="number"
          min={0}
          max={70}
          step={0.5}
          placeholder="0 - 70"
          value={Number.isNaN(values.current_cycle_used) ? "" : values.current_cycle_used}
          className={errors.current_cycle_used ? "has-error" : ""}
          onChange={(e) => setValues({ ...values, current_cycle_used: parseFloat(e.target.value) })}
        />
        {errors.current_cycle_used ? (
          <span className="field__error">{errors.current_cycle_used}</span>
        ) : (
          <span className="field__hint">{t("form.current_cycle_used_hint")}</span>
        )}
      </div>

      <div className="advanced-options">
        <button
          type="button"
          className="advanced-options__toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          <span className={advancedOpen ? "advanced-options__caret is-open" : "advanced-options__caret"} aria-hidden="true">
            ›
          </span>
          {t("form.advanced_options")}
        </button>

        {advancedOpen && (
          <div className="advanced-options__body">
            <div className="field">
              <label htmlFor="start_datetime">{t("form.start_datetime")}</label>
              <input
                id="start_datetime"
                type="datetime-local"
                value={values.start_datetime_local}
                className={errors.start_datetime_local ? "has-error" : ""}
                onChange={(e) => setValues({ ...values, start_datetime_local: e.target.value })}
              />
              {errors.start_datetime_local ? (
                <span className="field__error">{errors.start_datetime_local}</span>
              ) : (
                <span className="field__hint">{t("form.start_datetime_hint")}</span>
              )}
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pickup_duration_hours">{t("form.pickup_duration")}</label>
                <input
                  id="pickup_duration_hours"
                  type="number"
                  min={0.25}
                  max={8}
                  step={0.25}
                  value={Number.isNaN(values.pickup_duration_hours) ? "" : values.pickup_duration_hours}
                  className={errors.pickup_duration_hours ? "has-error" : ""}
                  onChange={(e) => setValues({ ...values, pickup_duration_hours: parseFloat(e.target.value) })}
                />
                {errors.pickup_duration_hours && <span className="field__error">{errors.pickup_duration_hours}</span>}
              </div>

              <div className="field">
                <label htmlFor="dropoff_duration_hours">{t("form.dropoff_duration")}</label>
                <input
                  id="dropoff_duration_hours"
                  type="number"
                  min={0.25}
                  max={8}
                  step={0.25}
                  value={Number.isNaN(values.dropoff_duration_hours) ? "" : values.dropoff_duration_hours}
                  className={errors.dropoff_duration_hours ? "has-error" : ""}
                  onChange={(e) => setValues({ ...values, dropoff_duration_hours: parseFloat(e.target.value) })}
                />
                {errors.dropoff_duration_hours && <span className="field__error">{errors.dropoff_duration_hours}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="trip-form__actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? t("form.submit_loading") : t("form.submit")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={loadExample} disabled={loading}>
          {t("form.example")}
        </button>
      </div>
    </form>
  );
}
