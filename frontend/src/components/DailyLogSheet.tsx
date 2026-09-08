import { useState } from "react";
import type { FormEvent } from "react";
import type { DailyLog, DutyStatus } from "../types";
import { useTranslation } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { STOP_KIND_LABEL, NON_REMARK_KINDS } from "../i18n/stopKinds";
import type { TranslationKey } from "../i18n/es";

interface RowSpec {
  status: DutyStatus;
  number: number;
  labelKey: TranslationKey;
  colorLight: string;
  colorDark: string;
}

const ROWS: RowSpec[] = [
  { status: "OFF", number: 1, labelKey: "logsheet.off_duty", colorLight: "#a09e94", colorDark: "#9c9a92" },
  { status: "SB", number: 2, labelKey: "logsheet.sleeper_berth", colorLight: "#8a86a8", colorDark: "#a49fc4" },
  { status: "D", number: 3, labelKey: "logsheet.driving", colorLight: "#2a78d6", colorDark: "#3987e5" },
  { status: "ON", number: 4, labelKey: "logsheet.on_duty", colorLight: "#eb6834", colorDark: "#d95926" },
];

const ROW_INDEX: Record<DutyStatus, number> = { OFF: 0, SB: 1, D: 2, ON: 3 };

const WIDTH = 1000;
const LEFT_MARGIN = 168;
const RIGHT_MARGIN = 56;
const TOP_MARGIN = 26;
const ROW_HEIGHT = 34;
const GRID_HEIGHT = ROW_HEIGHT * ROWS.length;
const BOTTOM_MARGIN = 14;
const HEIGHT = TOP_MARGIN + GRID_HEIGHT + BOTTOM_MARGIN;
const GRID_WIDTH = WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
const HOUR_WIDTH = GRID_WIDTH / 24;

function x(hour: number): number {
  return LEFT_MARGIN + hour * HOUR_WIDTH;
}

function rowMidY(status: DutyStatus): number {
  return TOP_MARGIN + ROW_INDEX[status] * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "Mid";
  if (h === 12) return "Noon";
  return h > 12 ? String(h - 12) : String(h);
}

interface Props {
  log: DailyLog;
  /** Omit both to render a read-only sheet (no add form, no delete buttons). */
  onAddAnnotation?: (hour: number, text: string) => void;
  onDeleteAnnotation?: (index: number) => void;
}

export default function DailyLogSheet({ log, onAddAnnotation, onDeleteAnnotation }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const segments = log.segments;
  const rowColor = (row: RowSpec) => (theme === "dark" ? row.colorDark : row.colorLight);

  return (
    <div className="log-sheet">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t("logsheet.title", { day: log.day })}>
        {/* hour gridlines */}
        {Array.from({ length: 25 }, (_, h) => (
          <line
            key={`grid-${h}`}
            x1={x(h)}
            y1={TOP_MARGIN}
            x2={x(h)}
            y2={TOP_MARGIN + GRID_HEIGHT}
            style={{ stroke: h % 6 === 0 ? "var(--baseline)" : "var(--gridline)" }}
            strokeWidth={h % 6 === 0 ? 1.4 : 1}
          />
        ))}

        {/* hour labels */}
        {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
          <text key={`label-${h}`} x={x(h)} y={TOP_MARGIN - 8} fontSize={10} style={{ fill: "var(--text-muted)" }} textAnchor="middle">
            {hourLabel(h)}
          </text>
        ))}

        {/* row separators + labels */}
        {ROWS.map((row, i) => {
          const rowTop = TOP_MARGIN + i * ROW_HEIGHT;
          const total = log.totals[row.status];
          const color = rowColor(row);
          return (
            <g key={row.status}>
              <line x1={LEFT_MARGIN} y1={rowTop} x2={LEFT_MARGIN + GRID_WIDTH} y2={rowTop} style={{ stroke: "var(--baseline)" }} strokeWidth={1} />
              <line
                x1={LEFT_MARGIN}
                y1={rowTop + ROW_HEIGHT / 2}
                x2={LEFT_MARGIN + GRID_WIDTH}
                y2={rowTop + ROW_HEIGHT / 2}
                style={{ stroke: "var(--gridline)" }}
                strokeWidth={1}
              />
              <text
                x={LEFT_MARGIN - 12}
                y={rowTop + ROW_HEIGHT / 2 + 4}
                fontSize={11}
                fontWeight={600}
                style={{ fill: "var(--text-primary)" }}
                textAnchor="end"
              >
                {row.number}. {t(row.labelKey)}
              </text>
              <text
                x={LEFT_MARGIN + GRID_WIDTH + 14}
                y={rowTop + ROW_HEIGHT / 2 + 4}
                fontSize={12}
                fontWeight={650}
                style={{ fill: color, fontVariantNumeric: "tabular-nums" }}
              >
                {total.toFixed(1)}h
              </text>
            </g>
          );
        })}
        <line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN + GRID_HEIGHT}
          x2={LEFT_MARGIN + GRID_WIDTH}
          y2={TOP_MARGIN + GRID_HEIGHT}
          style={{ stroke: "var(--baseline)" }}
          strokeWidth={1.4}
        />
        <rect
          x={LEFT_MARGIN}
          y={TOP_MARGIN}
          width={GRID_WIDTH}
          height={GRID_HEIGHT}
          fill="none"
          style={{ stroke: "var(--border-hairline)" }}
        />

        {/* status step-line */}
        {segments.map((seg, i) => {
          const y = rowMidY(seg.status);
          const prev = segments[i - 1];
          return (
            <g key={`seg-${i}`}>
              {prev && prev.status !== seg.status && (
                <line
                  x1={x(seg.start_hour)}
                  y1={rowMidY(prev.status)}
                  x2={x(seg.start_hour)}
                  y2={y}
                  style={{ stroke: "var(--text-primary)" }}
                  strokeWidth={2}
                />
              )}
              <line
                x1={x(seg.start_hour)}
                y1={y}
                x2={x(seg.end_hour)}
                y2={y}
                style={{ stroke: "var(--text-primary)" }}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>

      <div className="log-sheet-totals">
        {ROWS.map((row) => (
          <span className="log-sheet-totals__item" key={row.status}>
            <span className="log-sheet-totals__swatch" style={{ background: rowColor(row) }} />
            {t(row.labelKey)}: {log.totals[row.status].toFixed(1)}h
          </span>
        ))}
      </div>

      <RemarksList log={log} onAddAnnotation={onAddAnnotation} onDeleteAnnotation={onDeleteAnnotation} />
    </div>
  );
}

function formatClock(hour: number): string {
  const h = Math.floor(hour).toString().padStart(2, "0");
  const m = Math.round((hour - Math.floor(hour)) * 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

function parseTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) return null;
  return hours + minutes / 60;
}

interface RemarkEntry {
  hour: number;
  text: string;
  isManual: boolean;
  annotationIndex?: number;
}

function RemarksList({
  log,
  onAddAnnotation,
  onDeleteAnnotation,
}: {
  log: DailyLog;
  onAddAnnotation?: (hour: number, text: string) => void;
  onDeleteAnnotation?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [hourInput, setHourInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const autoEntries: RemarkEntry[] = log.segments
    .filter((seg) => !NON_REMARK_KINDS.has(seg.kind))
    .map((seg) => ({
      hour: seg.start_hour,
      text: STOP_KIND_LABEL[seg.kind] ? t(STOP_KIND_LABEL[seg.kind]) : seg.label,
      isManual: false,
    }));

  const manualEntries: RemarkEntry[] = (log.annotations ?? []).map((annotation, i) => ({
    hour: annotation.hour,
    text: annotation.text,
    isManual: true,
    annotationIndex: i,
  }));

  const entries = [...autoEntries, ...manualEntries].sort((a, b) => a.hour - b.hour);

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const hour = parseTimeInput(hourInput);
    if (hour === null) {
      setFormError(t("logsheet.annotation_hour_error"));
      return;
    }
    if (!textInput.trim()) {
      setFormError(t("logsheet.annotation_text_error"));
      return;
    }
    setFormError(null);
    onAddAnnotation?.(hour, textInput.trim());
    setHourInput("");
    setTextInput("");
  }

  if (entries.length === 0 && !onAddAnnotation) return null;

  return (
    <div className="remarks">
      <h4>{t("logsheet.remarks")}</h4>

      {entries.length > 0 && (
        <ul>
          {entries.map((entry, i) => (
            <li key={i}>
              <time>{formatClock(entry.hour)}</time>
              <span>{entry.text}</span>
              {entry.isManual && (
                <>
                  <span className="remarks__tag">{t("logsheet.annotation_manual_tag")}</span>
                  {onDeleteAnnotation && (
                    <button
                      type="button"
                      className="remarks__delete"
                      aria-label={t("logsheet.annotation_delete")}
                      onClick={() => onDeleteAnnotation(entry.annotationIndex!)}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {onAddAnnotation && (
        <form className="remarks__add-form" onSubmit={handleAdd}>
          <input
            type="time"
            className="remarks__add-hour"
            aria-label={t("logsheet.annotation_hour")}
            value={hourInput}
            onChange={(e) => setHourInput(e.target.value)}
          />
          <input
            type="text"
            className="remarks__add-text"
            aria-label={t("logsheet.annotation_text")}
            placeholder={t("logsheet.annotation_placeholder")}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost btn-sm">
            {t("logsheet.annotation_add")}
          </button>
          {formError && (
            <span className="field__error remarks__add-error" role="alert">
              {formError}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
