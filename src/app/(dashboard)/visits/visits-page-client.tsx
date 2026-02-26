"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

function ElapsedTimer({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <>{h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`}</>;
}

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
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  break_minutes?: number | null;
  risk_score?: number | null;
  risk_band?: string | null;
  risk_factors?: RiskFactors | null;
};

type Client = { id: string; name: string | null };
type Carer = { id: string; name: string | null };

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
] as const;

type Adjustment = {
  id: string;
  adjusted_field: string;
  before_value: string | null;
  after_value: string | null;
  reason: string;
  adjusted_at: string;
};

export function VisitsPageClient({
  agencyId,
  initialVisits,
  clients,
  carers,
  userRole,
}: {
  agencyId: string;
  initialVisits: Visit[];
  clients: Client[];
  carers: Carer[];
  userRole?: string | null;
}) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);
  const [adjustVisit, setAdjustVisit] = useState<Visit | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createJoint, setCreateJoint] = useState(false);
  const [editJoint, setEditJoint] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [dateFilter, setDateFilter] = useState("");
  const isManager = userRole === "owner" || userRole === "admin" || userRole === "manager";

  const uniqueDates = useMemo(() => {
    const dates = new Set(
      initialVisits.map((v) => new Date(v.start_time).toLocaleDateString("en-CA"))
    );
    return Array.from(dates).sort().reverse();
  }, [initialVisits]);

  const filteredVisits = useMemo(() => {
    let list = [...initialVisits];
    if (dateFilter) {
      list = list.filter(
        (v) => new Date(v.start_time).toLocaleDateString("en-CA") === dateFilter
      );
    }
    list.sort((a, b) => {
      const diff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return list;
  }, [initialVisits, dateFilter, sortOrder]);

  const groupedByDay = useMemo(() => {
    const groups: { date: string; label: string; visits: Visit[] }[] = [];
    const map = new Map<string, Visit[]>();
    for (const v of filteredVisits) {
      const key = new Date(v.start_time).toLocaleDateString("en-CA");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    for (const [key, visits] of map) {
      const d = new Date(key + "T00:00:00");
      const label = d.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      groups.push({ date: key, label, visits });
    }
    return groups;
  }, [filteredVisits]);

  function toLocalDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getRiskBandClass(band: string) {
    switch (band) {
      case "low": return "bg-emerald-100 text-emerald-700";
      case "medium": return "bg-amber-100 text-amber-700";
      case "high": return "bg-red-100 text-red-700";
      default: return "bg-slate-100 text-slate-600";
    }
  }

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case "in_progress":
        return "bg-emerald-100 text-emerald-700";
      case "completed":
        return "bg-slate-100 text-slate-600";
      case "missed":
        return "bg-red-100 text-red-600";
      default:
        return "bg-blue-50 text-blue-700";
    }
  }

  async function handleCheckIn(visitId: string) {
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/visits/${visitId}/check-in`, { method: "POST" });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "Check-in failed"); return; }
    router.refresh();
  }

  async function handleCheckOut(visitId: string) {
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/visits/${visitId}/check-out`, { method: "POST" });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "Check-out failed"); return; }
    router.refresh();
  }

  async function openAdjustModal(v: Visit) {
    setError("");
    setAdjustVisit(v);
    setAdjustLoading(true);
    const res = await fetch(`/api/visits/${v.id}/adjust`);
    const data = await res.json();
    setAdjustLoading(false);
    setAdjustments(Array.isArray(data.adjustments) ? data.adjustments : []);
  }

  async function handleAdjustSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adjustVisit) return;
    setError("");
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { reason: (fd.get("reason") as string)?.trim() };
    const ci = (fd.get("check_in_at") as string)?.trim();
    const co = (fd.get("check_out_at") as string)?.trim();
    const brk = (fd.get("break_minutes") as string)?.trim();
    if (ci) body.check_in_at = new Date(ci).toISOString();
    if (co) body.check_out_at = new Date(co).toISOString();
    if (brk) body.break_minutes = parseInt(brk, 10);
    const res = await fetch(`/api/visits/${adjustVisit.id}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "Adjustment failed"); return; }
    setAdjustVisit(null);
    router.refresh();
  }

  const isConflictError =
    (error &&
      (error.toLowerCase().includes("overlapping") ||
        error.toLowerCase().includes("visit during this time"))) ??
    false;

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const joint = fd.get("joint_visit") === "on";
    const secondary = (fd.get("secondary_carer_id") as string)?.trim();
    if (joint && (!secondary || secondary === fd.get("primary_carer_id"))) {
      setError(!secondary ? "Please select a second carer for joint visit" : "Secondary carer must be different from primary");
      setSubmitting(false);
      return;
    }
    const body = {
      client_id: fd.get("client_id"),
      primary_carer_id: fd.get("primary_carer_id"),
      secondary_carer_id: joint ? secondary : null,
      start_time: fd.get("start_time"),
      end_time: fd.get("end_time"),
      status: (fd.get("status") as string) || "scheduled",
      notes: (fd.get("notes") as string)?.trim() || null,
    };
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create visit");
      return; // Do not close modal on error
    }
    form.reset();
    setShowCreateModal(false);
    router.refresh();
  }

  async function handleStatusChange(visit: Visit, newStatus: string) {
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/visits/${visit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to update status");
      return;
    }
    router.refresh();
  }

  const isEditConflictError =
    editVisit &&
    error &&
    (error.toLowerCase().includes("overlapping") ||
      error.toLowerCase().includes("visit during this time"));

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editVisit) return;
    setError("");
    setSubmitting(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const joint = fd.get("joint_visit") === "on";
    const secondary = (fd.get("secondary_carer_id") as string)?.trim();
    if (joint && (!secondary || secondary === fd.get("primary_carer_id"))) {
      setError(!secondary ? "Please select a second carer for joint visit" : "Secondary carer must be different from primary");
      setSubmitting(false);
      return;
    }
    const body = {
      client_id: fd.get("client_id"),
      primary_carer_id: fd.get("primary_carer_id"),
      secondary_carer_id: joint ? secondary : null,
      start_time: fd.get("start_time"),
      end_time: fd.get("end_time"),
      status: (fd.get("status") as string) || "scheduled",
      notes: (fd.get("notes") as string) ?? "",
    };
    const res = await fetch(`/api/visits/${editVisit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to update visit");
      return;
    }
    setEditVisit(null);
    router.refresh();
  }

  async function handleDeleteConfirm() {
    if (!deleteVisit) return;
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/visits/${deleteVisit.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to delete visit");
      return;
    }
    setDeleteVisit(null);
    router.refresh();
  }

  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={clients.length === 0 || carers.length === 0}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add visit
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-blue-600 focus:ring-2"
            >
              <option value="">All dates</option>
              {uniqueDates.map((d) => {
                const dt = new Date(d + "T00:00:00");
                return (
                  <option key={d} value={d}>
                    {dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {sortOrder === "newest" ? "↓ Newest" : "↑ Oldest"}
            </button>
          </div>
          {(clients.length === 0 || carers.length === 0) && (
            <p className="w-full text-sm text-slate-500">
              Add at least one client and one carer first.
            </p>
          )}
        </div>
        {error ? (
          <div className="border-b border-red-200 bg-red-50/50 px-6 py-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="mt-2 text-xs font-medium text-red-600 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {filteredVisits.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            {initialVisits.length === 0
              ? "No visits yet. Schedule your first visit."
              : "No visits match the selected date."}
          </div>
        ) : (
          <div>
            {groupedByDay.map((group) => (
              <div key={group.date}>
                <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 px-6 py-3 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {group.label}
                    <span className="ml-2 font-normal text-slate-400">({group.visits.length})</span>
                  </h3>
                </div>
                <ul className="divide-y divide-slate-200">
                  {group.visits.map((v) => {
                    const isJoint = !!v.is_joint || (Array.isArray(v.carer_ids) && v.carer_ids.length >= 2) || ((v.assignments?.length ?? 0) >= 2);
                    const missingSecond = !!v.missing_second_carer || (!!v.requires_double_up && !isJoint);
                    const allClear = !missingSecond && v.status !== "missed";
                    return (
                    <li
                      key={v.id}
                      className={`flex items-start gap-4 px-6 py-4 ${missingSecond ? "border-l-[3px] border-l-red-500 bg-red-50/20" : ""}`}
                    >
                      <div className="mt-1.5 shrink-0">
                        {missingSecond ? (
                          <span className="block h-2 w-2 rounded-full bg-red-500" />
                        ) : v.status === "completed" ? (
                          <span className="block h-2 w-2 rounded-full bg-slate-300" />
                        ) : allClear ? (
                          <span className="block h-2 w-2 rounded-full bg-green-500" />
                        ) : (
                          <span className="block h-2 w-2 rounded-full bg-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {v.client_name ?? "Unknown"}
                          </span>
                          <span className="text-slate-300">→</span>
                          <span className="truncate text-sm text-slate-600">
                            {v.assignments?.map((a) => a.carer_name ?? "Unknown").join(" + ") ?? v.carer_name ?? "Unknown"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTime(v.start_time)} – {formatDateTime(v.end_time)}
                        </div>
                        {v.check_in_at && v.check_out_at && (
                          <div className="mt-0.5 text-[10px] text-emerald-600">
                            Actual: {formatDateTime(v.check_in_at)} – {formatDateTime(v.check_out_at)}
                            {(v.break_minutes ?? 0) > 0 && <span className="text-slate-400"> ({v.break_minutes}m break)</span>}
                          </div>
                        )}
                        {v.notes && (
                          <div className="mt-0.5 text-xs text-slate-500">{v.notes}</div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {v.risk_band ? (
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${getRiskBandClass(v.risk_band)}`}>
                              Risk: {v.risk_band}
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Calculating…</span>
                          )}
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeClass(v.status)}`}>
                            {v.status}
                          </span>
                          {missingSecond && (
                            <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                              Missing 2nd
                            </span>
                          )}
                          {isJoint && (
                            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              Joint
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {v.status === "scheduled" && (
                          <button
                            type="button"
                            onClick={() => handleCheckIn(v.id)}
                            disabled={submitting}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                          >
                            Check In
                          </button>
                        )}
                        {v.status === "in_progress" && (
                          <>
                            {v.check_in_at && (
                              <span className="text-[10px] text-emerald-600 font-medium tabular-nums">
                                <ElapsedTimer since={v.check_in_at} />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCheckOut(v.id)}
                              disabled={submitting}
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
                            >
                              Check Out
                            </button>
                          </>
                        )}
                        {missingSecond && (
                          <button
                            type="button"
                            onClick={() => { setError(""); setEditVisit(v); setEditJoint(true); }}
                            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-[10px] font-medium text-white transition hover:bg-red-500"
                          >
                            + Assign 2nd
                          </button>
                        )}
                        <select
                          value={v.status}
                          onChange={(e) => handleStatusChange(v, e.target.value)}
                          disabled={submitting}
                          className={`rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium outline-none ring-blue-600 focus:ring-2 disabled:opacity-60 ${getStatusBadgeClass(v.status)}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setError(""); setEditVisit(v); setEditJoint(!!v.is_joint); }}
                          className="text-xs font-medium text-blue-600 transition hover:text-blue-500 disabled:opacity-60"
                          disabled={submitting}
                        >
                          Edit
                        </button>
                        {isManager && (v.status === "completed" || v.status === "in_progress") && (
                          <button
                            type="button"
                            onClick={() => openAdjustModal(v)}
                            className="text-xs font-medium text-violet-600 transition hover:text-violet-500 disabled:opacity-60"
                            disabled={submitting}
                          >
                            Adjust
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setError(""); setDeleteVisit(v); }}
                          className="text-xs font-medium text-red-600 transition hover:text-red-500 disabled:opacity-60"
                          disabled={submitting}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setShowCreateModal(false); setCreateJoint(false); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Add visit</h2>
            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Client *
                </label>
                <select
                  name="client_id"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Primary carer *
                </label>
                <select
                  name="primary_carer_id"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  <option value="">Select carer</option>
                  {carers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className={`rounded-xl border-2 p-4 transition-colors ${
                  createJoint ? "border-blue-200 bg-blue-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="create-joint"
                    name="joint_visit"
                    checked={createJoint}
                    onChange={(e) => setCreateJoint(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="create-joint" className="text-sm font-semibold text-slate-900">
                    Joint visit (2 carers)
                  </label>
                </div>
                {createJoint && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Second carer *
                    </label>
                    <select
                      name="secondary_carer_id"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                    >
                      <option value="">Select second carer</option>
                      {carers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ?? "Unnamed"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Start *</label>
                <input
                  name="start_time"
                  type="datetime-local"
                  required
                  defaultValue={defaultStart.toISOString().slice(0, 16)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 ${
                    isConflictError ? "border-red-500 ring-red-500 focus:ring-red-500" : "border-slate-200 ring-blue-600 focus:ring-blue-600"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">End *</label>
                <input
                  name="end_time"
                  type="datetime-local"
                  required
                  defaultValue={defaultEnd.toISOString().slice(0, 16)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 ${
                    isConflictError ? "border-red-500 ring-red-500 focus:ring-red-500" : "border-slate-200 ring-blue-600 focus:ring-blue-600"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
                <select
                  name="status"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                  placeholder="Optional notes"
                />
              </div>
              {error ? (
                <div className={`rounded-xl px-4 py-3 text-sm ${isConflictError ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
                  {isConflictError ? "Carer already has a visit during this time." : error}
                </div>
              ) : null}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  {submitting ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateJoint(false); }}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setEditVisit(null); setError(""); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Edit visit</h2>
            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Client *</label>
                <select
                  name="client_id"
                  required
                  defaultValue={editVisit.client_id}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Primary carer *</label>
                <select
                  name="primary_carer_id"
                  required
                  defaultValue={editVisit.carer_ids?.[0] ?? editVisit.carer_id}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  {carers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name ?? "Unnamed"}</option>
                  ))}
                </select>
              </div>
              <div className={`rounded-xl border-2 p-4 transition-colors ${editJoint ? "border-blue-200 bg-blue-50/50" : "border-slate-200"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-joint"
                    name="joint_visit"
                    checked={editJoint}
                    onChange={(e) => setEditJoint(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="edit-joint" className="text-sm font-semibold text-slate-900">Joint visit (2 carers)</label>
                </div>
                {editJoint && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Second carer *</label>
                    <select
                      name="secondary_carer_id"
                      required
                      defaultValue={editVisit.carer_ids?.[1] ?? ""}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                    >
                      <option value="">Select second carer</option>
                      {carers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ?? "Unnamed"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Start *</label>
                <input
                  name="start_time"
                  type="datetime-local"
                  required
                  defaultValue={toLocalDatetimeLocal(editVisit.start_time)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 ${
                    isEditConflictError ? "border-red-500 ring-red-500 focus:ring-red-500" : "border-slate-200 ring-blue-600 focus:ring-blue-600"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">End *</label>
                <input
                  name="end_time"
                  type="datetime-local"
                  required
                  defaultValue={toLocalDatetimeLocal(editVisit.end_time)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 ${
                    isEditConflictError ? "border-red-500 ring-red-500 focus:ring-red-500" : "border-slate-200 ring-blue-600 focus:ring-blue-600"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
                <select
                  name="status"
                  defaultValue={editVisit.status}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editVisit.notes ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                  placeholder="Optional notes"
                />
              </div>
              {editVisit.risk_factors && Object.keys(editVisit.risk_factors).length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk breakdown</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {Object.entries(editVisit.risk_factors).map(([key, f]) => {
                      const labels: Record<string, string> = {
                        lateness_rate_14d: "Lateness rate (14d)",
                        travel_minutes: "Travel before visit (min)",
                        visits_today: "Visits today",
                        double_up: "Requires double-up",
                        new_client: "New client",
                        overrun_flag: "Overrun flag (14d)",
                      };
                      const val = f.value;
                      const display = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val);
                      return (
                        <li key={key} className="flex justify-between">
                          <span className="text-slate-600">{labels[key] ?? key}: {display}</span>
                          <span className="font-medium text-slate-900">+{f.points}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {error ? (
                <div className={`rounded-xl px-4 py-3 text-sm ${isEditConflictError ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
                  {isEditConflictError ? "Carer already has a visit during this time." : error}
                </div>
              ) : null}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60">
                  {submitting ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => { setEditVisit(null); setError(""); }} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setDeleteVisit(null); setError(""); }}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Delete visit?</h2>
            <p className="mt-2 text-sm text-slate-600">This will permanently remove the visit for {deleteVisit.client_name} with {deleteVisit.carer_name}.</p>
            {error ? <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={handleDeleteConfirm} disabled={submitting} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60">
                {submitting ? "Deleting…" : "Delete"}
              </button>
              <button type="button" onClick={() => { setDeleteVisit(null); setError(""); }} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust visit modal */}
      {adjustVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setAdjustVisit(null); setError(""); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Adjust Visit Times</h2>
            <p className="mt-1 text-sm text-slate-500">{adjustVisit.client_name} — {adjustVisit.carer_name}</p>

            {/* Scheduled vs Actual comparison */}
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Scheduled</p>
                <p className="mt-1 text-sm text-slate-900">{formatDateTime(adjustVisit.start_time)}</p>
                <p className="text-sm text-slate-900">{formatDateTime(adjustVisit.end_time)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actual</p>
                {adjustVisit.check_in_at ? (
                  <>
                    <p className="mt-1 text-sm text-emerald-700">{formatDateTime(adjustVisit.check_in_at)}</p>
                    <p className="text-sm text-emerald-700">{adjustVisit.check_out_at ? formatDateTime(adjustVisit.check_out_at) : "—"}</p>
                    {(adjustVisit.break_minutes ?? 0) > 0 && <p className="text-xs text-slate-500">{adjustVisit.break_minutes}m break</p>}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">No actuals recorded</p>
                )}
              </div>
              {adjustVisit.check_in_at && adjustVisit.check_out_at && (
                <div className="col-span-2 border-t border-slate-200 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Variance</p>
                  {(() => {
                    const schedMins = (new Date(adjustVisit.end_time).getTime() - new Date(adjustVisit.start_time).getTime()) / 60000;
                    const actMins = (new Date(adjustVisit.check_out_at!).getTime() - new Date(adjustVisit.check_in_at!).getTime()) / 60000 - (adjustVisit.break_minutes ?? 0);
                    const diff = Math.round(actMins - schedMins);
                    return (
                      <p className={`text-sm font-medium ${diff > 0 ? "text-amber-600" : diff < 0 ? "text-red-600" : "text-slate-600"}`}>
                        {diff > 0 ? "+" : ""}{diff} minutes
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Adjust form */}
            <form onSubmit={handleAdjustSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Check-in time</label>
                  <input
                    name="check_in_at" type="datetime-local"
                    defaultValue={adjustVisit.check_in_at ? toLocalDatetimeLocal(adjustVisit.check_in_at) : ""}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Check-out time</label>
                  <input
                    name="check_out_at" type="datetime-local"
                    defaultValue={adjustVisit.check_out_at ? toLocalDatetimeLocal(adjustVisit.check_out_at) : ""}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Break (minutes)</label>
                <input
                  name="break_minutes" type="number" min="0"
                  defaultValue={adjustVisit.break_minutes ?? 0}
                  className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reason *</label>
                <textarea
                  name="reason" required rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
                  placeholder="Required — explain why this adjustment is being made"
                />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60">
                  {submitting ? "Saving…" : "Save Adjustment"}
                </button>
                <button type="button" onClick={() => { setAdjustVisit(null); setError(""); }} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>

            {/* Adjustment history */}
            {adjustLoading ? (
              <p className="mt-6 text-sm text-slate-500">Loading history…</p>
            ) : adjustments.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adjustment History</h3>
                <div className="mt-3 space-y-3">
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="border-l-2 border-violet-200 pl-3">
                      <p className="text-xs font-medium text-slate-900">
                        {adj.adjusted_field.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {adj.before_value ?? "—"} → {adj.after_value ?? "—"}
                      </p>
                      <p className="text-[10px] text-slate-600 italic">{adj.reason}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(adj.adjusted_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
