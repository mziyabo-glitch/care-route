"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState } from "react";
import {
  displayStatusLabel,
  formatUkTime,
  pinColor,
  todayInLondon,
  type VisitMapRow,
} from "@/lib/visit-map";

type CarerOption = { id: string; name: string };

class MapErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const VisitMapLeaflet = dynamic(
  () => import("./visit-map-leaflet").then((m) => m.VisitMapLeaflet),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
        Loading map…
      </div>
    ),
  }
);

type ApiResponse = {
  date: string;
  visits: VisitMapRow[];
  carers: CarerOption[];
  mappableCount: number;
  skippedNoCoords: number;
  error?: string;
};

export function VisitMapPageClient({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [carerId, setCarerId] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const load = useCallback(async (d: string, carer: string) => {
    setLoading(true);
    setError(null);
    setMapUnavailable(false);
    try {
      const params = new URLSearchParams({ date: d });
      if (carer) params.set("carer_id", carer);
      const res = await fetch(`/api/visit-map?${params}`);
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load visits");
        setData(null);
        return;
      }
      setData(json);
      setSelectedId(null);
    } catch {
      setError("Failed to load visits");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date, carerId);
  }, [date, carerId, load]);

  const selected = data?.visits.find((v) => v.id === selectedId) ?? null;
  const allVisits = data?.visits ?? [];
  const visits = onlyIssues
    ? allVisits.filter(
        (v) =>
          v.display_status === "late" ||
          v.status === "missed" ||
          v.missing_care_note
      )
    : allVisits;
  const mappable = visits.filter(
    (v) => v.client_lat != null && v.client_lng != null
  );
  const nonMappable = visits.filter(
    (v) => v.client_lat == null || v.client_lng == null
  );
  const showMap = !mapUnavailable && mappable.length > 0;
  const carers = data?.carers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm font-medium text-slate-700">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <button
          type="button"
          onClick={() => setDate(todayInLondon())}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Today
        </button>
        <label className="block text-sm font-medium text-slate-700">
          Carer
          <select
            value={carerId}
            onChange={(e) => setCarerId(e.target.value)}
            className="mt-1 block min-w-[10rem] rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All carers</option>
            {carers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Only show issues
        </label>
        {data && !loading && (
          <p className="text-sm text-slate-600">
            {visits.length} visit{visits.length === 1 ? "" : "s"}
            {data.skippedNoCoords > 0 && (
              <span className="text-amber-700">
                {" "}
                · {data.skippedNoCoords} without coordinates
              </span>
            )}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && visits.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">
          No visits scheduled for this day
          {carerId ? " for the selected carer" : ""}.
        </p>
      )}

      {(loading || visits.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {loading ? (
              <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
                Loading…
              </div>
            ) : mapUnavailable ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                Map unavailable. Use the table below to review visits.
              </div>
            ) : mappable.length === 0 && visits.length > 0 ? (
              <div className="flex h-[min(40vh,320px)] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center text-sm text-slate-500">
                No visits with coordinates for this day. Geocode client postcodes on
                the Clients page, or use the table below.
              </div>
            ) : null}
            {!loading && showMap && (
              <MapErrorBoundary onError={() => setMapUnavailable(true)}>
                <VisitMapLeaflet
                  visits={mappable}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </MapErrorBoundary>
            )}
            {!loading &&
              (mapUnavailable ? visits.length > 0 : nonMappable.length > 0) && (
                <VisitFallbackTable
                  visits={mapUnavailable ? visits : nonMappable}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  title={
                    mapUnavailable
                      ? "All visits"
                      : "Visits without map coordinates"
                  }
                />
              )}
          </div>
          <VisitDetailPanel visit={selected} loading={loading} />
        </div>
      )}

      <VisitMapLegend />
    </div>
  );
}

function VisitDetailPanel({
  visit,
  loading,
}: {
  visit: VisitMapRow | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading…
      </aside>
    );
  }

  if (!visit) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Click a pin or table row to see visit details.
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">{visit.client_name}</h2>
      {visit.address && (
        <p className="mt-1 text-sm text-slate-600">{visit.address}</p>
      )}
      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
        {displayStatusLabel(visit.display_status)}
      </p>
      {visit.missing_care_note && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Missing care note for this visit.
        </p>
      )}
      {visit.distance_warning && (
        <p className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          Check-in location is far from the client address (over 500 m).
        </p>
      )}
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Carer(s)</dt>
          <dd className="font-medium text-slate-800">
            {visit.carer_names.length > 0
              ? visit.carer_names.join(", ")
              : "Unassigned"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Scheduled</dt>
          <dd className="text-slate-800">
            {formatUkTime(visit.start_time)} – {formatUkTime(visit.end_time)}
          </dd>
        </div>
        {visit.check_in_at && (
          <div>
            <dt className="text-slate-500">Check-in</dt>
            <dd className="text-slate-800">{formatUkTime(visit.check_in_at)}</dd>
          </div>
        )}
        {visit.check_out_at && (
          <div>
            <dt className="text-slate-500">Check-out</dt>
            <dd className="text-slate-800">
              {formatUkTime(visit.check_out_at)}
            </dd>
          </div>
        )}
      </dl>
      <a
        href="/visits"
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        Open visits →
      </a>
    </aside>
  );
}

function VisitFallbackTable({
  visits,
  selectedId,
  onSelect,
  title,
}: {
  visits: VisitMapRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  title: string;
}) {
  if (visits.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
        {title}
      </p>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-2 font-medium">Client</th>
            <th className="px-4 py-2 font-medium">Carer</th>
            <th className="px-4 py-2 font-medium">Scheduled</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                v.id === selectedId ? "bg-blue-50" : ""
              }`}
            >
              <td className="px-4 py-2 font-medium text-slate-900">
                {v.client_name}
              </td>
              <td className="px-4 py-2 text-slate-700">
                {v.carer_names.length > 0
                  ? v.carer_names.join(", ")
                  : "—"}
              </td>
              <td className="px-4 py-2 text-slate-700">
                {formatUkTime(v.start_time)}
              </td>
              <td className="px-4 py-2">
                <span
                  className="inline-flex items-center gap-1.5 capitalize text-slate-700"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: pinColor(v.display_status) }}
                    aria-hidden
                  />
                  {displayStatusLabel(v.display_status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitMapLegend() {
  const items = [
    { label: "Scheduled", color: "#2563EB" },
    { label: "Due soon", color: "#0891B2" },
    { label: "Late (no check-in)", color: "#F59E0B" },
    { label: "In progress", color: "#7C3AED" },
    { label: "Completed", color: "#16A34A" },
    { label: "Missed", color: "#DC2626" },
  ] as const;

  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div className="flex flex-wrap gap-4">
        {items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border border-white shadow"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
          Issue: Missing notes
        </span>
        <span className="rounded bg-orange-100 px-2 py-0.5 font-medium text-orange-900">
          Issue: Late
        </span>
        <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-800">
          Issue: Missed
        </span>
      </div>
    </div>
  );
}
