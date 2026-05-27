"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  displayStatusLabel,
  formatUkTime,
  pinColor,
  type VisitMapRow,
} from "@/lib/visit-map";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker assets break under bundlers; use inline circle markers.
function circleIcon(color: string, selected: boolean) {
  const size = selected ? 18 : 14;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ visits }: { visits: VisitMapRow[] }) {
  const map = useMap();
  useEffect(() => {
    if (visits.length === 0) return;
    const bounds = L.latLngBounds(
      visits.map((v) => [v.client_lat!, v.client_lng!] as [number, number])
    );
    map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
  }, [map, visits]);
  return null;
}

const UK_CENTER: [number, number] = [54.5, -2.5];

/** Spread overlapping pins in a small ring so dense areas remain readable. */
function spreadPosition(
  lat: number,
  lng: number,
  index: number,
  total: number
): [number, number] {
  if (total <= 1) return [lat, lng];
  const angle = (2 * Math.PI * index) / total;
  const offset = 0.00035;
  return [lat + Math.cos(angle) * offset, lng + Math.sin(angle) * offset];
}

function groupByLocation(visits: VisitMapRow[]): Map<string, VisitMapRow[]> {
  const groups = new Map<string, VisitMapRow[]>();
  for (const v of visits) {
    const key = `${v.client_lat!.toFixed(5)},${v.client_lng!.toFixed(5)}`;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  return groups;
}

export function VisitMapLeaflet({
  visits,
  selectedId,
  onSelect,
}: {
  visits: VisitMapRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const center = useMemo((): [number, number] => {
    if (visits.length === 0) return UK_CENTER;
    const lat =
      visits.reduce((s, v) => s + (v.client_lat ?? 0), 0) / visits.length;
    const lng =
      visits.reduce((s, v) => s + (v.client_lng ?? 0), 0) / visits.length;
    return [lat, lng];
  }, [visits]);

  if (visits.length === 0) {
    return (
      <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center text-sm text-slate-500">
        No visits with coordinates for this day. Geocode client postcodes on the
        Clients page to show pins.
      </div>
    );
  }

  return (
    <div className="h-[min(70vh,560px)] overflow-hidden rounded-xl border border-slate-200 shadow-sm [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:rounded-xl">
      <MapContainer center={center} zoom={10} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds visits={visits} />
        {[...groupByLocation(visits).entries()].flatMap(([, group]) =>
          group.map((v, index) => {
          const selected = v.id === selectedId;
          const [lat, lng] = spreadPosition(
            v.client_lat!,
            v.client_lng!,
            index,
            group.length
          );
          return (
            <Marker
              key={v.id}
              position={[lat, lng]}
              icon={circleIcon(pinColor(v.display_status), selected)}
              eventHandlers={{
                click: () => onSelect(v.id),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{v.client_name}</p>
                  <p className="text-slate-600">
                    {formatUkTime(v.start_time)} ·{" "}
                    {displayStatusLabel(v.display_status)}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-blue-600 hover:underline"
                    onClick={() => onSelect(v.id)}
                  >
                    Details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })
        )}
      </MapContainer>
    </div>
  );
}
