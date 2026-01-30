"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type AssetRow = {
  id: string;
  title: string;
  category: string | null;
  property: string | null;
  sub_property: string | null;
  tags: string[] | null;
  created_at: string;
};

export default function AssetsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function loadAssets() {
    setLoadingAssets(true);
    setErr(null);

    const { data, error } = await supabase
      .from("assets")
      .select("id, title, category, property, sub_property, tags, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    setLoadingAssets(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setAssets((data ?? []) as AssetRow[]);
  }

  useEffect(() => {
    if (!loading && session) loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets Library</h1>
        <button
          className="border rounded-lg px-3 py-2"
          onClick={() => router.push("/library")}
        >
          Back to Library
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {loadingAssets ? (
        <div className="text-sm text-gray-600">Loading assets…</div>
      ) : assets.length === 0 ? (
        <div className="text-sm text-gray-600">No assets yet.</div>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <div
              key={a.id}
              className="border rounded-lg p-3 hover:bg-gray-50"
            >
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-gray-600 mt-1">
                Category: {a.category ?? "—"} • Property: {a.property ?? "—"} • Sub:{" "}
                {a.sub_property ?? "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Tags: {a.tags?.length ? a.tags.join(", ") : "—"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Added {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
