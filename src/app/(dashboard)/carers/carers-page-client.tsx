"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Carer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  active: boolean | null;
};

const ROLE_OPTIONS = ["Carer", "Senior", "Nurse", "Other"];

export function CarersPageClient({
  initialCarers,
}: {
  initialCarers: Carer[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editCarer, setEditCarer] = useState<Carer | null>(null);
  const [deleteCarer, setDeleteCarer] = useState<Carer | null>(null);

  async function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = {
      name: (fd.get("name") as string)?.trim(),
      email: (fd.get("email") as string)?.trim() || null,
      phone: (fd.get("phone") as string)?.trim() || null,
      role: (fd.get("role") as string)?.trim() || null,
      active: true,
    };
    const res = await fetch("/api/carers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to add carer");
      return;
    }
    form.reset();
    router.refresh();
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editCarer) return;
    setError("");
    setSubmitting(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = {
      name: (fd.get("name") as string)?.trim(),
      email: (fd.get("email") as string)?.trim() || null,
      phone: (fd.get("phone") as string)?.trim() || null,
      role: (fd.get("role") as string)?.trim() || null,
      active: fd.get("active") === "on",
    };
    const res = await fetch(`/api/carers/${editCarer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to update carer");
      return;
    }
    setEditCarer(null);
    router.refresh();
  }

  async function handleDeleteConfirm() {
    if (!deleteCarer) return;
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/carers/${deleteCarer.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to deactivate carer");
      return;
    }
    setDeleteCarer(null);
    router.refresh();
  }

  return (
    <>
      <div className="space-y-6">
        {/* Add carer card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-slate-900">Add carer</h2>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="add-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Name *
                </label>
                <input
                  id="add-name"
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label
                  htmlFor="add-email"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="add-email"
                  name="email"
                  type="email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="add-phone"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Phone
                </label>
                <input
                  id="add-phone"
                  name="phone"
                  type="tel"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label
                  htmlFor="add-role"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Role
                </label>
                <select
                  id="add-role"
                  name="role"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  <option value="">Select role</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Adding..." : "Add carer"}
            </button>
          </form>
        </div>

        {/* Carers list */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                    Active
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {initialCarers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No carers yet. Add your first carer above.
                    </td>
                  </tr>
                ) : (
                  initialCarers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {c.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {c.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {c.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {c.role ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.active
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setError("");
                            setEditCarer(c);
                          }}
                          className="mr-2 text-sm font-medium text-blue-600 hover:text-blue-500"
                        >
                          Edit
                        </button>
                        {c.active ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError("");
                              setDeleteCarer(c);
                            }}
                            className="text-sm font-medium text-red-600 hover:text-red-500"
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editCarer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditCarer(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Edit carer</h2>
            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editCarer.name ?? ""}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editCarer.email ?? ""}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editCarer.phone ?? ""}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue={editCarer.role ?? ""}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
                >
                  <option value="">Select role</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  name="active"
                  defaultChecked={editCarer.active !== false}
                  className="h-4 w-4 rounded border-slate-200"
                />
                <label
                  htmlFor="edit-active"
                  className="text-sm font-medium text-slate-700"
                >
                  Active
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
                  disabled={submitting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditCarer(null)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteCarer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setDeleteCarer(null);
            setError("");
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">
              Deactivate carer?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {deleteCarer.name} will be marked inactive and will no longer
              appear in visit selections.
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
                {submitting ? "Deactivating..." : "Deactivate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteCarer(null);
                  setError("");
                }}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
