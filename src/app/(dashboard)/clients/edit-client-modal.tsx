"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Client = {
  id: string;
  name: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  requires_double_up?: boolean;
  funding_type?: string;
};

export function EditClientModal({
  client,
  onClose,
}: {
  client: Client;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(client.name ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [postcode, setPostcode] = useState(client.postcode ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [requiresDoubleUp, setRequiresDoubleUp] = useState(client.requires_double_up ?? false);
  const [fundingType, setFundingType] = useState(client.funding_type ?? "private");

  useEffect(() => {
    setName(client.name ?? "");
    setAddress(client.address ?? "");
    setPostcode(client.postcode ?? "");
    setNotes(client.notes ?? "");
    setRequiresDoubleUp(client.requires_double_up ?? false);
    setFundingType(client.funding_type ?? "private");
  }, [client]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address: address || null,
          postcode: postcode || null,
          notes: notes || null,
          requires_double_up: requiresDoubleUp,
          funding_type: fundingType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        setSubmitting(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Edit Client</h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium text-slate-700">Name *</label>
            <input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
              placeholder="Full name"
            />
          </div>
          <div>
            <label htmlFor="edit-address" className="mb-1.5 block text-sm font-medium text-slate-700">Address</label>
            <input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} type="text" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2" placeholder="Street address" />
          </div>
          <div>
            <label htmlFor="edit-postcode" className="mb-1.5 block text-sm font-medium text-slate-700">Postcode</label>
            <input id="edit-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} type="text" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2" placeholder="Postcode" />
          </div>
          <div>
            <label htmlFor="edit-funding" className="mb-1.5 block text-sm font-medium text-slate-700">Funding type</label>
            <select
              id="edit-funding"
              value={fundingType}
              onChange={(e) => setFundingType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
            >
              <option value="private">Private</option>
              <option value="local_authority">Local Authority</option>
            </select>
          </div>
          <div>
            <label htmlFor="edit-notes" className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2" placeholder="Optional notes" />
          </div>
          <div className="flex items-center gap-2 rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4">
            <input
              type="checkbox"
              id="edit-double-up"
              checked={requiresDoubleUp}
              onChange={(e) => setRequiresDoubleUp(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="edit-double-up" className="text-sm font-semibold text-amber-900">
              Requires double-up (2 carers per visit)
            </label>
          </div>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60">
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
