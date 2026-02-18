"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<
    "loading" | "accepting" | "accepted" | "already_member" | "error" | "not_logged_in"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    acceptInvite();
  }, [token]);

  async function acceptInvite() {
    setStatus("accepting");
    try {
      const res = await fetch(`/api/invite/${token}`, { method: "POST" });
      const data = await res.json();

      if (res.status === 401) {
        setStatus("not_logged_in");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed to accept invite");
        return;
      }

      const result = data.result;
      if (result?.status === "already_member") {
        setStatus("already_member");
      } else {
        setStatus("accepted");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-lg">
        {status === "loading" || status === "accepting" ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-600">
              Accepting your invite...
            </p>
          </>
        ) : status === "not_logged_in" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl">
              🔑
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Sign in to continue
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You need to sign in before accepting this invite.
            </p>
            <a
              href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
              className="mt-6 inline-block rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Sign in
            </a>
          </>
        ) : status === "accepted" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Welcome to the team!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your invite has been accepted. You now have access to this agency.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-6 inline-block rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Go to Dashboard
            </button>
          </>
        ) : status === "already_member" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl">
              👋
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Already a member
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You&apos;re already a member of this agency. No action needed.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-6 inline-block rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
              ✕
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Invite error
            </h2>
            <p className="mt-2 text-sm text-gray-600">{errorMsg}</p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-6 inline-block rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
