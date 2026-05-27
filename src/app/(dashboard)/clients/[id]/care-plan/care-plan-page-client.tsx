"use client";

import { useCallback, useEffect, useState } from "react";

type CarePlan = {
  id: string;
  status: string;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  updated_at: string;
};

type Section = {
  id: string;
  sort_order: number;
  title: string;
  body: string;
  section_key: string | null;
};

export function CarePlanPageClient({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [archivedPlans, setArchivedPlans] = useState<CarePlan[]>([]);
  const [viewingArchivedId, setViewingArchivedId] = useState<string | null>(null);

  const [planStatus, setPlanStatus] = useState("draft");
  const [planVersion, setPlanVersion] = useState(1);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/care-plan`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load");
        setPlan(null);
        setSections([]);
        return;
      }
      const p = data?.plan as CarePlan | null | undefined;
      const s = Array.isArray(data?.sections) ? (data.sections as Section[]) : [];
      const archived = Array.isArray(data?.archived_plans)
        ? (data.archived_plans as CarePlan[])
        : [];
      setPlan(p ?? null);
      setSections(s);
      setArchivedPlans(archived);
      if (p) {
        setPlanStatus(p.status);
        setPlanVersion(p.version);
        setEffectiveFrom(p.effective_from ? p.effective_from.slice(0, 10) : "");
        setEffectiveTo(p.effective_to ? p.effective_to.slice(0, 10) : "");
      }
    } catch {
      setError("Failed to load care plan");
      setPlan(null);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  async function loadArchivedPlan(planId: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/care-plan?plan_id=${encodeURIComponent(planId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load archived plan");
        return;
      }
      const p = data?.plan as CarePlan | null | undefined;
      const s = Array.isArray(data?.sections) ? (data.sections as Section[]) : [];
      setPlan(p ?? null);
      setSections(s);
      if (p) {
        setPlanStatus(p.status);
        setPlanVersion(p.version);
        setEffectiveFrom(p.effective_from ? p.effective_from.slice(0, 10) : "");
        setEffectiveTo(p.effective_to ? p.effective_to.slice(0, 10) : "");
      }
      setViewingArchivedId(planId);
    } catch {
      setError("Failed to load archived plan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreatePlan() {
    setError("");
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/care-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          version: 1,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not create plan");
        return;
      }
      await load();
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleArchivePlan() {
    if (!plan) return;
    const ok = confirm(
      "Archive this care plan?\n\nThe plan will be kept for records but hidden from editing. You can create a new care plan for this client after archiving (only one non-archived plan is allowed)."
    );
    if (!ok) return;
    setError("");
    setArchiving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/care-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          status: "archived",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not archive plan");
        return;
      }
      setPlan(null);
      setSections([]);
      await load();
    } finally {
      setArchiving(false);
    }
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setError("");
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/care-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          status: planStatus,
          version: planVersion,
          effective_from: effectiveFrom || null,
          effective_to: effectiveTo || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not save plan");
        return;
      }
      await load();
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setError("");
    setAdding(true);
    try {
      const nextOrder =
        sections.length === 0
          ? 0
          : Math.max(...sections.map((s) => s.sort_order)) + 1;
      const res = await fetch(`/api/clients/${clientId}/care-plan/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          title: newTitle.trim() || "Section",
          body: newBody,
          sort_order: nextOrder,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not add section");
        return;
      }
      setNewTitle("");
      setNewBody("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function saveSection(s: Section, title: string, body: string, sort_order: number) {
    setError("");
    const res = await fetch(`/api/care-plan-sections/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, sort_order }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Could not save section");
      return;
    }
    await load();
  }

  async function deleteSection(id: string) {
    if (!confirm("Delete this section?")) return;
    setError("");
    const res = await fetch(`/api/care-plan-sections/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Could not delete");
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-600">Loading care plan…</p>
    );
  }
  const isReadOnly = plan?.status === "archived";

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {!plan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-600">No care plan yet for this client.</p>
          <button
            type="button"
            onClick={() => void handleCreatePlan()}
            disabled={savingPlan}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {savingPlan ? "Creating…" : "Create care plan"}
          </button>
          {archivedPlans.length > 0 ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Archived plans</h3>
              <p className="mt-1 text-xs text-slate-500">
                Archived plans are retained for audit/history.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {archivedPlans.map((ap) => (
                  <button
                    key={ap.id}
                    type="button"
                    onClick={() => void loadArchivedPlan(ap.id)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View v{ap.version} ({new Date(ap.updated_at).toLocaleDateString()})
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <form
            onSubmit={handleSavePlan}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-900">Plan details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  value={planStatus}
                  onChange={(e) => setPlanStatus(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Version</span>
                <input
                  type="number"
                  min={1}
                  value={planVersion}
                  onChange={(e) => setPlanVersion(Number(e.target.value) || 1)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Effective from</span>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Effective to</span>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Last updated: {new Date(plan.updated_at).toLocaleString()}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingPlan || archiving || isReadOnly}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingPlan ? "Saving…" : "Save plan"}
              </button>
              <button
                type="button"
                onClick={() => void handleArchivePlan()}
                disabled={savingPlan || archiving || isReadOnly}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {archiving ? "Archiving…" : "Archive plan"}
              </button>
              {viewingArchivedId ? (
                <button
                  type="button"
                  onClick={() => {
                    setViewingArchivedId(null);
                    void load();
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back to current
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {isReadOnly
                ? "Archived plans are retained for audit/history."
                : "Archiving hides this plan and lets you start a new one. Archived plans are retained for audit/history."}
            </p>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sections</h2>
            <p className="mt-1 text-sm text-slate-600">
              Ordered by sort order (lowest first). Plain text only.
            </p>
            <ul className="mt-4 space-y-6">
              {sections.map((s) => (
                <SectionEditor
                  key={s.id}
                  section={s}
                  onSave={(title, body, sort_order) => saveSection(s, title, body, sort_order)}
                  onDelete={() => void deleteSection(s.id)}
                  readOnly={isReadOnly}
                />
              ))}
            </ul>

            {!isReadOnly ? (
            <form onSubmit={handleAddSection} className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-800">Add section</h3>
              <label className="mt-2 block text-sm">
                <span className="font-medium text-slate-700">Title</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                  placeholder="e.g. Medication"
                />
              </label>
              <label className="mt-2 block text-sm">
                <span className="font-medium text-slate-700">Body</span>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                disabled={adding}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add section"}
              </button>
            </form>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  onSave,
  onDelete,
  readOnly = false,
}: {
  section: Section;
  onSave: (title: string, body: string, sort_order: number) => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body);
  const [sortOrder, setSortOrder] = useState(section.sort_order);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(section.title);
    setBody(section.body);
    setSortOrder(section.sort_order);
  }, [section.id, section.title, section.body, section.sort_order]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(title, body, sortOrder);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[120px] flex-1 text-sm">
            <span className="font-medium text-slate-700">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
            />
          </label>
          <label className="block w-28 text-sm">
            <span className="font-medium text-slate-700">Sort</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={readOnly}
            rows={5}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || readOnly}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save section"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={readOnly}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </form>
    </li>
  );
}
