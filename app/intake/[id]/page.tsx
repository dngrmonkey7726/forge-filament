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

type AssetFacetRow = {
  category: string | null;
  property: string | null;
  sub_property: string | null;
};

const ADD_NEW = "__ADD_NEW__";

function stripExt(filename: string) {
  const i = filename.lastIndexOf(".");
  if (i <= 0) return filename;
  return filename.slice(0, i);
}

function uniqSorted(values: (string | null | undefined)[]) {
  const out = Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
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

  // Promote UX flags
  const [promoteDone, setPromoteDone] = useState(false);
  const [promotedAssetId, setPromotedAssetId] = useState<string | null>(null);

  // Facet options (from assets)
  const [facetRows, setFacetRows] = useState<AssetFacetRow[]>([]);
  const [facetLoading, setFacetLoading] = useState(false);

  // Form state
  const [rawName, setRawName] = useState("");

  // dropdown selection state
  const [categoryPick, setCategoryPick] = useState<string>("");
  const [propertyPick, setPropertyPick] = useState<string>("");
  const [subPropertyPick, setSubPropertyPick] = useState<string>("");

  // add-new text state
  const [categoryNew, setCategoryNew] = useState("");
  const [propertyNew, setPropertyNew] = useState("");
  const [subPropertyNew, setSubPropertyNew] = useState("");

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

  // ✅ Effective values MUST be declared before option memos that use them
  const effectiveCategory = useMemo(() => {
    if (categoryPick === ADD_NEW) return categoryNew.trim();
    return categoryPick.trim();
  }, [categoryPick, categoryNew]);

  const effectiveProperty = useMemo(() => {
    if (propertyPick === ADD_NEW) return propertyNew.trim();
    return propertyPick.trim();
  }, [propertyPick, propertyNew]);

  const effectiveSubProperty = useMemo(() => {
    if (subPropertyPick === ADD_NEW) return subPropertyNew.trim();
    return subPropertyPick.trim();
  }, [subPropertyPick, subPropertyNew]);

  // Compute available dropdown options from facetRows
  const categoryOptions = useMemo(() => {
    return uniqSorted(facetRows.map((r) => r.category));
  }, [facetRows]);

  const propertyOptions = useMemo(() => {
    const cat = effectiveCategory;
    if (!cat) return uniqSorted(facetRows.map((r) => r.property));
    return uniqSorted(
      facetRows
        .filter((r) => (r.category ?? "").trim() === cat)
        .map((r) => r.property)
    );
  }, [facetRows, effectiveCategory]);

  const subPropertyOptions = useMemo(() => {
    const cat = effectiveCategory;
    const prop = effectiveProperty;

    if (!cat && !prop) return uniqSorted(facetRows.map((r) => r.sub_property));

    return uniqSorted(
      facetRows
        .filter((r) => {
          const rc = (r.category ?? "").trim();
          const rp = (r.property ?? "").trim();
          const catOk = cat ? rc === cat : true;
          const propOk = prop ? rp === prop : true;
          return catOk && propOk;
        })
        .map((r) => r.sub_property)
    );
  }, [facetRows, effectiveCategory, effectiveProperty]);

  async function loadFacets() {
    setFacetLoading(true);
    const { data, error } = await supabase
      .from("assets")
      .select("category, property, sub_property")
      .limit(5000);

    setFacetLoading(false);

    if (error) {
      console.warn("Facet load failed:", error.message);
      return;
    }
    setFacetRows((data ?? []) as AssetFacetRow[]);
  }

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

    // Populate picks from existing item values
    const itCat = (it.category ?? "").trim();
    const itProp = (it.property ?? "").trim();
    const itSub = (it.sub_property ?? "").trim();

    setCategoryPick(itCat);
    setPropertyPick(itProp);
    setSubPropertyPick(itSub);

    // reset add-new fields
    setCategoryNew("");
    setPropertyNew("");
    setSubPropertyNew("");

    setNotes(it.notes ?? "");
    setTagsText((it.tags ?? []).join(", "));

    if (it.status === "promoted") setPromoteDone(true);
  }

  useEffect(() => {
    if (!loading && session) {
      loadFacets();
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, id]);

  // When category changes, clear downstream selections
  useEffect(() => {
    setPropertyPick("");
    setPropertyNew("");
    setSubPropertyPick("");
    setSubPropertyNew("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryPick, categoryNew]);

  useEffect(() => {
    setSubPropertyPick("");
    setSubPropertyNew("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyPick, propertyNew]);

  async function save() {
    if (!id) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase
      .from("intake_items")
      .update({
        raw_name: rawName.trim() || null,
        category: effectiveCategory || null,
        property: effectiveProperty || null,
        sub_property: effectiveSubProperty || null,
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
      if (item.status !== "unsorted") {
        setPromoteDone(true);
        setMsg("✅ Already promoted. You can finalize this intake item.");
        return;
      }

      const finalName =
        (rawName || item.raw_name || "").trim() || (files.length ? stripExt(files[0].file_name) : "");

      const finalCategory = effectiveCategory;
      const finalProperty = effectiveProperty;

      if (!finalName) throw new Error("Name is required before promoting.");
      if (!finalCategory) throw new Error("Category is required before promoting.");
      if (!finalProperty) throw new Error("Property is required before promoting.");

      const { data: fileRows, error: filesErr } = await supabase
        .from("intake_files")
        .select("id, file_name, bucket, object_path, size_bytes, mime_type")
        .eq("intake_item_id", id)
        .order("file_name", { ascending: true });

      if (filesErr) throw new Error(filesErr.message);

      const intakeFiles = (fileRows ?? []) as IntakeFile[];
      if (intakeFiles.length === 0) throw new Error("No files found to promote.");

      const assetPayload: Record<string, any> = {
        title: finalName,
        name: finalName,
        category: finalCategory,
        property: finalProperty,
        sub_property: effectiveSubProperty || null,
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

      const { error: updErr } = await supabase.from("intake_items").update({ status: "promoted" }).eq("id", id);
      if (updErr) throw new Error(updErr.message);

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
      await loadFacets();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function finalizeDone() {
    router.push("/intake");
  }

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  const locked = item?.status !== "unsorted";

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
            disabled={busy || locked}
            title={locked ? "Locked after promote/archival" : "Save metadata"}
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
          {promotedAssetId && <div className="mt-1 text-xs text-gray-600">Asset ID: {promotedAssetId}</div>}
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}

      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Metadata</h2>
          <button className="border rounded-lg px-3 py-2 text-sm" onClick={loadFacets} disabled={facetLoading}>
            {facetLoading ? "Loading…" : "Refresh dropdowns"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="w-full border rounded-lg p-2"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            placeholder="Name (defaults from first file name)"
            disabled={locked}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Category *</label>
            <select
              className="w-full border rounded-lg p-2"
              value={categoryPick || ""}
              onChange={(e) => setCategoryPick(e.target.value)}
              disabled={locked}
            >
              <option value="">Select…</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={ADD_NEW}>Add new…</option>
            </select>

            {categoryPick === ADD_NEW && (
              <input
                className="w-full border rounded-lg p-2"
                value={categoryNew}
                onChange={(e) => setCategoryNew(e.target.value)}
                placeholder="New category name"
                disabled={locked}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Property *</label>
            <select
              className="w-full border rounded-lg p-2"
              value={propertyPick || ""}
              onChange={(e) => setPropertyPick(e.target.value)}
              disabled={locked}
            >
              <option value="">Select…</option>
              {propertyOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={ADD_NEW}>Add new…</option>
            </select>

            {propertyPick === ADD_NEW && (
              <input
                className="w-full border rounded-lg p-2"
                value={propertyNew}
                onChange={(e) => setPropertyNew(e.target.value)}
                placeholder="New property name"
                disabled={locked}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Sub-property</label>
            <select
              className="w-full border rounded-lg p-2"
              value={subPropertyPick || ""}
              onChange={(e) => setSubPropertyPick(e.target.value)}
              disabled={locked}
            >
              <option value="">(none)</option>
              {subPropertyOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={ADD_NEW}>Add new…</option>
            </select>

            {subPropertyPick === ADD_NEW && (
              <input
                className="w-full border rounded-lg p-2"
                value={subPropertyNew}
                onChange={(e) => setSubPropertyNew(e.target.value)}
                placeholder="New sub-property name"
                disabled={locked}
              />
            )}
          </div>
        </div>

        <textarea
          className="w-full border rounded-lg p-2"
          rows={3}
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Tags (comma separated): ironman, helmet, marvel, mk3"
          disabled={locked}
        />

        <textarea
          className="w-full border rounded-lg p-2"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          disabled={locked}
        />
      </section>

      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Files (Intake Originals)</h2>

        {files.length === 0 ? (
          <div className="text-sm text-gray-600">No intake originals remain for this item (cleaned up).</div>
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
