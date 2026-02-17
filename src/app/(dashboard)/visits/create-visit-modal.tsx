"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVisitAction } from "./actions";

type Client = { id: string; name: string | null };
type Carer = { id: string; name: string | null };

export function CreateVisitModal({
  agencyId,
  clients,
  carers,
  onClose,
}: {
  agencyId: string;
  clients: Client[];
  carers: Carer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setError("");
    const result = await createVisitAction(agencyId, formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const defaultDate = new Date().toISOString().slice(0, 16);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Add visit</h2>
        <form action={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="visit-client"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Client *
            </label>
            <select
              id="visit-client"
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
            <label
              htmlFor="visit-carer"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Carer *
            </label>
            <select
              id="visit-carer"
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
            <label
              htmlFor="visit-scheduled"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Date & time *
            </label>
            <input
              id="visit-scheduled"
              name="scheduled_at"
              type="datetime-local"
              required
              defaultValue={defaultDate}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="visit-notes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Notes
            </label>
            <textarea
              id="visit-notes"
              name="notes"
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
              placeholder="Optional notes"
            />
          </div>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Create
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
