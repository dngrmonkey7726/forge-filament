"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type IntakeItem = {
  id: string;
  created_at: string;
  raw_name: string | null;
  status: "unsorted" | "promoted" | "archived";
  category: string | null;
  property: string | null;
  sub_property: string | null;
  notes: string | null;
  tags: string[];
};

type IntakeFile = {
  id: string;
  file_name: string;
  bucket: string;
  object_path: string;
  size_bytes: number | null;
  mime_type: string | null;
};

function stripExt(filename: string) {
  const i = filename.lastIndexOf(".");
  if (i <= 0) return filename;
  return filename.slice(0, i);
}

export default function IntakeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { session, loading } = useAuth();

  const [item, setItem] = useState<IntakeItem | null>(null);
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // New: Promote UX flags
  const [promoteDone, setPromoteDone] = useState(false);
  const [promotedAssetId, setPromotedAssetId] = useState<string | null>(null);

  // Form state
  const [rawName, setRawName] = useState("");
  const [category, setCategory] = useState("");
  const [property, setProperty] = useState("");
  const [subProperty, setSubProperty] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsText, setTagsText] = useState("");

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

    const { data: itemData, error: itemErr } = await supabase
      .from("intake_items")
      .select("id, created_at, raw_name, status, category, property, sub_property, notes, tags")
      .eq("id", id)
      .single();

    if (itemErr) {
      setErr(itemErr.message);
      return;
    }

    const { data: filesData, error: filesErr } = await supabase
      .from("intake_files")
      .select("id, file_name, bucket, object_path, size_bytes, mime_type")
      .eq("intake_item_id", id)
      .order("file_name", { ascending: true });

    if (filesErr) {
      setErr(filesErr.message);
      return;
    }

    const it = itemData as IntakeItem;
    const fs = (filesData ?? []) as IntakeFile[];

    setItem(it);
    setFiles(fs);

    const suggestedName =
      (it.raw_name ?? "").trim() || (fs.length ? stripExt(fs[0].file_name) : "");

    setRawName(suggestedName);

    setCategory(it.category ?? "");
    setProperty(it.property ?? "");
    setSubProperty(it.sub_property ?? "");
    setNotes(it.notes ?? "");
    setTagsText((it.tags ?? []).join(", "));

    // If already promoted, allow Done flow
    if (it.status === "promoted") {
      setPromoteDone(true);
    }
  }

  useEffect(() => {
    if (!loading && session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, id]);

  async function save() {
    if (!id) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase
      .from("intake_items")
      .update({
        raw_name: rawName.trim() || null,
        category: category.trim() || null,
        property: property.trim() || null,
        sub_property: subProperty.trim() || null,
        notes: notes.trim() || null,
        tags,
      })
      .eq("id", id);

    setBusy(false);

    if (error) return setErr(error.message);

    setMsg("✅ Saved.");
    await load();
  }

  async function openFile(f: IntakeFile) {
    setErr(null);
    setMsg(null);

    const { data, error } = await supabase.storage.from(f.bucket).createSignedUrl(f.object_path, 60 * 10);
    if (error) return setErr(error.message);

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteIntakeOriginals(intakeItemId: string) {
    const { data: fileRows, error: filesErr } = await supabase
      .from("intake_files")
      .select("id, bucket, object_path")
      .eq("intake_item_id", intakeItemId);

    if (filesErr) throw new Error(filesErr.message);

    const intakeFiles = (fileRows ?? []) as Array<{ id: string; bucket: string; object_path: string }>;
    if (intakeFiles.length === 0) return 0;

    // Group by bucket
    const byBucket = new Map<string, string[]>();
    for (const f of intakeFiles) {
      const b = f.bucket || "intake";
      if (!byBucket.has(b)) byBucket.set(b, []);
      byBucket.get(b)!.push(f.object_path);
    }

    for (const [bucket, paths] of byBucket.entries()) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
      if (rmErr) throw new Error(`Storage delete failed (${bucket}): ${rmErr.message}`);
    }

    const { error: delErr } = await supabase.from("intake_files").delete().eq("intake_item_id", intakeItemId);
    if (delErr) throw new Error(delErr.message);

    return intakeFiles.length;
  }

  async function promote() {
    if (!id || !session || !item) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      // If already promoted, don't silently do nothing—tell the user.
      if (item.status !== "unsorted") {
        setPromoteDone(true);
        setMsg("✅ Already promoted. You can finalize this intake item.");
        return;
      }

      const finalName =
        (rawName || item.raw_name || "").trim() ||
        (files.length ? stripExt(files[0].file_name) : "");
      const finalCategory = category.trim();
      const finalProperty = property.trim();

      if (!finalName) throw new Error("Name is required before promoting.");
      if (!finalCategory) throw new Error("Category is required before promoting.");
      if (!finalProperty) throw new Error("Property is required before promoting.");

      // Load intake files fresh
      const { data: fileRows, error: filesErr } = await supabase
        .from("intake_files")
        .select("id, file_name, bucket, object_path, size_bytes, mime_type")
        .eq("intake_item_id", id)
        .order("file_name", { ascending: true });

      if (filesErr) throw new Error(filesErr.message);

      const intakeFiles = (fileRows ?? []) as IntakeFile[];
      if (intakeFiles.length === 0) throw new Error("No files found to promote.");

      // Create asset
      const assetPayload: Record<string, any> = {
        title: finalName,
        name: finalName,
        category: finalCategory,
        property: finalProperty,
        sub_property: subProperty.trim() || null,
        tags,
        notes: notes.trim() || null,
        created_by: session.user.id,
      };

      const { data: assetRow, error: assetErr } = await supabase
        .from("assets")
        .insert(assetPayload)
        .select("id")
        .single();

      if (assetErr) throw new Error(assetErr.message);

      const assetId: string = assetRow.id;
      setPromotedAssetId(assetId);

      // Copy files to assets bucket
      const newAssetFiles: Record<string, any>[] = [];

      for (const f of intakeFiles) {
        const fromBucket = f.bucket || "intake";
        const fromPath = f.object_path;
        const originalName = f.file_name;

        const { data: signed, error: signedErr } = await supabase.storage
          .from(fromBucket)
          .createSignedUrl(fromPath, 60 * 10);
        if (signedErr) throw new Error(signedErr.message);

        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error(`Failed to download "${originalName}" from intake (HTTP ${res.status}).`);

        const blob = await res.blob();

        const safeName = originalName.replaceAll("/", "_");
        const toPath = `${assetId}/${crypto.randomUUID()}-${safeName}`;

        const { error: upErr } = await supabase.storage.from("assets").upload(toPath, blob, {
          upsert: false,
          contentType: f.mime_type || blob.type || undefined,
        });

        if (upErr) throw new Error(upErr.message);

        newAssetFiles.push({
          asset_id: assetId,
          bucket: "assets",
          object_path: toPath,
          file_name: originalName,
          mime_type: f.mime_type || blob.type || null,
          size_bytes: f.size_bytes ?? blob.size ?? null,
        });
      }

      const { error: afErr } = await supabase.from("asset_files").insert(newAssetFiles);
      if (afErr) throw new Error(afErr.message);

      // Mark intake promoted
      const { error: updErr } = await supabase.from("intake_items").update({ status: "promoted" }).eq("id", id);
      if (updErr) throw new Error(updErr.message);

      // Cleanup intake originals (Mode 1)
      const deletedCount = await deleteIntakeOriginals(id);

      await supabase.from("audit_log").insert({
        actor: session.user.id,
        action: "intake_promote_and_cleanup",
        target_type: "asset",
        target_id: assetId,
        details: { intake_item_id: id, fileCount: intakeFiles.length, deletedIntakeFiles: deletedCount },
      });

      setPromoteDone(true);
      setMsg(`✅ File addition complete. Promoted ${intakeFiles.length} file(s) to Assets and removed Intake originals.`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function finalizeDone() {
    // Your desired “File Addition complete” button behavior
    // Choose your next step. Easiest: go back to intake queue.
    router.push("/intake");
  }

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Intake Item</h1>
          <div className="text-xs text-gray-500">{id}</div>
        </div>

        <div className="flex gap-2 items-center">
          <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/intake")}>
            Back
          </button>

          <button
            className="border rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
            onClick={save}
            disabled={busy || item?.status !== "unsorted"}
            title={item?.status !== "unsorted" ? "Locked after promote/archival" : "Save metadata"}
          >
            {busy ? "Working..." : "Save"}
          </button>

          <button
            className="border rounded-lg px-3 py-2 bg-emerald-600 text-white disabled:opacity-50"
            onClick={promote}
            disabled={busy || !item}
            title="Promote to Assets"
          >
            {busy ? "Promoting..." : "Promote"}
          </button>

          {promoteDone && (
            <button
              className="border rounded-lg px-3 py-2 bg-blue-600 text-white"
              onClick={finalizeDone}
              title="Finalize and return to Intake queue"
            >
              File Addition Complete
            </button>
          )}
        </div>
      </div>

      {(promoteDone || msg) && (
        <div className="border rounded-xl p-3 bg-green-50 text-sm">
          <div className="font-medium">✅ Status</div>
          <div className="mt-1">{msg ?? "Ready to finalize."}</div>
          {promotedAssetId && (
            <div className="mt-1 text-xs text-gray-600">Asset ID: {promotedAssetId}</div>
          )}
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}

      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Metadata</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="w-full border rounded-lg p-2"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            placeholder="Name (defaults from first file name)"
            disabled={item?.status !== "unsorted"}
          />
          <input
            className="w-full border rounded-lg p-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (Helmet, Armor, Weapon, Figurine...)"
            disabled={item?.status !== "unsorted"}
          />
          <input
            className="w-full border rounded-lg p-2"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
            placeholder="Property (Star Wars, Marvel, Warhammer...)"
            disabled={item?.status !== "unsorted"}
          />
          <input
            className="w-full border rounded-lg p-2"
            value={subProperty}
            onChange={(e) => setSubProperty(e.target.value)}
            placeholder="Sub-property (Clone Wars, ROTJ, Mk 3...)"
            disabled={item?.status !== "unsorted"}
          />
        </div>

        <textarea
          className="w-full border rounded-lg p-2"
          rows={3}
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Tags (comma separated): ironman, helmet, marvel, mk3"
          disabled={item?.status !== "unsorted"}
        />

        <textarea
          className="w-full border rounded-lg p-2"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          disabled={item?.status !== "unsorted"}
        />
      </section>

      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Files (Intake Originals)</h2>

        {files.length === 0 ? (
          <div className="text-sm text-gray-600">
            No intake originals remain for this item (cleaned up).
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.file_name}</div>
                  <div className="text-xs text-gray-500">
                    {f.bucket} • {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : "—"}
                  </div>
                </div>
                <button className="border rounded-lg px-3 py-2" onClick={() => openFile(f)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
