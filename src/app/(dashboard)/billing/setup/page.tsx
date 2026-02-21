"use client";

import { useEffect, useState, useCallback } from "react";

type Funder = { id: string; name: string; type: string };
type FunderRate = { id: string; rate_type: string; hourly_rate: number; mileage_rate: number | null; effective_from: string; effective_to: string | null };
type ClientFunder = { client_id: string; client_name: string | null; funder_id: string; funder_name: string; active: boolean };
type Client = { id: string; name: string | null };

const FUNDER_TYPES = [
  { value: "private", label: "Private" },
  { value: "local_authority", label: "Local Authority" },
  { value: "nhs", label: "NHS" },
  { value: "other", label: "Other" },
];

const RATE_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "evening", label: "Evening (before 8am / after 6pm)" },
  { value: "weekend", label: "Weekend" },
  { value: "holiday", label: "Holiday" },
];

function formatFunderType(t: string): string {
  return FUNDER_TYPES.find((x) => x.value === t)?.label ?? t;
}

export default function BillingSetupPage() {
  const [funders, setFunders] = useState<Funder[]>([]);
  const [clientFunders, setClientFunders] = useState<ClientFunder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [funderModal, setFunderModal] = useState<Funder | null>(null);
  const [ratesModal, setRatesModal] = useState<Funder | null>(null);
  const [assignModal, setAssignModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/setup");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setFunders(data.funders ?? []);
      setClientFunders(data.clientFunders ?? []);
      setClients(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function api(action: string, body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/billing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return false;
      }
      await fetchData();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const clientFunderMap = Object.fromEntries(clientFunders.map((cf) => [cf.client_id, cf]));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Billing Setup</h1>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Funders */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Funders</h2>
          <button
            type="button"
            onClick={() => setFunderModal({ id: "", name: "", type: "private" })}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Add funder
          </button>
        </div>
        <div className="divide-y divide-slate-200">
          {funders.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">No funders yet. Add one to get started.</div>
          ) : (
            funders.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <span className="font-medium text-slate-900">{f.name}</span>
                  <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{formatFunderType(f.type)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRatesModal(f)}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Rates
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete ${f.name}?`)) await api("delete_funder", { funder_id: f.id });
                    }}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Client assignments */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Client funding</h2>
          <button
            type="button"
            onClick={() => setAssignModal(true)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Assign funder to client
          </button>
        </div>
        <div className="divide-y divide-slate-200">
          {clients.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">No clients.</div>
          ) : (
            clients.map((c) => {
              const cf = clientFunderMap[c.id];
              return (
                <div key={c.id} className="flex items-center justify-between px-6 py-4">
                  <span className="font-medium text-slate-900">{c.name ?? "—"}</span>
                  <span className="text-sm text-slate-600">{cf ? cf.funder_name : "No funder assigned"}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Funder modal */}
      {funderModal && (
        <FunderModal
          funder={funderModal}
          onSave={async (name, type) => {
            const ok = await api("upsert_funder", {
              id: funderModal.id || undefined,
              name,
              type,
            });
            if (ok) setFunderModal(null);
          }}
          onClose={() => setFunderModal(null)}
          saving={saving}
        />
      )}

      {/* Rates modal */}
      {ratesModal && (
        <RatesModal
          funder={ratesModal}
          onClose={() => setRatesModal(null)}
          saving={saving}
          api={api}
          fetchData={fetchData}
        />
      )}

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          clients={clients}
          funders={funders}
          clientFunders={clientFunders}
          onAssign={async (clientId, funderId) => {
            const ok = await api("set_client_funder", { client_id: clientId, funder_id: funderId });
            if (ok) setAssignModal(false);
          }}
          onClear={async (clientId) => {
            await api("clear_client_funder", { client_id: clientId });
          }}
          onClose={() => setAssignModal(false)}
          saving={saving}
          api={api}
        />
      )}
    </div>
  );
}

function FunderModal({
  funder,
  onSave,
  onClose,
  saving,
}: {
  funder: Funder;
  onSave: (name: string, type: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(funder.name);
  const [type, setType] = useState(funder.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900">{funder.id ? "Edit funder" : "Add funder"}</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Funder name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {FUNDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onSave(name, type)}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RatesModal({
  funder,
  onClose,
  saving,
  api,
  fetchData,
}: {
  funder: Funder;
  onClose: () => void;
  saving: boolean;
  api: (action: string, body: Record<string, unknown>) => Promise<boolean>;
  fetchData: () => Promise<void>;
}) {
  const [rates, setRates] = useState<FunderRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState<Partial<FunderRate> | null>(null);

  useEffect(() => {
    fetch(`/api/billing/rates?funder_id=${funder.id}`)
      .then((r) => r.json())
      .then((d) => {
        setRates(d.rates ?? []);
      })
      .finally(() => setLoading(false));
  }, [funder.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900">Rates: {funder.name}</h3>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mt-4 space-y-3">
            {RATE_TYPES.map((rt) => {
              const existing = rates.find((r) => r.rate_type === rt.value);
              return (
                <div key={rt.value} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{rt.label}</span>
                    {existing ? (
                      <span className="text-sm text-slate-600">
                        £{Number(existing.hourly_rate).toFixed(2)}/hr
                        {existing.mileage_rate != null ? ` · £${Number(existing.mileage_rate).toFixed(2)}/mi` : ""}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">Not set</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRate(
                          existing
                            ? { ...existing }
                            : {
                                rate_type: rt.value,
                                hourly_rate: 0,
                                mileage_rate: null,
                                effective_from: new Date().toISOString().slice(0, 10),
                                effective_to: null,
                              }
                        )
                      }
                      className="text-sm font-medium text-slate-600 hover:text-slate-900"
                    >
                      {existing ? "Edit" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Close
          </button>
        </div>
      </div>

      {editingRate && (
        <RateFormModal
          funderId={funder.id}
          rate={editingRate}
          onSave={async (r) => {
            const ok = await api("upsert_funder_rate", {
              funder_id: funder.id,
              id: r.id,
              rate_type: r.rate_type,
              hourly_rate: r.hourly_rate,
              mileage_rate: r.mileage_rate ?? 0,
              effective_from: r.effective_from,
              effective_to: r.effective_to,
            });
            if (ok) {
              setEditingRate(null);
              const res = await fetch(`/api/billing/rates?funder_id=${funder.id}`);
              const d = await res.json();
              setRates(d.rates ?? []);
            }
          }}
          onClose={() => setEditingRate(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function RateFormModal({
  funderId,
  rate,
  onSave,
  onClose,
  saving,
}: {
  funderId: string;
  rate: Partial<FunderRate>;
  onSave: (r: FunderRate) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [hourlyRate, setHourlyRate] = useState(String(rate.hourly_rate ?? 0));
  const [mileageRate, setMileageRate] = useState(rate.mileage_rate != null ? String(rate.mileage_rate) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(rate.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState(rate.effective_to ?? "");

  const rateTypeLabel = RATE_TYPES.find((r) => r.value === rate.rate_type)?.label ?? rate.rate_type;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-semibold text-slate-900">{rateTypeLabel}</h4>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Hourly rate (£)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mileage rate (£/mile)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={mileageRate}
              onChange={(e) => setMileageRate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Effective from</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Effective to (optional)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() =>
              onSave({
                id: rate.id ?? "",
                rate_type: rate.rate_type!,
                hourly_rate: parseFloat(hourlyRate) || 0,
                mileage_rate: mileageRate ? parseFloat(mileageRate) : null,
                effective_from: effectiveFrom,
                effective_to: effectiveTo || null,
              } as FunderRate)
            }
            disabled={saving}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModal({
  clients,
  funders,
  clientFunders,
  onAssign,
  onClear,
  onClose,
  saving,
  api,
}: {
  clients: Client[];
  funders: Funder[];
  clientFunders: ClientFunder[];
  onAssign: (clientId: string, funderId: string) => Promise<void>;
  onClear: (clientId: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  api: (action: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [clientId, setClientId] = useState("");
  const [funderId, setFunderId] = useState("");
  const clientFunderMap = Object.fromEntries(clientFunders.map((cf) => [cf.client_id, cf]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900">Assign funder to client</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "—"} {clientFunderMap[c.id] ? `(currently: ${clientFunderMap[c.id].funder_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Funder</label>
            <select
              value={funderId}
              onChange={(e) => setFunderId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select funder</option>
              {funders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({formatFunderType(f.type)})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => clientId && funderId && onAssign(clientId, funderId)}
            disabled={saving || !clientId || !funderId}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Assign"}
          </button>
          {clientId && clientFunderMap[clientId] && (
            <button
              type="button"
              onClick={async () => {
                if (confirm("Clear funder assignment?")) {
                  const ok = await api("clear_client_funder", { client_id: clientId });
                  if (ok) onClose();
                }
              }}
              disabled={saving}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
