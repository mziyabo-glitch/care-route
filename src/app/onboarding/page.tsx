"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const checkMembership = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membership } = await supabase
        .from("agency_members")
        .select("agency_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        router.replace("/dashboard");
      }
    };

    void checkMembership();
  }, [router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const agencyName = name.trim();
    if (!agencyName) {
      setErrorMessage("Agency name is required.");
      setLoading(false);
      return;
    }

    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .insert({
        name: agencyName,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (agencyError || !agency) {
      setErrorMessage(agencyError?.message ?? "Unable to create agency.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("agency_members").insert({
      agency_id: agency.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      setErrorMessage(memberError.message);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">
          Create your agency
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Let&apos;s set up your first agency before continuing.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="agency-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Agency name
            </label>
            <input
              id="agency-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 placeholder:text-gray-400 focus:ring-2"
              placeholder="Care Route Agency"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating agency..." : "Create agency"}
          </button>
        </form>

        {errorMessage ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}
