"use client";

import { useCallback, useState } from "react";
import {
  CQC_CATEGORIES,
  CQC_CATEGORY_LABELS,
  type CqcCategory,
  type CqcEvidenceRow,
  type CqcEvidenceSummary,
  type CqcEvidenceStatus,
  type CqcRiskLevel,
} from "@/lib/cqc-evidence-data";

function StatusBadge({ status }: { status: CqcEvidenceStatus }) {
  const styles: Record<CqcEvidenceStatus, string> = {
    open: "bg-amber-100 text-amber-900",
    in_review: "bg-blue-100 text-blue-900",
    complete: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RiskBadge({ risk }: { risk: CqcRiskLevel }) {
  const styles: Record<CqcRiskLevel, string> = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-orange-100 text-orange-900",
    high: "bg-red-100 text-red-900",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[risk]}`}>
      {risk} risk
    </span>
  );
}

export function CqcCategoryCards({ summary }: { summary: CqcEvidenceSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CQC_CATEGORIES.map((cat) => {
        const stats = summary.by_category[cat];
        return (
          <div
            key={cat}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              {CQC_CATEGORY_LABELS[cat]}
            </h3>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <dt>Open</dt>
                <dd className="font-medium text-slate-900">{stats.open}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Overdue</dt>
                <dd className="font-medium text-amber-800">{stats.overdue}</dd>
              </div>
              <div className="flex justify-between">
                <dt>High risk open</dt>
                <dd className="font-medium text-red-800">{stats.high_risk_open}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

export function CqcEvidenceForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CqcCategory>("safe");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CqcEvidenceStatus>("open");
  const [risk, setRisk] = useState<CqcRiskLevel>("low");
  const [dueDate, setDueDate] = useState("");
  const [owner, setOwner] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cqc-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title,
          description,
          status,
          risk,
          due_date: dueDate || null,
          owner: owner || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to add evidence");
        return;
      }
      setTitle("");
      setDescription("");
      setDueDate("");
      setOwner("");
      setOpen(false);
      onCreated();
    } catch {
      setError("Failed to add evidence");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Add CQC evidence
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">New evidence item</h3>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CqcCategory)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            {CQC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CQC_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CqcEvidenceStatus)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="open">open</option>
            <option value="in_review">in review</option>
            <option value="complete">complete</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Risk</span>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as CqcRiskLevel)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Owner</span>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save evidence"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CqcEvidenceList({
  items,
  onUpdated,
}: {
  items: CqcEvidenceRow[];
  onUpdated: () => void;
}) {
  const markComplete = useCallback(
    async (id: string) => {
      await fetch(`/api/cqc-evidence/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "complete" }),
      });
      onUpdated();
    },
    [onUpdated]
  );

  const openItems = items.filter((i) => i.status !== "complete");

  if (openItems.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        No open CQC evidence items. Add evidence to track inspection-ready actions.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {openItems.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
        >
          <div>
            <p className="font-medium text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500">
              {CQC_CATEGORY_LABELS[item.category]}
              {item.due_date ? ` · due ${item.due_date}` : ""}
              {item.owner ? ` · ${item.owner}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <RiskBadge risk={item.risk} />
            <button
              type="button"
              onClick={() => void markComplete(item.id)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Mark complete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CqcRecentlyCompleted({ items }: { items: CqcEvidenceRow[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">No completed evidence yet in this register.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
        >
          <span className="font-medium text-slate-900">{item.title}</span>
          <span className="text-slate-500">
            {" "}
            — {CQC_CATEGORY_LABELS[item.category]} · completed
          </span>
        </li>
      ))}
    </ul>
  );
}
