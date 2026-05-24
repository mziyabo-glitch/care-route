"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ComplianceMissingNote,
  ComplianceMissedVisit,
} from "@/lib/compliance-data";
import { defaultComplianceDateRange } from "@/lib/compliance-data";
import { formatUkTime } from "@/lib/visit-map";

type ApiResponse = {
  start: string;
  end: string;
  missed_visits: ComplianceMissedVisit[];
  missing_notes: ComplianceMissingNote[];
  error?: string;
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function CompliancePageClient({
  initialStart,
  initialEnd,
}: {
  initialStart: string;
  initialEnd: string;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: s, end: e });
      const res = await fetch(`/api/compliance?${params}`);
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(json.error ?? "Failed to load compliance data");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Failed to load compliance data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(start, end);
  }, [start, end, load]);

  const missed = data?.missed_visits ?? [];
  const missingNotes = data?.missing_notes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm font-medium text-slate-700">
          From
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          To
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const { start: s, end: e } = defaultComplianceDateRange();
            setStart(s);
            setEnd(e);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Last 7 days
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {loading && !error && (
        <p className="text-sm text-slate-500">Loading compliance data…</p>
      )}

      {!loading && !error && (
        <>
          <ComplianceSection
            title="Missed visits"
            count={missed.length}
            emptyMessage="No missed visits in this date range."
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Carer</th>
                    <th className="px-4 py-2 font-medium">Scheduled</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {missed.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
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
                      <td className="px-4 py-2 text-right">
                        <VisitLink />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ComplianceSection>

          <ComplianceSection
            title="Missing care notes"
            count={missingNotes.length}
            emptyMessage="No visits missing care notes in this date range."
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Visit time</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {missingNotes.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {v.client_name}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {formatUkTime(v.start_time)}
                      </td>
                      <td className="px-4 py-2 capitalize text-slate-700">
                        {statusLabel(v.status)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <VisitLink label="Care notes" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ComplianceSection>
        </>
      )}
    </div>
  );
}

function ComplianceSection({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">
        {title}
        <span className="ml-2 text-base font-normal text-slate-500">
          ({count})
        </span>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function VisitLink({ label = "View visit" }: { label?: string }) {
  return (
    <Link
      href="/visits"
      className="text-sm font-medium text-blue-600 hover:text-blue-800"
    >
      {label}
    </Link>
  );
}
