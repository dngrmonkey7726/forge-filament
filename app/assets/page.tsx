"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type AssetRow = {
  id: string;
  created_at: string;
  name: string;
  title: string | null;
  category: string | null;
  property: string | null;
  sub_property: string | null;
  tags: string[] | null;
};

export default function AssetsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function loadAssets() {
    setBusy(true);
    setErr(null);

    const { data, error } = await supabase
      .from("assets")
      .select("id, created_at, name, title, category, property, sub_property, tags")
      .order("created_at", { ascending: false })
      .limit(200);

    setBusy(false);

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

  if (loading) return <main className="p-6">Loading…</main>;
  if (!session) return <main className="p-6">Redirecting…</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets</h1>

        <div className="flex gap-2">
          <button
            className="border rounded-lg px-3 py-2"
            onClick={() => router.push("/admin/bulk-fix")}
          >
            Bulk Fix Metadata
          </button>

          <button
            className="border rounded-lg px-3 py-2"
            onClick={() => loadAssets()}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {busy ? (
        <div className="text-sm text-gray-600">Loading assets…</div>
      ) : assets.length === 0 ? (
        <div className="text-sm text-gray-600">No assets yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <div
              key={a.id}
              className="border rounded-xl p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => router.push(`/assets/${a.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  router.push(`/assets/${a.id}`);
                }
              }}
            >
              <div className="font-medium">
                {a.title || a.name || "(untitled)"}
              </div>

              <div className="text-xs text-gray-600 mt-1">
                {a.category ?? "—"} • {a.property ?? "—"}
                {a.sub_property ? ` • ${a.sub_property}` : ""}
              </div>

              <div className="text-xs text-gray-500 mt-1">
                {a.tags?.length ? a.tags.join(", ") : "No tags"}
              </div>

              <div className="text-xs text-gray-400 mt-1">
                {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
