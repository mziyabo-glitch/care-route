"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  formatUkTime,
  todayInLondon,
  type VisitMapRow,
} from "@/lib/visit-map";

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
  mappableCount: number;
  skippedNoCoords: number;
  error?: string;
};

export function VisitMapPageClient({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/visit-map?date=${encodeURIComponent(d)}`);
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
    load(date);
  }, [date, load]);

  const selected = data?.visits.find((v) => v.id === selectedId) ?? null;

  const mappable =
    data?.visits.filter((v) => v.client_lat != null && v.client_lng != null) ??
    [];

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
        {data && !loading && (
          <p className="text-sm text-slate-600">
            {data.visits.length} visit{data.visits.length === 1 ? "" : "s"}
            {data.skippedNoCoords > 0 && (
              <span className="text-amber-700">
                {" "}
                · {data.skippedNoCoords} without coordinates (geocode on Clients)
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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <VisitMapLeaflet
          visits={mappable}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <VisitDetailPanel visit={selected} loading={loading} />
      </div>

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
        Click a pin to see visit details.
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">{visit.client_name}</h2>
      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
        {visit.display_status.replace("_", " ")}
      </p>
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

function VisitMapLegend() {
  const items = [
    { label: "Scheduled", color: "#2563EB" },
    { label: "Late (no check-in)", color: "#F59E0B" },
    { label: "In progress", color: "#7C3AED" },
    { label: "Completed", color: "#16A34A" },
    { label: "Missed", color: "#DC2626" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
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
  );
}
