"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LibraryPage() {
  const router = useRouter();
  const { session, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <button className="border rounded-lg px-3 py-2" onClick={signOut}>
          Sign out
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Logged in as <strong>{session.user.email}</strong>
      </p>

      <div className="border rounded-xl p-4">
        Next up: Intake uploads + tagging + category browsing.
      </div>
    </main>
  );
}
