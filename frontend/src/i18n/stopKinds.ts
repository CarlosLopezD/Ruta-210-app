import type { TranslationKey } from "./es";

/** Maps a stop/segment `kind` (from the backend) to its translation key.
 * Shared by RouteMap (map legend/popups) and DailyLogSheet (remarks list) so
 * dynamic backend labels are localized consistently instead of duplicating
 * the mapping in two places. */
export const STOP_KIND_LABEL: Record<string, TranslationKey> = {
  pickup: "map.legend.pickup",
  dropoff: "map.legend.dropoff",
  fuel: "map.legend.fuel",
  break_30min: "map.legend.break",
  off_duty_10h: "map.legend.reset10",
  cycle_reset_34h: "map.legend.reset34",
};

/** Segment kinds that are filler, not real events — excluded from the
 * remarks list on a daily log sheet. */
export const NON_REMARK_KINDS = new Set(["driving", "trip_complete"]);
