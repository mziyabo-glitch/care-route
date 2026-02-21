"use client";

import { useEffect, useState, useCallback } from "react";

type Member = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "viewer", label: "Viewer" },
  { value: "carer", label: "Carer" },
] as const;

function roleBadgeClass(role: string) {
  switch (role) {
    case "owner":
      return "bg-amber-100 text-amber-800";
    case "admin":
    case "manager":
      return "bg-blue-100 text-blue-800";
    case "carer":
      return "bg-green-100 text-green-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function MembersPageClient({ myRole }: { myRole: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/members");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load members");
        return;
      }
      setMembers(data.members ?? []);
      setInvites(data.invites ?? []);
    } catch {
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError("");
    setSubmitting(true);
    setLastInviteLink(null);
    try {
      const res = await fetch("/api/settings/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create invite");
        return;
      }
      const token = data.invite?.token;
      if (token) {
        const link = `${window.location.origin}/invite/${token}`;
        setLastInviteLink(link);
      }
      setInviteEmail("");
      setInviteRole("viewer");
      fetchData();
    } catch {
      setError("Failed to create invite");
    } finally {
      setSubmitting(false);
    }
  }

  function copyToClipboard(text: string, token: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">Loading team...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-2 text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Members</h2>
        </div>
        <ul className="divide-y divide-slate-200">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {m.email}
                </div>
                <div className="text-xs text-slate-500">
                  Joined{" "}
                  {new Date(m.created_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass(m.role)}`}
              >
                {roleLabel(m.role)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Invite form (admin only) */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Invite a team member
            </h2>
          </div>
          <form
            onSubmit={handleInvite}
            className="flex flex-wrap items-end gap-3 px-4 py-4"
          >
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Email address
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Create invite"}
            </button>
          </form>
          {lastInviteLink && (
            <div className="border-t border-slate-200 bg-green-50 px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-green-800">
                Invite link created — share it with the invitee:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-800 ring-1 ring-slate-200">
                  {lastInviteLink}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(lastInviteLink, "last")}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                >
                  {copiedToken === "last" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending invites (admin only) */}
      {isAdmin && invites.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Pending invites
            </h2>
          </div>
          <ul className="divide-y divide-slate-200">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const accepted = !!inv.accepted_at;
              const link = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inv.token}`;
              return (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {inv.email}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass(inv.role)}`}
                      >
                        {roleLabel(inv.role)}
                      </span>
                      {accepted ? (
                        <span className="font-medium text-green-700">
                          Accepted
                        </span>
                      ) : expired ? (
                        <span className="font-medium text-red-600">
                          Expired
                        </span>
                      ) : (
                        <span className="text-amber-600">
                          Expires{" "}
                          {new Date(inv.expires_at).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short" }
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {!accepted && !expired && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(link, inv.token)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copiedToken === inv.token ? "Copied!" : "Copy link"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isAdmin && (
        <p className="text-sm text-slate-500">
          Only admins can invite new members and manage roles.
        </p>
      )}
    </div>
  );
}
