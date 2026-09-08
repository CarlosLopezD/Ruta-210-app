import type { TripStatus } from "../types";
import { useTranslation } from "../context/LanguageContext";

const STATUSES: TripStatus[] = ["planned", "in_progress", "completed"];
const STATUS_KEY: Record<TripStatus, "history.status.planned" | "history.status.in_progress" | "history.status.completed"> = {
  planned: "history.status.planned",
  in_progress: "history.status.in_progress",
  completed: "history.status.completed",
};

interface Props {
  value: TripStatus;
  onChange: (status: TripStatus) => void;
  disabled?: boolean;
}

export default function TripStatusControl({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <div className={`status-control status-control--${value}`} role="radiogroup">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={value === status}
          disabled={disabled}
          className={value === status ? "status-control__option is-active" : "status-control__option"}
          onClick={() => status !== value && onChange(status)}
        >
          <span className="status-control__check">{value === status ? "✓" : ""}</span>
          {t(STATUS_KEY[status])}
        </button>
      ))}
    </div>
  );
}
