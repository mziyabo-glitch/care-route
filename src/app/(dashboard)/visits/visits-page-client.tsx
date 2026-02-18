"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Visit = {
  id: string;
  client_id: string;
  carer_id: string;
  client_name: string | null;
  carer_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type Client = { id: string; name: string | null };
type Carer = { id: string; name: string | null };

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
] as const;

export function VisitsPageClient({
  agencyId,
  initialVisits,
  clients,
  carers,
}: {
  agencyId: string;
  initialVisits: Visit[];
  clients: Client[];
  carers: Carer[];
}) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "missed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-indigo-100 text-indigo-800";
    }
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
    const body = {
      client_id: fd.get("client_id"),
      carer_id: fd.get("carer_id"),
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
    const body = {
      client_id: fd.get("client_id"),
      carer_id: fd.get("carer_id"),
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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
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
          {initialVisits.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">
              No visits yet. Schedule your first visit.
            </li>
          ) : (
            initialVisits.map((v) => (
              <li key={v.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">
                      {v.client_name ?? "Unknown"} → {v.carer_name ?? "Unknown"}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {formatDateTime(v.start_time)} – {formatDateTime(v.end_time)}
                    </div>
                    {v.notes && (
                      <div className="mt-1 text-sm text-gray-600">{v.notes}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={v.status}
                      onChange={(e) => handleStatusChange(v, e.target.value)}
                      disabled={submitting}
                      className={`rounded-full px-2 py-1 text-xs font-medium outline-none ring-indigo-500 focus:ring-2 disabled:opacity-60 ${getStatusBadgeClass(v.status)}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setEditVisit(v);
                      }}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-60"
                      disabled={submitting}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setDeleteVisit(v);
                      }}
                      className="text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-60"
                      disabled={submitting}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">Add visit</h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Client *
                </label>
                <select
                  name="client_id"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
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
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Carer *
                </label>
                <select
                  name="carer_id"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                >
                  <option value="">Select carer</option>
                  {carers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Start *
                </label>
                <input
                  name="start_time"
                  type="datetime-local"
                  required
                  defaultValue={defaultStart.toISOString().slice(0, 16)}
                  className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 ${
                    isConflictError
                      ? "border-red-500 ring-red-500 focus:ring-red-500"
                      : "border-gray-300 ring-indigo-500 focus:ring-indigo-500"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  End *
                </label>
                <input
                  name="end_time"
                  type="datetime-local"
                  required
                  defaultValue={defaultEnd.toISOString().slice(0, 16)}
                  className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 ${
                    isConflictError
                      ? "border-red-500 ring-red-500 focus:ring-red-500"
                      : "border-gray-300 ring-indigo-500 focus:ring-indigo-500"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  name="status"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                  placeholder="Optional notes"
                />
              </div>
              {error ? (
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    isConflictError
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {isConflictError
                    ? "⚠ Carer already has a visit during this time."
                    : error}
                </div>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setEditVisit(null);
            setError("");
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">Edit visit</h2>
            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Client *
                </label>
                <select
                  name="client_id"
                  required
                  defaultValue={editVisit.client_id}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Carer *
                </label>
                <select
                  name="carer_id"
                  required
                  defaultValue={editVisit.carer_id}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                >
                  {carers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Start *
                </label>
                <input
                  name="start_time"
                  type="datetime-local"
                  required
                  defaultValue={toLocalDatetimeLocal(editVisit.start_time)}
                  className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 ${
                    isEditConflictError
                      ? "border-red-500 ring-red-500 focus:ring-red-500"
                      : "border-gray-300 ring-indigo-500 focus:ring-indigo-500"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  End *
                </label>
                <input
                  name="end_time"
                  type="datetime-local"
                  required
                  defaultValue={toLocalDatetimeLocal(editVisit.end_time)}
                  className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 ${
                    isEditConflictError
                      ? "border-red-500 ring-red-500 focus:ring-red-500"
                      : "border-gray-300 ring-indigo-500 focus:ring-indigo-500"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={editVisit.status}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editVisit.notes ?? ""}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
                  placeholder="Optional notes"
                />
              </div>
              {error ? (
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    isEditConflictError
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {isEditConflictError
                    ? "⚠ Carer already has a visit during this time."
                    : error}
                </div>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditVisit(null);
                    setError("");
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setDeleteVisit(null);
            setError("");
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Delete visit?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently remove the visit for {deleteVisit.client_name} with {deleteVisit.carer_name}.
            </p>
            {error ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {submitting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteVisit(null);
                  setError("");
                }}
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
