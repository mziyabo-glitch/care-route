"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateClientModal } from "./create-client-modal";

type Client = {
  id: string;
  name: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  requires_double_up?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export function ClientsList({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [archiveClient, setArchiveClient] = useState<Client | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleArchiveConfirm() {
    if (!archiveClient) return;
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/clients/${archiveClient.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to archive client");
      return;
    }
    setArchiveClient(null);
    router.refresh();
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Add Client
          </button>
        </div>
        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="mt-1 text-xs font-medium text-red-600 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <ul className="divide-y divide-gray-200">
          {clients.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">
              No clients yet. Add your first client.
            </li>
          ) : (
            clients.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    {c.name}
                    {c.requires_double_up && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        ⚠ Double-up
                      </span>
                    )}
                    {c.postcode && c.latitude != null && c.longitude != null && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        Geocoded
                      </span>
                    )}
                    {c.postcode && (c.latitude == null || c.longitude == null) && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        Not geocoded
                      </span>
                    )}
                  </div>
                  {(c.address || c.postcode) && (
                    <div className="mt-1 text-sm text-gray-500">
                      {[c.address, c.postcode].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {c.notes && (
                    <div className="mt-1 text-sm text-gray-600">{c.notes}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setArchiveClient(c);
                  }}
                  className="shrink-0 text-sm font-medium text-red-600 hover:text-red-500"
                >
                  Archive
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
      {showModal && (
        <CreateClientModal onClose={() => setShowModal(false)} />
      )}
      {archiveClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setArchiveClient(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Archive client?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {archiveClient.name} will be archived and will no longer appear
              in active lists. Visit history is preserved.
            </p>
            {error ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleArchiveConfirm}
                disabled={submitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {submitting ? "Archiving..." : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => setArchiveClient(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
