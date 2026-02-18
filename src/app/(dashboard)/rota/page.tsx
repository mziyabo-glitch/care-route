"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Carer = { id: string; name: string | null };
type Assignment = { carer_id: string; carer_name: string | null; role: string };
type Visit = {
  id: string;
  client_id: string;
  carer_id: string;
  carer_ids?: string[];
  assignments?: Assignment[];
  is_joint?: boolean;
  client_name: string | null;
  carer_name: string | null;
  client_postcode?: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type VisitWithContext = Visit & {
  /** When showing in secondary carer's row */
  otherCarerName?: string | null;
  travelTight?: { gap: number; need: number };
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekRange(weekStart: Date): { start: Date; end: Date; days: Date[] } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return { start, end, days };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800";
    case "missed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-indigo-100 text-indigo-800";
  }
}

/** Estimate travel minutes between two UK postcodes (outward code heuristic, no external API) */
function estimateTravelMinutes(postcodeA: string | null | undefined, postcodeB: string | null | undefined): number {
  const a = (postcodeA ?? "").toUpperCase().trim();
  const b = (postcodeB ?? "").toUpperCase().trim();
  if (!a || !b) return 15;
  const outwardA = a.split(/\s/)[0] ?? "";
  const outwardB = b.split(/\s/)[0] ?? "";
  if (outwardA === outwardB) return 10;
  if (outwardA.slice(0, 2) === outwardB.slice(0, 2)) return 18;
  return 25;
}

export default function RotaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const weekParam = searchParams.get("week");

  const [weekStart, setWeekStart] = useState<Date>(() => {
    if (weekParam) {
      const d = new Date(weekParam);
      if (!isNaN(d.getTime())) return getMondayOfWeek(d);
    }
    return getMondayOfWeek(new Date());
  });

  const [carers, setCarers] = useState<Carer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitWithContext | null>(null);

  const { start, end, days } = useMemo(
    () => getWeekRange(weekStart),
    [weekStart.toISOString().slice(0, 10)]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const weekStartISO = start.toISOString();
      const weekEndISO = end.toISOString();
      const res = await fetch(
        `/api/rota?weekStart=${encodeURIComponent(weekStartISO)}&weekEnd=${encodeURIComponent(weekEndISO)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load rota");
        return;
      }
      setCarers(data.carers ?? []);
      setVisits(data.visits ?? []);
    } catch (e) {
      setError("Failed to load rota");
    } finally {
      setLoading(false);
    }
  }, [start.toISOString(), end.toISOString()]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync weekStart when URL changes (e.g. browser back/forward)
  useEffect(() => {
    if (weekParam) {
      const d = new Date(weekParam);
      if (!isNaN(d.getTime())) setWeekStart(getMondayOfWeek(d));
    }
  }, [weekParam]);

  // Group visits by carer (from assignments/carer_ids), put joint visits in BOTH carers' rows
  const grouped = useMemo(() => {
    const byCarerDay: Record<string, Record<string, VisitWithContext[]>> = {};
    const carerIds = new Set(carers.map((c) => c.id));
    const unassigned: Visit[] = [];
    const conflictIds = new Set<string>();
    const travelTightByVisit: Record<string, { gap: number; need: number }> = {};

    for (const v of visits) {
      const dayKey = v.start_time.slice(0, 10);
      const ids = Array.isArray(v.carer_ids) && v.carer_ids.length > 0
        ? v.carer_ids
        : v.carer_id ? [v.carer_id] : [];
      const validIds = ids.filter((id) => carerIds.has(id));
      if (validIds.length === 0) {
        unassigned.push(v);
        continue;
      }
      const primaryId = ids[0];
      const primaryAssignment = v.assignments?.find((a) => a.role === "primary");
      const secondaryAssignment = v.assignments?.find((a) => a.role === "secondary");
      const primaryName = primaryAssignment?.carer_name ?? v.carer_name;
      const secondaryName = secondaryAssignment?.carer_name;

      for (const cid of validIds) {
        if (!byCarerDay[cid]) byCarerDay[cid] = {};
        if (!byCarerDay[cid][dayKey]) byCarerDay[cid][dayKey] = [];
        const otherName = v.is_joint && cid !== primaryId ? primaryName : null;
        byCarerDay[cid][dayKey].push({ ...v, otherCarerName: otherName });
      }
    }

    // Sort, overlap check, travel gap per carer/day
    for (const carerId of Object.keys(byCarerDay)) {
      for (const dayKey of Object.keys(byCarerDay[carerId])) {
        const cellVisits = byCarerDay[carerId][dayKey];
        cellVisits.sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
        for (let i = 1; i < cellVisits.length; i++) {
          const prev = cellVisits[i - 1];
          const curr = cellVisits[i];
          // Overlap
          if (new Date(curr.start_time).getTime() < new Date(prev.end_time).getTime()) {
            conflictIds.add(prev.id);
            conflictIds.add(curr.id);
          }
          // Travel gap: gap < need + 5 buffer => tight
          const gapMs = new Date(curr.start_time).getTime() - new Date(prev.end_time).getTime();
          const gap = Math.round(gapMs / 60000);
          const need = estimateTravelMinutes(prev.client_postcode, curr.client_postcode) + 5;
          if (gap < need && gap >= 0) {
            travelTightByVisit[curr.id] = { gap, need };
          }
        }
      }
    }

    return { byCarerDay, unassigned, conflictIds, travelTightByVisit };
  }, [visits, carers]);

  const goPrev = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
    router.push(`/rota?week=${prev.toISOString().slice(0, 10)}`);
  };

  const goNext = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    router.push(`/rota?week=${next.toISOString().slice(0, 10)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Rota</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Prev week
          </button>
          <span className="min-w-[180px] text-center text-sm font-medium text-gray-700">
            {formatDateShort(days[0])} – {formatDateShort(days[6])}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next week →
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-2 text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Loading rota...</p>
        </div>
      ) : (
        <>
          {/* Unassigned section */}
          {grouped.unassigned.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-amber-900">
                Unassigned visits
              </h2>
              <ul className="space-y-2">
                {grouped.unassigned.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {v.client_name ?? "Unknown"}
                    </span>
                    <span className="text-gray-500">
                      {formatTime(v.start_time)}–{formatTime(v.end_time)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadge(v.status)}`}
                    >
                      {v.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Main grid */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-[700px] border-collapse">
              <thead>
                <tr className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50">
                  <th className="sticky left-0 z-30 min-w-[140px] border-r border-gray-200 bg-gray-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    Carer
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className="min-w-[100px] px-2 py-3 text-center text-xs font-semibold text-gray-600"
                    >
                      <div>{DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                      <div className="mt-0.5 font-normal">
                        {formatDateShort(d)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm text-gray-500"
                    >
                      No carers yet. Add carers to see the rota.
                    </td>
                  </tr>
                ) : (
                  carers.map((carer) => (
                    <tr key={carer.id} className="group">
                      <td className="sticky left-0 z-10 min-w-[140px] border-r border-gray-100 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] group-hover:bg-gray-50">
                        {carer.name ?? "—"}
                      </td>
                      {days.map((d) => {
                        const dayKey = d.toISOString().slice(0, 10);
                        const cellVisits =
                          grouped.byCarerDay[carer.id]?.[dayKey] ?? [];
                        return (
                          <td
                            key={dayKey}
                            className="min-w-[100px] align-top border-l border-gray-100 px-2 py-2"
                          >
                            {cellVisits.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="space-y-2">
                                {cellVisits.map((v) => {
                                  const hasConflict = grouped.conflictIds.has(v.id);
                                  const travel = grouped.travelTightByVisit[v.id];
                                  const travelRatio = travel ? travel.gap / travel.need : 1;
                                  return (
                                    <button
                                      key={`${v.id}-${carer.id}`}
                                      type="button"
                                      onClick={() => setSelectedVisit(v)}
                                      className={`block w-full rounded-md border px-2 py-1.5 text-left text-xs transition ${
                                        hasConflict
                                          ? "border-red-500 bg-red-50 hover:border-red-600 hover:bg-red-100"
                                          : "border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50"
                                      }`}
                                    >
                                      <div className="flex items-center gap-1 font-medium text-gray-900">
                                        {hasConflict && (
                                          <span className="text-amber-600" title="Overlap">
                                            ⚠
                                          </span>
                                        )}
                                        {formatTime(v.start_time)}–
                                        {formatTime(v.end_time)}
                                      </div>
                                      <div className="text-gray-600">
                                        {v.client_name ?? "Unknown"}
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-1">
                                        <span
                                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${getStatusBadge(v.status)}`}
                                        >
                                          {v.status}
                                        </span>
                                        {v.is_joint && (
                                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                                            👥 Joint
                                          </span>
                                        )}
                                        {travel && (
                                          <span
                                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                              travelRatio < 0.5 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                            }`}
                                            title={`(gap ${travel.gap}m, need ~${travel.need}m)`}
                                          >
                                            ⚠ Tight travel
                                          </span>
                                        )}
                                      </div>
                                      {v.otherCarerName && (
                                        <div className="mt-0.5 text-[10px] text-gray-500">
                                          With: {v.otherCarerName}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Visit detail modal */}
      {selectedVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedVisit(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Visit details
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-gray-500">Client</dt>
                <dd className="text-gray-900">{selectedVisit.client_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Carer(s)</dt>
                <dd className="text-gray-900">
                  {selectedVisit.assignments?.length
                    ? selectedVisit.assignments.map((a) => a.carer_name ?? "—").join(", ")
                    : selectedVisit.carer_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Time</dt>
                <dd className="text-gray-900">
                  {formatTime(selectedVisit.start_time)} – {formatTime(selectedVisit.end_time)}
                  {" · "}
                  {new Date(selectedVisit.start_time).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Status</dt>
                <dd className="flex flex-wrap items-center gap-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadge(selectedVisit.status)}`}
                  >
                    {selectedVisit.status}
                  </span>
                  {selectedVisit.is_joint && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                      👥 Joint visit
                    </span>
                  )}
                </dd>
              </div>
              {selectedVisit.notes && (
                <div>
                  <dt className="font-medium text-gray-500">Notes</dt>
                  <dd className="text-gray-900">{selectedVisit.notes}</dd>
                </div>
              )}
            </dl>
            <div className="mt-6 flex gap-3">
              <a
                href="/visits"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Edit in Visits
              </a>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
