"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type BillingRow = {
  visit_id: string;
  client_id: string;
  client_name: string | null;
  funding_type: string;
  start_time: string;
  end_time: string;
  billable_minutes: number;
};

type ClientSummary = {
  client_id: string;
  client_name: string | null;
  funding_type: string;
  billable_minutes: number;
  visit_count: number;
};

type FundingSummary = {
  funding_type: string;
  billable_minutes: number;
  visit_count: number;
};

function getWeekRange(weekStart: Date): { start: string; end: string } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getMonthRange(monthStart: Date): { start: string; end: string } {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function BillingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rangeMode, setRangeMode] = useState<"week" | "month">("week");
  const [rangeStart, setRangeStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const { start, end } = rangeMode === "week" ? getWeekRange(rangeStart) : getMonthRange(rangeStart);
    try {
      const res = await fetch(`/api/billing?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rangeMode, rangeStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group by client
  const byClient = rows.reduce<Record<string, ClientSummary>>((acc, r) => {
    const key = r.client_id;
    if (!acc[key]) {
      acc[key] = {
        client_id: r.client_id,
        client_name: r.client_name,
        funding_type: r.funding_type,
        billable_minutes: 0,
        visit_count: 0,
      };
    }
    acc[key].billable_minutes += r.billable_minutes ?? 0;
    acc[key].visit_count += 1;
    return acc;
  }, {});
  const clientSummaries = Object.values(byClient).sort((a, b) =>
    (a.client_name ?? "").localeCompare(b.client_name ?? "")
  );

  // Summary by funding_type
  const byFunding = rows.reduce<Record<string, FundingSummary>>((acc, r) => {
    const ft = r.funding_type || "private";
    if (!acc[ft]) acc[ft] = { funding_type: ft, billable_minutes: 0, visit_count: 0 };
    acc[ft].billable_minutes += r.billable_minutes ?? 0;
    acc[ft].visit_count += 1;
    return acc;
  }, {});
  const fundingSummaries = Object.values(byFunding);

  function exportCsv() {
    const headers = ["Client", "Funding type", "Visit count", "Billable hours"];
    const lines = [
      headers.join(","),
      ...clientSummaries.map((c) =>
        [
          `"${(c.client_name ?? "").replace(/"/g, '""')}"`,
          c.funding_type,
          c.visit_count,
          (c.billable_minutes / 60).toFixed(2),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-${rangeStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rangeLabel =
    rangeMode === "week"
      ? `${formatDate(rangeStart)} – ${formatDate(new Date(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000))}`
      : `${rangeStart.toLocaleString(undefined, { month: "long" })} ${rangeStart.getFullYear()}`;

  const goPrev = () => {
    const d = new Date(rangeStart);
    if (rangeMode === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setRangeStart(d);
  };

  const goNext = () => {
    const d = new Date(rangeStart);
    if (rangeMode === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setRangeStart(d);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRangeMode("week")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              rangeMode === "week" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setRangeMode("month")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              rangeMode === "month" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            onClick={goPrev}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Prev
          </button>
          <span className="min-w-[220px] text-center text-sm font-medium text-slate-700">{rangeLabel}</span>
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Next →
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="ml-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Loading billing…</p>
        </div>
      ) : (
        <>
          {/* Summary cards by funding type */}
          <div className="grid gap-4 sm:grid-cols-2">
            {fundingSummaries.map((s) => (
              <div
                key={s.funding_type}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {s.funding_type === "local_authority" ? "Local Authority" : "Private"}
                </h3>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatHours(s.billable_minutes)}</p>
                <p className="mt-1 text-sm text-slate-500">{s.visit_count} visit{s.visit_count !== 1 ? "s" : ""}</p>
              </div>
            ))}
            {fundingSummaries.length === 0 && !loading && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No billing data for this period
              </div>
            )}
          </div>

          {/* Table grouped by client */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[500px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Funding type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Visits
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Billable hours
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clientSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                      No visits in this period
                    </td>
                  </tr>
                ) : (
                  clientSummaries.map((c) => (
                    <tr key={c.client_id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.client_name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {c.funding_type === "local_authority" ? "Local Authority" : "Private"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{c.visit_count}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatHours(c.billable_minutes)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
