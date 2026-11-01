import { useMemo } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png?url";
import markerIcon from "leaflet/dist/images/marker-icon.png?url";
import markerShadow from "leaflet/dist/images/marker-shadow.png?url";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface SiteData {
  display_name: string;
  name?: string;
  subtitle?: string;
  type: string;
  lat: number;
  lon: number;
  area?: number | null;
  boundingbox?: string[] | null;
  geojson?: unknown;
  plants: string;
  water: string;
  notes: string;
}

function formatArea(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(value).toLocaleString()} m²`;
}

function parseDisplayName(displayName: string): { title: string; subtitle: string } {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { title: displayName || "Site", subtitle: "OpenStreetMap" };
  }
  return {
    title: parts[0],
    subtitle: parts.slice(1).join(", "),
  };
}

export function SiteCard({ data }: { data: SiteData }) {
  const parsed = useMemo(() => {
    if (data.name && data.subtitle) {
      return { title: data.name, subtitle: data.subtitle };
    }
    return parseDisplayName(data.display_name || "Site");
  }, [data]);

  const geoJson = data.geojson as Record<string, unknown> | undefined;
  const mapCenter: [number, number] = [data.lat, data.lon];

  return (
    <div className="w-full max-w-[720px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[20px] font-semibold text-[var(--text-primary)]">
              {parsed.title}
            </h3>
            <p className="m-0 text-sec text-[var(--text-secondary)]">{parsed.subtitle}</p>
          </div>
          <span className="rounded-md border border-[var(--accent)] bg-[var(--accent-subtle)] px-2 py-1 text-meta font-medium uppercase tracking-wide text-[var(--accent)]">
            {data.type || "Site"}
          </span>
        </div>
      </div>

      <div className="border-b border-[var(--border)]">
        <div className="h-[220px] w-full overflow-hidden">
          <MapContainer
            center={mapCenter}
            zoom={15}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={mapCenter} icon={defaultIcon} />
            {geoJson && <GeoJSON data={geoJson as never} />}
          </MapContainer>
        </div>
      </div>

      <div className="px-5 py-4">
        <table className="w-full border-separate border-spacing-y-2 text-sec">
          <tbody>
            <tr>
              <th className="w-28 pr-4 text-start text-secondary">Type</th>
              <td className="font-mono text-meta text-[var(--text-primary)]">
                leisure={data.type || "site"}
              </td>
            </tr>
            <tr>
              <th className="w-28 pr-4 text-start text-secondary">Coordinates</th>
              <td className="font-mono text-meta text-[var(--text-primary)]">
                {data.lat.toFixed(5)}, {data.lon.toFixed(5)}
              </td>
            </tr>
            <tr>
              <th className="w-28 pr-4 text-start text-secondary">Area</th>
              <td className="font-mono text-meta text-[var(--text-primary)]">
                {formatArea(data.area ?? null)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--border)] px-5 py-4">
        <div className="mb-3 text-body font-medium text-[var(--text-primary)]">From the web</div>
        <div className="space-y-3 text-sec">
          <div className="grid grid-cols-[108px_1fr] gap-3">
            <div className="text-secondary">Plants</div>
            <div className="whitespace-pre-wrap leading-relaxed text-[var(--text-primary)]">
              {data.plants || "No plant notes were returned for this site."}
            </div>
          </div>
          <div className="grid grid-cols-[108px_1fr] gap-3">
            <div className="text-secondary">Water</div>
            <div className="whitespace-pre-wrap leading-relaxed text-[var(--text-primary)]">
              {data.water || "No water notes were returned for this site."}
            </div>
          </div>
          <div className="grid grid-cols-[108px_1fr] gap-3">
            <div className="text-secondary">Notes</div>
            <div className="whitespace-pre-wrap leading-relaxed text-[var(--text-primary)]">
              {data.notes || "No historical usage notes were returned for this site."}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--bg-muted)] px-5 py-3">
        <a
          href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=15/${data.lat}/${data.lon}`}
          target="_blank"
          rel="noreferrer"
          className="text-body font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Open in OpenStreetMap
        </a>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-body font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-muted)]"
        >
          Set as project site
        </button>
      </div>
    </div>
  );
}
