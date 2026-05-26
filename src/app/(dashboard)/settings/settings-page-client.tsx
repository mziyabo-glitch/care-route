"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { roleLabel, type Role } from "@/lib/roles";

type Props = {
  email: string;
  displayName: string;
  agencyName: string;
  role: Role | null;
  canEditAgency: boolean;
};

export function SettingsPageClient({
  email,
  displayName: initialDisplayName,
  agencyName: initialAgencyName,
  role,
  canEditAgency,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [agencyName, setAgencyName] = useState(initialAgencyName);
  const [profileMsg, setProfileMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [agencyMsg, setAgencyMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [agencySaving, setAgencySaving] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProfileMsg({ type: "err", text: json.error ?? "Could not save" });
        return;
      }
      setDisplayName(json.displayName ?? displayName);
      setProfileMsg({ type: "ok", text: "Display name saved." });
      router.refresh();
    } catch {
      setProfileMsg({ type: "err", text: "Could not save. Try again." });
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveAgency(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditAgency) return;
    setAgencyMsg(null);
    setAgencySaving(true);
    try {
      const res = await fetch("/api/settings/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agencyName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAgencyMsg({ type: "err", text: json.error ?? "Could not save" });
        return;
      }
      setAgencyName(json.name ?? agencyName);
      setAgencyMsg({ type: "ok", text: "Agency name saved." });
      router.refresh();
    } catch {
      setAgencyMsg({ type: "err", text: "Could not save. Try again." });
    } finally {
      setAgencySaving(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Personalise how you appear on the dashboard. Agency details apply to
          your current organisation only.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Personal profile</h2>
        <p className="mt-1 text-sm text-slate-500">
          Used in dashboard greetings. Not shared outside your account.
        </p>
        <form onSubmit={saveProfile} className="mt-5 max-w-md space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-slate-700"
            >
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Brian Smith"
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              readOnly
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
          </div>
          {profileMsg ? (
            <p
              className={`text-sm ${
                profileMsg.type === "ok" ? "text-emerald-700" : "text-red-700"
              }`}
              role="status"
            >
              {profileMsg.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={profileSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {profileSaving ? "Saving…" : "Save display name"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Agency</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shown on the Care Control Centre dashboard for your current agency.
        </p>
        <form onSubmit={saveAgency} className="mt-5 max-w-md space-y-4">
          <div>
            <label
              htmlFor="agencyName"
              className="block text-sm font-medium text-slate-700"
            >
              Agency name
            </label>
            <input
              id="agencyName"
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              readOnly={!canEditAgency}
              maxLength={200}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm ${
                canEditAgency
                  ? "border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            />
            {!canEditAgency ? (
              <p className="mt-1 text-xs text-slate-500">
                Only owner, admin, or manager can change the agency name.
              </p>
            ) : null}
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-700">
              Your role
            </span>
            <p className="mt-1 text-sm text-slate-600">
              {role ? roleLabel(role) : "—"}
            </p>
          </div>
          {agencyMsg ? (
            <p
              className={`text-sm ${
                agencyMsg.type === "ok" ? "text-emerald-700" : "text-red-700"
              }`}
              role="status"
            >
              {agencyMsg.text}
            </p>
          ) : null}
          {canEditAgency ? (
            <button
              type="submit"
              disabled={agencySaving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {agencySaving ? "Saving…" : "Save agency name"}
            </button>
          ) : null}
        </form>
      </section>

      <p className="text-sm text-slate-600">
        <Link
          href="/settings/members"
          className="font-medium text-teal-700 hover:text-teal-800"
        >
          Team &amp; members
        </Link>
        {" — invite colleagues and manage roles."}
      </p>
    </div>
  );
}
