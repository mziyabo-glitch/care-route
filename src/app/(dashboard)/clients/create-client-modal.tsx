"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientAction } from "./actions";

export function CreateClientModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "pending" | "ok" | "failed">("idle");

  async function handleSubmit(formData: FormData) {
    setError("");
    setGeocodeStatus("idle");
    const result = await createClientAction(formData);
    if (result.error) {
      setError(result.error);
      return;
    }

    // Geocode postcode in background after successful save
    if (result.clientId && result.postcode) {
      setGeocodeStatus("pending");
      try {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: result.clientId,
            postcode: result.postcode,
          }),
        });
        const data = await res.json();
        setGeocodeStatus(data.ok ? "ok" : "failed");
      } catch {
        setGeocodeStatus("failed");
      }
    }

    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Add Client</h2>
        <form action={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="client-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Name *
            </label>
            <input
              id="client-name"
              name="name"
              type="text"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
              placeholder="Full name"
            />
          </div>
          <div>
            <label
              htmlFor="client-address"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Address
            </label>
            <input
              id="client-address"
              name="address"
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
              placeholder="Street address"
            />
          </div>
          <div>
            <label
              htmlFor="client-postcode"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Postcode
            </label>
            <input
              id="client-postcode"
              name="postcode"
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
              placeholder="Postcode"
            />
          </div>
          <div>
            <label
              htmlFor="client-notes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Notes
            </label>
            <textarea
              id="client-notes"
              name="notes"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 focus:ring-2"
              placeholder="Optional notes"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
            <input
              type="checkbox"
              id="client-double-up"
              name="requires_double_up"
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="client-double-up" className="text-sm font-semibold text-amber-900">
              ⚠ Requires double-up (2 carers per visit)
            </label>
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
