export type DutyStatus = "OFF" | "SB" | "D" | "ON";

export interface DailyLogSegment {
  start_hour: number;
  end_hour: number;
  status: DutyStatus;
  label: string;
  kind: string;
}

export interface DailyLogTotals {
  OFF: number;
  SB: number;
  D: number;
  ON: number;
}

/** A free-text note the driver attaches to a specific hour of a Daily Log
 * Sheet — separate from the automatic remarks the HOS engine generates. */
export interface LogAnnotation {
  hour: number;
  text: string;
}

export interface DailyLog {
  day: number;
  date?: string;
  segments: DailyLogSegment[];
  totals: DailyLogTotals;
  annotations?: LogAnnotation[];
}

export interface Stop {
  type:
    | "pickup"
    | "dropoff"
    | "fuel"
    | "break_30min"
    | "off_duty_10h"
    | "cycle_reset_34h"
    | string;
  label: string;
  status: DutyStatus;
  lat: number;
  lon: number;
  hour_offset: number;
  duration_hours: number;
  timestamp?: string;
}

export interface RouteLeg {
  from: string;
  to: string;
  distance_miles: number;
  duration_hours: number;
}

export interface RouteInfo {
  geometry: [number, number][];
  legs: RouteLeg[];
}

export interface LocationInfo {
  lat: number;
  lon: number;
  display_name: string;
}

export interface TripLocations {
  current_location: LocationInfo;
  pickup_location: LocationInfo;
  dropoff_location: LocationInfo;
}

export interface TripSummary {
  total_distance_miles: number;
  total_driving_hours: number;
  total_trip_hours: number;
  days_required: number;
  fuel_stops: number;
  cycle_reset_required: boolean;
  start_datetime: string;
}

export interface TripPlanResponse {
  summary: TripSummary;
  route: RouteInfo;
  locations: TripLocations;
  stops: Stop[];
  daily_logs: DailyLog[];
}

export interface TripRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  /** ISO datetime string; omitted/undefined means "start now" (server default). */
  start_datetime?: string;
  /** Hours spent on-duty (not driving) at pickup/dropoff; defaults to 1 each. */
  pickup_duration_hours?: number;
  dropoff_duration_hours?: number;
}

export type TripStatus = "planned" | "in_progress" | "completed";

export interface TripHistoryItem {
  id: number;
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  status: TripStatus;
  plan_result: TripPlanResponse;
  created_at: string;
  updated_at: string;
}
