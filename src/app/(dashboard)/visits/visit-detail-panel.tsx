"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VisitAuditBadges } from "@/components/audit-badges";
import { formatDurationMinutes } from "@/lib/visit-audit";
import type { VisitAuditBadgeFlags } from "@/components/audit-badges";

type VisitRef = {
  id: string;
  client_id: string;
  client_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  break_minutes?: number | null;
};

type OperationalPayload = {
  scheduled: {
    start_time: string;
    end_time: string;
    duration_minutes: number;
  };
  actual: {
    check_in_at: string | null;
    check_out_at: string | null;
    break_minutes: number | null;
    duration_minutes: number | null;
  };
  flags: VisitAuditBadgeFlags;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function VisitDetailPanel({
  visit,
  onClose,
  onOpenNotes,
}: {
  visit: VisitRef | null;
  onClose: () => void;
  onOpenNotes: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ops, setOps] = useState<OperationalPayload | null>(null);

  const load = useCallback(async () => {
    if (!visit) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/visits/${visit.id}/operational`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load");
        setOps(null);
        return;
      }
      setOps({
        scheduled: data.scheduled,
        actual: data.actual,
        flags: data.flags ?? {},
      });
    } catch {
      setError("Failed to load visit details");
      setOps(null);
    } finally {
      setLoading(false);
    }
  }, [visit]);

  useEffect(() => {
    if (!visit) {
      setOps(null);
      setError("");
      return;
    }
    void load();
  }, [visit, load]);

  if (!visit) return null;

  const carePlanHref = `/clients/${visit.client_id}/care-plan`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Visit details</h2>
              <p className="mt-0.5 text-sm text-slate-600">{visit.client_name ?? "Client"}</p>
            </div>
            <Link
              href={carePlanHref}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
            >
              View care plan
            </Link>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading timeline…</p>
          ) : (
            <>
              {ops ? (
                <VisitAuditBadges flags={ops.flags} />
              ) : null}

              <section className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Timeline
                </h3>
                <dl className="mt-2 space-y-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Scheduled</dt>
                    <dd className="text-slate-900">
                      {formatDateTime(visit.start_time)} – {formatDateTime(visit.end_time)}
                      {ops ? (
                        <span className="ml-1 text-slate-500">
                          ({formatDurationMinutes(ops.scheduled.duration_minutes)} planned)
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Actual</dt>
                    <dd className="text-slate-900">
                      {ops?.actual.check_in_at ? (
                        <>
                          {formatDateTime(ops.actual.check_in_at)}
                          {ops.actual.check_out_at
                            ? ` – ${formatDateTime(ops.actual.check_out_at)}`
                            : " (in progress)"}
                          {ops.actual.duration_minutes != null ? (
                            <span className="ml-1 text-slate-500">
                              ({formatDurationMinutes(ops.actual.duration_minutes)} worked)
                            </span>
                          ) : null}
                          {(ops.actual.break_minutes ?? 0) > 0 ? (
                            <span className="block text-xs text-slate-500">
                              Break: {ops.actual.break_minutes} min
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-500">No check-in recorded</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="capitalize text-slate-900">{visit.status.replace(/_/g, " ")}</dd>
                  </div>
                </dl>
              </section>

              {ops?.flags.missingNotes ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This visit has no care notes. Add a note for compliance.
                </p>
              ) : null}
              {ops?.flags.gpsMismatch ? (
                <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  Check-in GPS is far from the client address (over 500 m).
                </p>
              ) : null}
            </>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onOpenNotes}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Care notes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
