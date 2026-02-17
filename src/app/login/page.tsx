"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "password" | "magic-link";
type AuthAction = "sign-in" | "sign-up" | "magic-link" | null;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const normalizeErrorMessage = (message: string) => {
    const lower = message.toLowerCase();
    if (
      lower.includes("rate limit") ||
      lower.includes("email rate limit exceeded")
    ) {
      return "Too many emails sent. Please wait a few minutes, or use Password login.";
    }
    return message;
  };

  const handlePasswordSignIn = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(normalizeErrorMessage(error.message));
      return;
    }

    router.replace("/dashboard");
  };

  const handlePasswordSignUp = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErrorMessage(normalizeErrorMessage(error.message));
      return;
    }

    if (data.session) {
      router.replace("/dashboard");
      return;
    }

    setSuccessMessage(
      "Account created. Check your inbox to verify your email, then sign in.",
    );
  };

  const handleMagicLink = async () => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setErrorMessage(normalizeErrorMessage(error.message));
      return;
    }

    setSuccessMessage("Magic link sent. Check your email to continue.");
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthAction(mode === "magic-link" ? "magic-link" : "sign-in");
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    if (mode === "magic-link") {
      await handleMagicLink();
    } else {
      await handlePasswordSignIn();
    }

    setLoading(false);
    setAuthAction(null);
  };

  const onCreateAccount = async () => {
    setAuthAction("sign-up");
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");
    await handlePasswordSignUp();
    setLoading(false);
    setAuthAction(null);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Log in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose password login or request a one-time magic link.
        </p>

        <div className="mt-4 grid grid-cols-2 rounded-md bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "password"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode("magic-link")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "magic-link"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Magic link
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 placeholder:text-gray-400 focus:ring-2"
              placeholder="you@example.com"
            />
          </div>

          {mode === "password" ? (
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500 placeholder:text-gray-400 focus:ring-2"
                placeholder="Enter your password"
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === "password"
              ? loading
                ? authAction === "sign-up"
                  ? "Please wait..."
                  : "Signing in..."
                : "Sign in"
              : loading
                ? authAction === "magic-link"
                  ? "Sending magic link..."
                  : "Please wait..."
                : "Send magic link"}
          </button>

          {mode === "password" ? (
            <button
              type="button"
              onClick={() => void onCreateAccount()}
              disabled={loading}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && authAction === "sign-up"
                ? "Creating account..."
                : "Create account"}
            </button>
          ) : null}
        </form>

        {successMessage ? (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}
