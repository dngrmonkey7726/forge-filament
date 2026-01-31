"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type AssetRow = {
  id: string;
  title: string;
  name: string | null;
  category: string | null;
  property: string | null;
  sub_property: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
};

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { session, loading } = useAuth();

  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [property, setProperty] = useState("");
  const [subProperty, setSubProperty] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  const tags = useMemo(() => {
    return tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }, [tagsText]);

  async function load() {
    if (!id) return;

    setErr(null);

    const { data, error } = await supabase
      .from("assets")
      .select("id, title, name, category, property, sub_property, tags, notes, created_at")
      .eq("id", id)
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    const a = data as AssetRow;
    setAsset(a);

    setTitle(a.title ?? "");
    setCategory(a.category ?? "");
    setProperty(a.property ?? "");
    setSubProperty(a.sub_property ?? "");
    setTagsText((a.tags ?? []).join(", "));
    setNotes(a.notes ?? "");
  }

  useEffect(() => {
    if (!loading && session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, id]);

  async function save() {
    if (!id || !session) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        name: title.trim(), // keep name aligned for now
        category: category.trim() || null,
        property: property.trim() || null,
        sub_property: subProperty.trim() || null,
        tags,
        notes: notes.trim() || null,
      };

      if (!payload.title) throw new Error("Title is required.");

      const { error: updErr } = await supabase.from("assets").update(payload).eq("id", id);
      if (updErr) throw new Error(updErr.message);

      // Best-effort audit log
      await supabase.from("audit_log").insert({
        actor: session.user.id,
        action: "asset_update_metadata",
        target_type: "asset",
        target_id: id,
        details: {
          title: payload.title,
          category: payload.category,
          property: payload.property,
          sub_property: payload.sub_property,
          tags: payload.tags,
        },
      });

      setMsg("✅ Saved.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Edit Asset</h1>
          <div className="text-xs text-gray-500">{id}</div>
        </div>

        <div className="flex gap-2 items-center">
          <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/assets")}>
            Back
          </button>

          <button
            className="border rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
            onClick={save}
            disabled={busy}
            title="Save changes"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-green-700">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Metadata</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="w-full border rounded-lg p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <input
            className="w-full border rounded-lg p-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
          />
          <input
            className="w-full border rounded-lg p-2"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
            placeholder="Property"
          />
          <input
            className="w-full border rounded-lg p-2"
            value={subProperty}
            onChange={(e) => setSubProperty(e.target.value)}
            placeholder="Sub-property (optional)"
          />
        </div>

        <textarea
          className="w-full border rounded-lg p-2"
          rows={3}
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Tags (comma separated)"
        />

        <textarea
          className="w-full border rounded-lg p-2"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
        />

        {asset && (
          <div className="text-xs text-gray-500">
            Created: {new Date(asset.created_at).toLocaleString()}
          </div>
        )}
      </section>
    </main>
  );
}
