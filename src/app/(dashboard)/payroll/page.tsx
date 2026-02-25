"use client";

import { useState, useEffect, useCallback } from "react";

type Timesheet = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  approved_at: string | null;
  exported_at: string | null;
  line_count: number;
  total_minutes: number;
};

type TimesheetLine = {
  id: string;
  carer_id: string;
  carer_name: string;
  payroll_number: string | null;
  total_minutes: number;
  total_hours: number;
};

type TimesheetDetail = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  lines: TimesheetLine[];
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function statusBadge(status: string) {
  switch (status) {
    case "draft": return "bg-amber-100 text-amber-700";
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "exported": return "bg-blue-100 text-blue-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

export default function PayrollPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [generating, setGenerating] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [detail, setDetail] = useState<TimesheetDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState("");

  function getErrorMessage(data: unknown, fallback: string) {
    if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
    return fallback;
  }

  const loadTimesheets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payroll");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = getErrorMessage(data, "Failed to load payroll");
        setError(message);
        setToast(message);
        return;
      }
      const next = data && typeof data === "object" && "timesheets" in data ? (data as { timesheets?: unknown }).timesheets : [];
      setTimesheets(Array.isArray(next) ? (next as Timesheet[]) : []);
    } catch {
      const message = "Failed to load payroll";
      setError(message);
      setToast(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTimesheets(); }, [loadTimesheets]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!periodStart || !periodEnd) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = getErrorMessage(data, "Failed to generate");
        setError(message);
        setToast(message);
        return;
      }
      await loadTimesheets();
      if (data && typeof data === "object" && "id" in data && typeof (data as { id?: unknown }).id === "string") {
        loadDetail((data as { id: string }).id);
      }
    } catch {
      const message = "Failed to generate";
      setError(message);
      setToast(message);
    } finally {
      setGenerating(false);
    }
  }

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/payroll/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = getErrorMessage(data, "Failed to load detail");
        setError(message);
        setToast(message);
        return;
      }
      if (data && typeof data === "object" && "id" in data) {
        setDetail(data as TimesheetDetail);
      } else {
        setError("Failed to load detail");
      }
    } catch {
      const message = "Failed to load detail";
      setError(message);
      setToast(message);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleApprove(id: string) {
    setError("");
    setActionLoading(id);
    try {
      const res = await fetch(`/api/payroll/${id}/approve`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = getErrorMessage(data, "Failed to approve");
        setError(message);
        setToast(message);
        return;
      }
      await loadTimesheets();
      if (detail?.id === id) loadDetail(id);
    } catch {
      const message = "Failed to approve";
      setError(message);
      setToast(message);
    } finally {
      setActionLoading("");
    }
  }

  function handleExport(id: string) {
    window.open(`/api/payroll/${id}/export`, "_blank");
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Payroll</h1>
        {loading && <span className="text-xs text-slate-500">Loading…</span>}
      </div>

      {/* Generate */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Generate Timesheet</h2>
        <form onSubmit={handleGenerate} className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Period start</label>
            <input
              type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
              required className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Period end</label>
            <input
              type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
              required className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-600 focus:ring-2"
            />
          </div>
          <button
            type="submit" disabled={generating || !periodStart || !periodEnd}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={loadTimesheets}
            className="ml-3 text-xs font-medium underline"
          >
            Retry
          </button>
          <button onClick={() => setError("")} className="ml-3 text-xs font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Timesheets list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Timesheets</h2>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Loading…</div>
        ) : timesheets.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">No timesheets yet. Generate one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="px-6 py-3">Period</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Carers</th>
                <th className="px-6 py-3 text-right">Total Hours</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timesheets.map((ts) => (
                <tr key={ts.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {formatDate(ts.period_start)} – {formatDate(ts.period_end)}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusBadge(ts.status)}`}>
                      {ts.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-700">{ts.line_count}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                    {(ts.total_minutes / 60).toFixed(1)}h
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => loadDetail(ts.id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-500"
                      >
                        Review
                      </button>
                      {ts.status === "draft" && (
                        <button
                          onClick={() => handleApprove(ts.id)}
                          disabled={actionLoading === ts.id}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {(ts.status === "approved" || ts.status === "exported") && (
                        <button
                          onClick={() => handleExport(ts.id)}
                          className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                        >
                          Export CSV
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {loadingDetail && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          Loading timesheet detail…
        </div>
      )}
      {detail && !loadingDetail && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {formatDate(detail.period_start)} – {formatDate(detail.period_end)}
              </h2>
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusBadge(detail.status)}`}>
                {detail.status}
              </span>
            </div>
            <button onClick={() => setDetail(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
          </div>
          {detail.lines.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">No lines found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                  <th className="px-6 py-3">Carer</th>
                  <th className="px-6 py-3">Payroll #</th>
                  <th className="px-6 py-3 text-right">Minutes</th>
                  <th className="px-6 py-3 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-6 py-3 font-medium text-slate-900">{line.carer_name}</td>
                    <td className="px-6 py-3 text-slate-500">{line.payroll_number ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-700">{line.total_minutes}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-700">{Number(line.total_hours).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <span className="text-sm text-slate-700">{toast}</span>
          <button
            type="button"
            onClick={() => setToast("")}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
