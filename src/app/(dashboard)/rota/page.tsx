"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Carer = { id: string; name: string | null };
type Assignment = { carer_id: string; carer_name: string | null; role: string };
type RiskFactors = Record<string, { value: unknown; points: number }>;

type Visit = {
  id: string;
  client_id: string;
  carer_id: string;
  carer_ids?: string[];
  assignments?: Assignment[];
  is_joint?: boolean;
  requires_double_up?: boolean;
  assigned_count?: number;
  missing_second_carer?: boolean;
  client_name: string | null;
  carer_name: string | null;
  client_postcode?: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  risk_score?: number | null;
  risk_band?: string | null;
  risk_factors?: RiskFactors | null;
};

type VisitWithContext = Visit & {
  /** When showing in secondary carer's row */
  otherCarerName?: string | null;
  travelTight?: { gap: number; need: number };
};

type ReorderSuggestion = {
  carerId: string;
  carerName: string | null;
  dayKey: string;
  visitA: VisitWithContext;
  visitB: VisitWithContext;
  savingsMinutes: number;
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
      return "bg-slate-100 text-slate-600";
    case "missed":
      return "bg-red-100 text-red-600";
    default:
      return "bg-blue-50 text-blue-700";
  }
}

function getRiskBandClass(band: string) {
  switch (band) {
    case "low": return "bg-emerald-100 text-emerald-700";
    case "medium": return "bg-amber-100 text-amber-700";
    case "high": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function RiskChip({ visit, compact = false }: { visit: Visit; compact?: boolean }) {
  if (visit.risk_band) {
    return (
      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${getRiskBandClass(visit.risk_band)}`}>
        {compact ? visit.risk_band : `Risk: ${visit.risk_band}`}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
      Calculating…
    </span>
  );
}

/** Postcode heuristic fallback when no geolocation or server cache available */
function estimateTravelFallback(postcodeA: string | null | undefined, postcodeB: string | null | undefined): number {
  const a = (postcodeA ?? "").toUpperCase().trim();
  const b = (postcodeB ?? "").toUpperCase().trim();
  if (!a || !b) return 15;
  const outwardA = a.split(/\s/)[0] ?? "";
  const outwardB = b.split(/\s/)[0] ?? "";
  if (outwardA === outwardB) return 10;
  if (outwardA.slice(0, 2) === outwardB.slice(0, 2)) return 18;
  return 25;
}

/** Get travel minutes between two clients; uses server cache, symmetric fallback, then postcode heuristic */
function getTravelMinutes(
  from: { client_id: string; client_postcode?: string | null },
  to: { client_id: string; client_postcode?: string | null },
  serverTravelTimes: Record<string, number>
): number {
  const fwd = `${from.client_id}|${to.client_id}`;
  const rev = `${to.client_id}|${from.client_id}`;
  return (
    serverTravelTimes[fwd] ??
    serverTravelTimes[rev] ??
    estimateTravelFallback(from.client_postcode, to.client_postcode)
  );
}

const MIN_SAVINGS_FOR_SUGGESTION = 8;

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
  const [serverTravelTimes, setServerTravelTimes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitWithContext | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => new Set());
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReorderSuggestion | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [carerFilter, setCarerFilter] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [carerFilterOpen, setCarerFilterOpen] = useState(false);
  const carerFilterRef = useRef<HTMLDivElement>(null);
  const [riskLoading, setRiskLoading] = useState<string | null>(null);
  const [visitRisk, setVisitRisk] = useState<Record<string, { risk_score: number; risk_band: string; factors: RiskFactors }>>({});

  useEffect(() => {
    if (!carerFilterOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (carerFilterRef.current && !carerFilterRef.current.contains(e.target as Node)) {
        setCarerFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [carerFilterOpen]);

  useEffect(() => {
    if (!selectedVisit?.id || selectedVisit.risk_score != null) return;
    setRiskLoading(selectedVisit.id);
    fetch(`/api/visits/${selectedVisit.id}/risk`)
      .then((r) => r.json())
      .then((data) => {
        if (data.risk_score != null) setVisitRisk((prev) => ({ ...prev, [selectedVisit.id]: data }));
      })
      .finally(() => setRiskLoading(null));
  }, [selectedVisit?.id, selectedVisit?.risk_score]);

  const toggleDaySelection = useCallback((dayKey: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }, []);

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
      setServerTravelTimes(data.travelTimes ?? {});
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

  // Reset dismissed when week changes so suggestions show for new week
  useEffect(() => {
    setSuggestionsDismissed(false);
  }, [weekStart.toISOString().slice(0, 10)]);

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
      const isJointVisit =
        !!v.is_joint ||
        (Array.isArray(v.carer_ids) && v.carer_ids.length >= 2) ||
        ((v.assignments?.length ?? 0) >= 2);
      const primaryAssignment = v.assignments?.find((a) => a.role === "primary");
      const secondaryAssignment = v.assignments?.find((a) => a.role === "secondary");
      const primaryName = primaryAssignment?.carer_name ?? v.carer_name;
      const secondaryName = secondaryAssignment?.carer_name;

      for (const cid of validIds) {
        if (!byCarerDay[cid]) byCarerDay[cid] = {};
        if (!byCarerDay[cid][dayKey]) byCarerDay[cid][dayKey] = [];
        const otherName = isJointVisit
          ? (cid === primaryId ? secondaryName ?? null : primaryName ?? null)
          : null;
        byCarerDay[cid][dayKey].push({ ...v, is_joint: isJointVisit, otherCarerName: otherName });
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
          // Travel gap: use server-computed times → fallback to postcode heuristic
          const gapMs = new Date(curr.start_time).getTime() - new Date(prev.end_time).getTime();
          const gap = Math.round(gapMs / 60000);
          const pairKey = `${prev.client_id}|${curr.client_id}`;
          const need = serverTravelTimes[pairKey] ?? estimateTravelFallback(prev.client_postcode, curr.client_postcode);
          if (gap < need && gap >= 0) {
            travelTightByVisit[curr.id] = { gap, need };
          }
        }
      }
    }

    type CarerWeekStats = {
      visitCount: number;
      careMinutes: number;
      firstTime: string | null;
      lastTime: string | null;
      travelWarnings: number;
      missingDoubleUp: number;
    };
    const emptyStats = (): CarerWeekStats => ({
      visitCount: 0, careMinutes: 0,
      firstTime: null, lastTime: null,
      travelWarnings: 0, missingDoubleUp: 0,
    });
    const carerStats: Record<string, CarerWeekStats> = {};
    for (const c of carers) {
      carerStats[c.id] = emptyStats();
    }
    for (const carerId of Object.keys(byCarerDay)) {
      const stats = carerStats[carerId] ?? emptyStats();
      for (const dayKey of Object.keys(byCarerDay[carerId])) {
        for (const v of byCarerDay[carerId][dayKey]) {
          stats.visitCount++;
          const ms = new Date(v.end_time).getTime() - new Date(v.start_time).getTime();
          stats.careMinutes += Math.round(ms / 60000);
          if (!stats.firstTime || v.start_time < stats.firstTime) stats.firstTime = v.start_time;
          if (!stats.lastTime || v.end_time > stats.lastTime) stats.lastTime = v.end_time;
          if (travelTightByVisit[v.id]) stats.travelWarnings++;
          const isJ = !!v.is_joint;
          if (!!v.missing_second_carer || (!!v.requires_double_up && !isJ)) stats.missingDoubleUp++;
        }
      }
      carerStats[carerId] = stats;
    }

    return { byCarerDay, unassigned, conflictIds, travelTightByVisit, carerStats };
  }, [visits, carers, serverTravelTimes]);

  // Filtered carers for display
  const filteredCarers = useMemo(() => {
    let list = carers;
    if (carerFilter.size > 0) {
      list = list.filter((c) => carerFilter.has(c.id));
    }
    if (issuesOnly) {
      list = list.filter((c) => {
        const stats = grouped.carerStats[c.id];
        return stats && (stats.travelWarnings > 0 || stats.missingDoubleUp > 0) ||
          Object.keys(grouped.byCarerDay[c.id] ?? {}).some((dayKey) =>
            (grouped.byCarerDay[c.id][dayKey] ?? []).some((v) => grouped.conflictIds.has(v.id))
          );
      });
    }
    return list;
  }, [carers, carerFilter, issuesOnly, grouped]);

  // Whether a visit passes status filter
  const visitPassesStatus = useCallback(
    (v: VisitWithContext) =>
      statusFilter === "all" || v.status === statusFilter,
    [statusFilter]
  );

  const carersWithVisits = useMemo(
    () => carers.filter((c) => (grouped.carerStats[c.id]?.visitCount ?? 0) > 0),
    [carers, grouped.carerStats]
  );
  const hasActiveFilters = carerFilter.size > 0 || statusFilter !== "all" || issuesOnly;
  const clearFilters = useCallback(() => {
    setCarerFilter(new Set());
    setStatusFilter("all");
    setIssuesOnly(false);
    setCarerFilterOpen(false);
  }, []);

  const goToday = useCallback(() => {
    const monday = getMondayOfWeek(new Date());
    setWeekStart(monday);
    router.push(`/rota?week=${monday.toISOString().slice(0, 10)}`);
  }, [router]);

  // Route reordering suggestions: one per carer/day with largest saving > 8 min
  const reorderSuggestions = useMemo(() => {
    const out: ReorderSuggestion[] = [];
    const byCarerDay = grouped.byCarerDay;
    const carerNames = Object.fromEntries(carers.map((c) => [c.id, c.name]));

    for (const carerId of Object.keys(byCarerDay)) {
      for (const dayKey of Object.keys(byCarerDay[carerId])) {
        const list = byCarerDay[carerId][dayKey];
        if (list.length < 2) continue;

        const sorted = [...list].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );

        const totalTravel = (visits: VisitWithContext[]) => {
          let sum = 0;
          for (let i = 1; i < visits.length; i++) {
            sum += getTravelMinutes(visits[i - 1], visits[i], serverTravelTimes);
          }
          return sum;
        };

        const currentTotal = totalTravel(sorted);
        let best: ReorderSuggestion | null = null;

        for (let i = 0; i < sorted.length - 1; i++) {
          const swapped = [...sorted];
          [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
          const swappedTotal = totalTravel(swapped);
          const savings = currentTotal - swappedTotal;
          if (savings > MIN_SAVINGS_FOR_SUGGESTION && (!best || savings > best.savingsMinutes)) {
            best = {
              carerId,
              carerName: carerNames[carerId] ?? null,
              dayKey,
              visitA: sorted[i],
              visitB: sorted[i + 1],
              savingsMinutes: savings,
            };
          }
        }
        if (best) out.push(best);
      }
    }
    return out;
  }, [grouped.byCarerDay, carers, serverTravelTimes]);

  const handleApplySwap = useCallback(async () => {
    if (!selectedSuggestion) return;
    setApplyLoading(true);
    setPanelError("");
    try {
      const res = await fetch("/api/rota/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitAId: selectedSuggestion.visitA.id,
          visitBId: selectedSuggestion.visitB.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPanelError(data.error ?? "Failed to apply swap");
        return;
      }
      const visitAId = selectedSuggestion.visitA.id;
      const visitBId = selectedSuggestion.visitB.id;
      setSelectedSuggestion(null);
      await fetchData();
      setToast({
        message: "Times swapped successfully.",
        undo: async () => {
          const r = await fetch("/api/rota/swap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitAId, visitBId }),
          });
          if (r.ok) await fetchData();
          setToast(null);
        },
      });
    } catch (e) {
      setPanelError("Failed to apply swap");
    } finally {
      setApplyLoading(false);
    }
  }, [selectedSuggestion, fetchData]);

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Rota</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goPrev}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <span className="min-w-[200px] text-center text-sm font-medium text-slate-700">
            {formatDateShort(days[0])} – {formatDateShort(days[6])}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200/80 bg-white px-5 py-3.5 shadow-sm ring-1 ring-slate-900/5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filters</span>
          <div className="relative" ref={carerFilterRef}>
            <button
              type="button"
              onClick={() => setCarerFilterOpen((o) => !o)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                carerFilter.size > 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              Carers
              {carerFilter.size > 0 && (
                <span className="rounded-full bg-blue-200 px-1.5 py-0.5 text-xs text-blue-800">
                  {carerFilter.size}
                </span>
              )}
              <span className="text-slate-400">▼</span>
            </button>
            {carerFilterOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {carersWithVisits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No carers with visits</div>
                ) : (
                  carersWithVisits.map((c) => {
                      const checked = carerFilter.size === 0 || carerFilter.has(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const allIds = new Set(carersWithVisits.map((x) => x.id));
                              const next = carerFilter.size === 0 ? new Set(allIds) : new Set(carerFilter);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              setCarerFilter(next.size === 0 || next.size === carersWithVisits.length ? new Set() : next);
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="text-slate-700">{c.name ?? "—"}</span>
                        </label>
                      );
                    })
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/50 p-1">
            {(["all", "scheduled", "completed", "missed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === s
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
            issuesOnly ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}>
            <input
              type="checkbox"
              checked={issuesOnly}
              onChange={(e) => setIssuesOnly(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span>Issues only</span>
          </label>
          {hasActiveFilters && (
            <>
              <span className="h-4 w-px bg-slate-200" aria-hidden />
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-3 text-xs font-medium text-red-600 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Loading rota…</p>
        </div>
      ) : (
        <>
          {/* Route reorder suggestions panel */}
          {!suggestionsDismissed && reorderSuggestions.length > 0 && (
            <div className="rounded-xl border border-blue-200/60 bg-blue-50/60 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setSuggestionsExpanded((e) => !e)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="text-xl" aria-hidden>💡</span>
                  <span className="text-sm font-medium text-slate-800">
                    {reorderSuggestions.length} route reorder suggestion{reorderSuggestions.length !== 1 ? "s" : ""} (save up to {Math.max(0, ...reorderSuggestions.map((s) => s.savingsMinutes))} min)
                  </span>
                  <span className="text-slate-500">
                    {suggestionsExpanded ? "▼" : "▶"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestionsDismissed(true)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Dismiss
                </button>
              </div>
              {suggestionsExpanded && (
                <ul className="mt-4 space-y-2 border-t border-blue-200/50 pt-4">
                  {reorderSuggestions.map((s) => (
                    <li
                      key={`${s.carerId}-${s.dayKey}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/70 px-4 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-900">{s.carerName ?? "Carer"}</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-600">{formatDateShort(new Date(s.dayKey))}</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-600">
                          Swap {formatTime(s.visitA.start_time)} ({s.visitA.client_name ?? "—"}) with {formatTime(s.visitB.start_time)} ({s.visitB.client_name ?? "—"})
                        </span>
                        <span className="ml-2 font-medium text-green-700">
                          −{s.savingsMinutes} min
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSuggestion(s);
                          setPanelError("");
                          document.getElementById(`rota-cell-${s.carerId}-${s.dayKey}`)?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="shrink-0 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-200"
                      >
                        Review
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Unassigned section */}
          {grouped.unassigned.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
              <h2 className="mb-3 text-sm font-semibold text-amber-900">
                Unassigned visits
              </h2>
              <ul className="space-y-2">
                {grouped.unassigned.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 text-sm shadow-sm"
                  >
                    <span className="font-medium text-slate-900">
                      {v.client_name ?? "Unknown"}
                    </span>
                    <span className="text-slate-500">
                      {formatTime(v.start_time)}–{formatTime(v.end_time)}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${getStatusBadge(v.status)}`}
                    >
                      {v.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200/80 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-wider text-slate-400">Key</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> OK</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Travel tight</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Missing 2nd</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Joint</span>
          </div>

          {/* Main grid */}
          <div className="overflow-x-auto rounded-xl bg-slate-100/60 shadow-sm">
            <table className="min-w-[700px] border-collapse">
              <thead>
                <tr className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
                  <th className="sticky left-0 z-30 min-w-[160px] border-r border-slate-200 bg-white px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Carer
                  </th>
                  {days.map((d) => {
                    const dayKey = d.toISOString().slice(0, 10);
                    const isSelected = selectedDays.has(dayKey);
                    return (
                      <th
                        key={dayKey}
                        onClick={() => toggleDaySelection(dayKey)}
                        className={`min-w-[110px] cursor-pointer select-none px-3 py-4 text-center text-xs font-semibold transition-colors ${
                          isSelected
                            ? "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div>{DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                        <div className={`mt-1 text-[11px] ${isSelected ? "text-blue-600" : "font-normal text-slate-500"}`}>
                          {formatDateShort(d)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {filteredCarers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="bg-white px-6 py-16 text-center text-sm text-slate-500"
                    >
                      {carers.length === 0
                        ? "No carers yet. Add carers to see the rota."
                        : "No carers match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filteredCarers.map((carer) => {
                    const stats = grouped.carerStats[carer.id];
                    const hasVisits = stats && stats.visitCount > 0;
                    const hours = hasVisits ? Math.floor(stats.careMinutes / 60) : 0;
                    const mins = hasVisits ? stats.careMinutes % 60 : 0;
                    const careLabel = hours > 0
                      ? `${hours}h${mins > 0 ? ` ${mins}m` : ""}`
                      : `${mins}m`;
                    return (
                    <tr key={carer.id} className="group">
                      <td className="sticky left-0 z-10 min-w-[180px] border-r border-slate-200/80 bg-white px-4 py-3 group-hover:bg-slate-50/80">
                        <div className="text-sm font-semibold text-slate-900">{carer.name ?? "—"}</div>
                        {hasVisits ? (
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-slate-500">
                            <span>{stats.visitCount} visit{stats.visitCount !== 1 ? "s" : ""}</span>
                            <span className="text-slate-300">·</span>
                            <span>{careLabel} care</span>
                            {stats.travelWarnings > 0 && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="font-medium text-amber-600">
                                  {stats.travelWarnings} travel
                                </span>
                              </>
                            )}
                            {stats.missingDoubleUp > 0 && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="font-medium text-red-600">
                                  {stats.missingDoubleUp} missing 2nd
                                </span>
                              </>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">
                              {formatTime(stats.firstTime!)}–{formatTime(stats.lastTime!)}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-[11px] text-slate-400">No visits</div>
                        )}
                      </td>
                      {days.map((d) => {
                        const dayKey = d.toISOString().slice(0, 10);
                        const rawVisits = grouped.byCarerDay[carer.id]?.[dayKey] ?? [];
                        const cellVisits = statusFilter === "all"
                          ? rawVisits
                          : rawVisits.filter(visitPassesStatus);
                        const isDaySelected = selectedDays.has(dayKey);
                        return (
                          <td
                            id={`rota-cell-${carer.id}-${dayKey}`}
                            key={dayKey}
                            className={`min-w-[110px] align-top border-l border-slate-200/60 px-2 py-3 ${
                              isDaySelected ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200/60" : "bg-slate-50/30"
                            }`}
                          >
                            {cellVisits.length === 0 ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : (
                              <div className="space-y-2">
                                {cellVisits.map((v) => {
                                  const hasConflict = grouped.conflictIds.has(v.id);
                                  const travel = grouped.travelTightByVisit[v.id];
                                  const isJoint = !!v.is_joint;
                                  const missingSecond = !!v.missing_second_carer || (!!v.requires_double_up && !isJoint);
                                  const allClear = !missingSecond && !hasConflict && !travel && v.status !== "missed";

                                  let cardBorder = "border border-slate-200/80";
                                  if (missingSecond) cardBorder = "border border-red-200 border-l-[3px] border-l-red-500";
                                  else if (hasConflict) cardBorder = "border border-red-200";

                                  return (
                                    <button
                                      key={`${v.id}-${carer.id}`}
                                      type="button"
                                      onClick={() => setSelectedVisit(v)}
                                      className={`relative block w-full rounded-xl bg-white p-3 text-left text-xs shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cardBorder}`}
                                    >
                                      {/* Time + indicator */}
                                      <div className="flex items-center gap-2">
                                        {missingSecond ? (
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                                        ) : v.status === "completed" ? (
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                                        ) : allClear ? (
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                                        ) : (
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                                        )}
                                        <span className="font-semibold text-slate-900">
                                          {formatTime(v.start_time)}–{formatTime(v.end_time)}
                                        </span>
                                      </div>
                                      {/* Client */}
                                      <div className="mt-1 truncate text-[11px] font-medium text-slate-700">
                                        {v.client_name ?? "Unknown"}
                                      </div>
                                      {/* With: other carer */}
                                      {v.otherCarerName && (
                                        <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                          With: {v.otherCarerName}
                                        </div>
                                      )}
                                      {/* Badge row */}
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <RiskChip visit={v} compact />
                                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${getStatusBadge(v.status)}`}>
                                          {v.status}
                                        </span>
                                        {missingSecond && (
                                          <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                            Missing 2nd
                                          </span>
                                        )}
                                        {travel && (
                                          <span
                                            className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                                            title={`Gap ${travel.gap}m, need ~${travel.need}m`}
                                          >
                                            Travel
                                          </span>
                                        )}
                                        {isJoint && (
                                          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                            Joint
                                          </span>
                                        )}
                                        {hasConflict && (
                                          <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                            Overlap
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Review & Apply panel (right-side) */}
      {selectedSuggestion && (
        <div className="fixed inset-0 z-[100] flex" role="dialog" aria-modal aria-labelledby="review-panel-title">
          <div className="flex-1 bg-black/50" onClick={() => setSelectedSuggestion(null)} aria-hidden />
          <div className="w-full max-w-md shrink-0 overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 id="review-panel-title" className="text-lg font-semibold text-slate-900">Review swap</h2>
                <button
                  type="button"
                  onClick={() => setSelectedSuggestion(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="space-y-6 px-5 py-6">
              {(() => {
                const s = selectedSuggestion;
                const dayVisits = grouped.byCarerDay[s.carerId]?.[s.dayKey] ?? [];
                const others = dayVisits.filter((v) => v.id !== s.visitA.id && v.id !== s.visitB.id);
                const newAStart = s.visitB.start_time;
                const newAEnd = s.visitB.end_time;
                const newBStart = s.visitA.start_time;
                const newBEnd = s.visitA.end_time;
                const overlapsA = others.filter(
                  (o) =>
                    new Date(newAStart).getTime() < new Date(o.end_time).getTime() &&
                    new Date(newAEnd).getTime() > new Date(o.start_time).getTime()
                );
                const overlapsB = others.filter(
                  (o) =>
                    new Date(newBStart).getTime() < new Date(o.end_time).getTime() &&
                    new Date(newBEnd).getTime() > new Date(o.start_time).getTime()
                );
                const conflicts = [...overlapsA, ...overlapsB];
                const travelBeforeFull = (() => {
                  const sorted = [...dayVisits].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
                  let sum = 0;
                  for (let i = 1; i < sorted.length; i++) {
                    sum += getTravelMinutes(sorted[i - 1], sorted[i], serverTravelTimes);
                  }
                  return sum;
                })();
                const swappedOrder = [...dayVisits]
                  .map((v) =>
                    v.id === s.visitA.id ? { ...v, start_time: newAStart, end_time: newAEnd } : v.id === s.visitB.id ? { ...v, start_time: newBStart, end_time: newBEnd } : v
                  )
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
                const travelAfterFull = (() => {
                  let sum = 0;
                  for (let i = 1; i < swappedOrder.length; i++) {
                    sum += getTravelMinutes(swappedOrder[i - 1], swappedOrder[i], serverTravelTimes);
                  }
                  return sum;
                })();

                return (
                  <>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carer · Date</h3>
                      <p className="mt-1 font-medium text-slate-900">{s.carerName ?? "—"}</p>
                      <p className="text-sm text-slate-600">{formatDateShort(new Date(s.dayKey))}</p>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current</h3>
                      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{formatTime(s.visitA.start_time)}–{formatTime(s.visitA.end_time)}</span>
                          <span className="text-slate-600">{s.visitA.client_name ?? "—"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{formatTime(s.visitB.start_time)}–{formatTime(s.visitB.end_time)}</span>
                          <span className="text-slate-600">{s.visitB.client_name ?? "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed</h3>
                      <div className="mt-2 space-y-2 rounded-lg border border-green-200 bg-green-50/30 p-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{formatTime(newBStart)}–{formatTime(newBEnd)}</span>
                          <span className="text-slate-600">{s.visitA.client_name ?? "—"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{formatTime(newAStart)}–{formatTime(newAEnd)}</span>
                          <span className="text-slate-600">{s.visitB.client_name ?? "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Travel</h3>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        <span className="text-slate-600">Before: {travelBeforeFull} min</span>
                        <span className="text-slate-600">After: {travelAfterFull} min</span>
                        <span className="font-medium text-green-700">Save {s.savingsMinutes} min</span>
                      </div>
                    </div>

                    {conflicts.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                        <p className="text-xs font-semibold text-amber-800">⚠ Overlap after swap</p>
                        <p className="mt-1 text-sm text-amber-700">
                          Swapped times would overlap with: {conflicts.map((c) => c.client_name ?? "—").join(", ")}
                        </p>
                      </div>
                    )}

                    {panelError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {panelError}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={applyLoading}
                        onClick={handleApplySwap}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                      >
                        {applyLoading ? "Applying…" : "Apply swap"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSuggestion(null)}
                        className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg ring-2 ring-slate-200/80">
          <span className="text-sm text-slate-700">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={toast.undo}
              className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Visit detail modal */}
      {selectedVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setSelectedVisit(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Visit details</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Client</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{selectedVisit.client_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Carer(s)</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {(() => {
                    if (selectedVisit.assignments?.length) {
                      return selectedVisit.assignments.map((a) => a.carer_name ?? "—").join(", ");
                    }
                    const ids = Array.isArray(selectedVisit.carer_ids) && selectedVisit.carer_ids.length > 0
                      ? selectedVisit.carer_ids
                      : selectedVisit.carer_id ? [selectedVisit.carer_id] : [];
                    const carerNames = Object.fromEntries(carers.map((c) => [c.id, c.name ?? "—"]));
                    const names = ids.map((id) => carerNames[id] ?? "—").filter((n) => n !== "—");
                    return names.length > 0 ? names.join(", ") : selectedVisit.carer_name ?? "—";
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Time</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {formatTime(selectedVisit.start_time)} – {formatTime(selectedVisit.end_time)}
                  <span className="ml-1 text-slate-500">
                    · {new Date(selectedVisit.start_time).toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${getStatusBadge(selectedVisit.status)}`}>
                    {selectedVisit.status}
                  </span>
                  {selectedVisit.is_joint && (
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Joint
                    </span>
                  )}
                  {(!!selectedVisit.missing_second_carer || (!!selectedVisit.requires_double_up && !selectedVisit.is_joint)) && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Missing 2nd
                    </span>
                  )}
                </dd>
              </div>
              {selectedVisit.notes && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt>
                  <dd className="mt-0.5 text-slate-700">{selectedVisit.notes}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  {(selectedVisit.risk_band || visitRisk[selectedVisit.id]) ? (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${getRiskBandClass(visitRisk[selectedVisit.id]?.risk_band ?? selectedVisit.risk_band ?? "low")}`}>
                      {(visitRisk[selectedVisit.id]?.risk_score ?? selectedVisit.risk_score ?? 0)} – {visitRisk[selectedVisit.id]?.risk_band ?? selectedVisit.risk_band ?? "low"}
                    </span>
                  ) : (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Calculating…</span>
                  )}
                  <button
                    type="button"
                    disabled={riskLoading === selectedVisit.id}
                    onClick={async () => {
                      setRiskLoading(selectedVisit.id);
                      try {
                        const res = await fetch(`/api/visits/${selectedVisit.id}/risk`, { method: "POST" });
                        const data = await res.json();
                        if (res.ok && data.risk_score != null) {
                          setVisitRisk((prev) => ({ ...prev, [selectedVisit.id]: data }));
                          fetchData();
                        }
                      } finally {
                        setRiskLoading(null);
                      }
                    }}
                    className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {riskLoading === selectedVisit.id ? "Recalculating…" : "Recalculate"}
                  </button>
                </dd>
              </div>
              {(() => {
                const factors = visitRisk[selectedVisit.id]?.factors ?? selectedVisit.risk_factors;
                if (!factors || typeof factors !== "object") return null;
                const entries = Object.entries(factors);
                if (entries.length === 0) return null;
                const labels: Record<string, string> = {
                  lateness_rate_14d: "Lateness rate (14d)",
                  travel_minutes: "Travel before visit (min)",
                  visits_today: "Visits today",
                  double_up: "Requires double-up",
                  new_client: "New client",
                  overrun_flag: "Overrun flag (14d)",
                };
                return (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk breakdown</dt>
                    <dd className="mt-2 space-y-1.5">
                      {entries.map(([key, f]) => {
                        const val = (f as { value?: unknown; points?: number }).value;
                        const pts = (f as { value?: unknown; points?: number }).points ?? 0;
                        const label = labels[key] ?? key;
                        const display = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val);
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-slate-600">{label}: {display}</span>
                            <span className="font-medium text-slate-900">+{pts}</span>
                          </div>
                        );
                      })}
                    </dd>
                  </div>
                );
              })()}
            </dl>
            <div className="mt-8 flex gap-3">
              <a
                href="/visits"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Edit in Visits
              </a>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
