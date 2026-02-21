"use client";

import { useEffect, useState, useCallback } from "react";

type BillingSummaryRow = {
  client_id: string;
  client_name: string | null;
  funder_name: string | null;
  funder_type: string | null;
  total_minutes: number;
  total_care_cost: number;
  total_mileage_cost: number;
  total_cost: number;
  visit_count: number;
};

function getWeekRange(weekStart: Date): { start: string; end: string } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getMonthRange(monthStart: Date): { start: string; end: string } {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(n);
}

export default function BillingSummaryPage() {
  const [rows, setRows] = useState<BillingSummaryRow[]>([]);
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
      const res = await fetch(`/api/billing/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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

  const totals = rows.reduce(
    (acc, r) => ({
      minutes: acc.minutes + (r.total_minutes ?? 0),
      careCost: acc.careCost + (r.total_care_cost ?? 0),
      mileageCost: acc.mileageCost + (r.total_mileage_cost ?? 0),
      totalCost: acc.totalCost + (r.total_cost ?? 0),
      visitCount: acc.visitCount + (r.visit_count ?? 0),
    }),
    { minutes: 0, careCost: 0, mileageCost: 0, totalCost: 0, visitCount: 0 }
  );

  function exportCsv() {
    const headers = ["Client", "Funder", "Visits", "Hours", "Care cost", "Mileage cost", "Total cost"];
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${(r.client_name ?? "").replace(/"/g, '""')}"`,
          `"${(r.funder_name ?? "—").replace(/"/g, '""')}"`,
          r.visit_count,
          (r.total_minutes / 60).toFixed(2),
          r.total_care_cost.toFixed(2),
          r.total_mileage_cost.toFixed(2),
          r.total_cost.toFixed(2),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-summary-${rangeStart.toISOString().slice(0, 10)}.csv`;
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
        <h1 className="text-2xl font-semibold text-slate-900">Billing Summary</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRangeMode("week")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${rangeMode === "week" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setRangeMode("month")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${rangeMode === "month" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
            className="ml-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total hours</h3>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatHours(totals.minutes)}</p>
              <p className="mt-1 text-sm text-slate-500">{totals.visitCount} visits</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Care cost</h3>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totals.careCost)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total cost</h3>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(totals.totalCost)}</p>
              {totals.mileageCost > 0 && (
                <p className="mt-1 text-sm text-slate-500">incl. {formatCurrency(totals.mileageCost)} mileage</p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Funder</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Visits</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Care</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Mileage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                      No billing data for this period
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.client_id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.funder_name ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{r.visit_count}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{formatHours(r.total_minutes)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(r.total_care_cost)}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(r.total_mileage_cost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(r.total_cost)}</td>
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
