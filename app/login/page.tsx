"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) return setError(error.message);

    router.push("/library");
    router.refresh();
  }

  async function signUp() {
    setBusy(true);
    setError(null);
    setInfo(null);

    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (error) return setError(error.message);

    if (!data.session) {
      setInfo("Account created. Check your email to confirm, then sign in.");
      return;
    }

    router.push("/library");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Forge & Filament</h1>
        <p className="text-sm text-gray-600">Sign in to access the library.</p>

        <form onSubmit={signIn} className="space-y-3">
          <input
            className="w-full border rounded-lg p-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full border rounded-lg p-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && <div className="text-sm text-red-600">{error}</div>}
          {info && <div className="text-sm text-green-700">{info}</div>}

          <button
            disabled={busy}
            className="w-full rounded-lg p-2 border bg-black text-white disabled:opacity-50"
            type="submit"
          >
            {busy ? "Working..." : "Sign in"}
          </button>

          <button
            disabled={busy}
            onClick={signUp}
            className="w-full rounded-lg p-2 border"
            type="button"
          >
            Create account
          </button>
        </form>
      </div>
    </main>
  );
}
