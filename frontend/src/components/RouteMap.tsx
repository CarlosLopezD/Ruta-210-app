import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import type { RouteInfo, Stop, TripLocations } from "../types";
import { useTranslation } from "../context/LanguageContext";
import { STOP_KIND_LABEL } from "../i18n/stopKinds";

const STOP_COLORS: Record<string, string> = {
  pickup: "#0ca30c",
  dropoff: "#d03b3b",
  fuel: "#eda100",
  break_30min: "#8a86a8",
  off_duty_10h: "#eb6834",
  cycle_reset_34h: "#4a3aa7",
};

// The map always renders with light tiles, even in dark theme: stop-color dots
// and route line are tuned for a light basemap, and switching to dark tiles
// made the map read as "broken" rather than themed — confusing next to the
// rest of the (properly dark) UI.
const LIGHT_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

function dotIcon(color: string, size = 16): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
      box-shadow:0 0 0 1px rgba(11,11,11,0.25);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface Props {
  route: RouteInfo;
  stops: Stop[];
  locations: TripLocations;
}

function formatHour(hourOffset: number): string {
  const totalMinutes = Math.round(hourOffset * 60);
  const day = Math.floor(totalMinutes / (24 * 60)) + 1;
  const minutesInDay = totalMinutes % (24 * 60);
  const h = Math.floor(minutesInDay / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutesInDay % 60).toString().padStart(2, "0");
  return `Día ${day} · ${h}:${m}`;
}

export default function RouteMap({ route, stops, locations }: Props) {
  const { t } = useTranslation();
  const polylinePositions: LatLngExpression[] = route.geometry.map(([lat, lon]) => [lat, lon]);
  const bounds = polylinePositions.length ? L.latLngBounds(polylinePositions) : undefined;

  return (
    <div className="card map-card">
      <MapContainer bounds={bounds} style={{ height: 420, width: "100%" }} scrollWheelZoom>
        <TileLayer attribution={LIGHT_TILES.attribution} url={LIGHT_TILES.url} />
        <Polyline positions={polylinePositions} pathOptions={{ color: "#2a78d6", weight: 4, opacity: 0.85 }} />

        <Marker position={[locations.current_location.lat, locations.current_location.lon]} icon={dotIcon("#2a78d6", 18)}>
          <Popup>
            <strong>{t("map.popup.origin")}</strong>
            <br />
            {locations.current_location.display_name}
          </Popup>
        </Marker>

        {stops.map((stop, idx) => (
          <Marker
            key={`${stop.type}-${idx}`}
            position={[stop.lat, stop.lon]}
            icon={dotIcon(STOP_COLORS[stop.type] ?? "#898781", stop.type === "pickup" || stop.type === "dropoff" ? 18 : 12)}
          >
            <Popup>
              <strong>{STOP_KIND_LABEL[stop.type] ? t(STOP_KIND_LABEL[stop.type]) : stop.label}</strong>
              <br />
              {formatHour(stop.hour_offset)}
              <br />
              {t("map.popup.duration")}: {Math.round(stop.duration_hours * 60)} min
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-legend">
        <span className="map-legend__item">
          <span className="map-legend__dot" style={{ background: "#2a78d6" }} /> {t("map.legend.route")}
        </span>
        {(Object.keys(STOP_KIND_LABEL)).map((type) => (
          <span className="map-legend__item" key={type}>
            <span className="map-legend__dot" style={{ background: STOP_COLORS[type] }} /> {t(STOP_KIND_LABEL[type])}
          </span>
        ))}
      </div>
    </div>
  );
}
