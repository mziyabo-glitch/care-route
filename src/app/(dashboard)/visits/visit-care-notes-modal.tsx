"use client";

import { useCallback, useEffect, useState } from "react";

type VisitRef = {
  id: string;
  client_name: string | null;
};

type CareNote = {
  id: string;
  body: string;
  note_type: string | null;
  created_at: string;
  updated_at: string;
};

const NOTE_TYPES = [
  { value: "", label: "General (no type)" },
  { value: "general", label: "general" },
  { value: "handover", label: "handover" },
  { value: "clinical", label: "clinical" },
];

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function VisitCareNotesModal({
  visit,
  onClose,
}: {
  visit: VisitRef | null;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<CareNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newType, setNewType] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editType, setEditType] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visit) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/visits/${visit.id}/care-notes`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load notes");
        setNotes([]);
        return;
      }
      const list = Array.isArray(data?.notes) ? data.notes : [];
      setNotes(list as CareNote[]);
    } catch {
      setError("Failed to load notes");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [visit]);

  useEffect(() => {
    if (!visit) {
      setNotes([]);
      setEditingId(null);
      setNewBody("");
      setNewType("");
      return;
    }
    void load();
  }, [visit, load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!visit) return;
    const text = newBody.trim();
    if (!text) return;
    setError("");
    setAdding(true);
    try {
      const res = await fetch(`/api/visits/${visit.id}/care-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          note_type: newType || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not add note");
        return;
      }
      setNewBody("");
      setNewType("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  function startEdit(n: CareNote) {
    setEditingId(n.id);
    setEditBody(n.body);
    setEditType(n.note_type ?? "");
  }

  async function saveEdit(noteId: string) {
    const text = editBody.trim();
    if (!text) {
      setError("Note text cannot be empty");
      return;
    }
    setError("");
    setSavingId(noteId);
    try {
      const res = await fetch(`/api/visit-care-notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          note_type: editType || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not save");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function removeNote(noteId: string) {
    if (!confirm("Delete this care note?")) return;
    setError("");
    setSavingId(noteId);
    try {
      const res = await fetch(`/api/visit-care-notes/${noteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not delete");
        return;
      }
      if (editingId === noteId) setEditingId(null);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  if (!visit) return null;

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
          <h2 className="text-lg font-semibold text-slate-900">Visit care notes</h2>
          <p className="mt-0.5 text-sm text-slate-600">{visit.client_name ?? "Client"}</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-slate-500">Loading notes…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-slate-500">No care notes yet for this visit.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                >
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-600">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        {NOTE_TYPES.map((t) => (
                          <option key={t.value || "empty"} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm text-slate-900"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(n.id)}
                          disabled={savingId === n.id}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                        >
                          {savingId === n.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>{formatTs(n.created_at)}</span>
                        {n.note_type ? (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800">
                            {n.note_type}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-500"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeNote(n.id)}
                          disabled={savingId === n.id}
                          className="text-xs font-medium text-red-600 hover:text-red-500 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd} className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Add note</h3>
            <label className="mt-2 block text-xs font-medium text-slate-600">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {NOTE_TYPES.map((t) => (
                <option key={t.value || "empty-new"} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="mt-2 block text-xs font-medium text-slate-600">Note</label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={4}
              placeholder="Plain text only"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm text-slate-900"
            />
            <button
              type="submit"
              disabled={adding || !newBody.trim()}
              className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add note"}
            </button>
          </form>
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
