"use client";

import { useState } from "react";
import { CreateClientModal } from "./create-client-modal";

type Client = {
  id: string;
  name: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
};

export function ClientsList({
  clients,
}: {
  clients: Client[];
}) {
  const [showModal, setShowModal] = useState(false);

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
        <ul className="divide-y divide-gray-200">
          {clients.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">
              No clients yet. Add your first client.
            </li>
          ) : (
            clients.map((c) => (
              <li key={c.id} className="px-4 py-4">
                <div className="font-medium text-gray-900">{c.name}</div>
                {(c.address || c.postcode) && (
                  <div className="mt-1 text-sm text-gray-500">
                    {[c.address, c.postcode].filter(Boolean).join(", ")}
                  </div>
                )}
                {c.notes && (
                  <div className="mt-1 text-sm text-gray-600">{c.notes}</div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
      {showModal && (
        <CreateClientModal
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
