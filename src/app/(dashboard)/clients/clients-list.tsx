"use client";

import { useState } from "react";
import { CreateClientModal } from "./create-client-modal";

type Client = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export function ClientsList({
  agencyId,
  clients,
}: {
  agencyId: string;
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
            Add client
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
                {(c.email || c.phone) && (
                  <div className="mt-1 text-sm text-gray-500">
                    {[c.email, c.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
      {showModal && (
        <CreateClientModal
          agencyId={agencyId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
