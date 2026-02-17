"use client";

import { useState } from "react";
import { CreateVisitModal } from "./create-visit-modal";

type Visit = {
  id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  client_id: string;
  carer_id: string;
};

type Client = { id: string; name: string | null };
type Carer = { id: string; name: string | null };

export function VisitsList({
  agencyId,
  visits,
  clients,
  carers,
}: {
  agencyId: string;
  visits: Visit[];
  clients: Client[];
  carers: Carer[];
}) {
  const [showModal, setShowModal] = useState(false);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            disabled={clients.length === 0 || carers.length === 0}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add visit
          </button>
          {(clients.length === 0 || carers.length === 0) && (
            <p className="mt-2 text-sm text-gray-500">
              Add at least one client and one carer first.
            </p>
          )}
        </div>
        <ul className="divide-y divide-gray-200">
          {visits.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">
              No visits yet. Schedule your first visit.
            </li>
          ) : (
            visits.map((v) => (
              <li key={v.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900">
                      {clients.find((c) => c.id === v.client_id)?.name ?? "Unknown"} →{" "}
                      {carers.find((c) => c.id === v.carer_id)?.name ?? "Unknown"}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {formatDateTime(v.scheduled_at)}
                    </div>
                    {v.notes && (
                      <div className="mt-1 text-sm text-gray-600">{v.notes}</div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      v.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : v.status === "cancelled"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {v.status}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
      {showModal && (
        <CreateVisitModal
          agencyId={agencyId}
          clients={clients}
          carers={carers}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
