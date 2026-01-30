"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type IntakeItemRow = {
  id: string;
  created_at: string;
  raw_name: string | null;
  status: "unsorted" | "promoted" | "archived";
  category: string | null;
  property: string | null;
  tags: string[];
};

export default function IntakePage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const month = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [source, setSource] = useState<string>("");
  const [rawName, setRawName] = useState<string>("");
  const [files, setFiles] = useState<FileList | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [queue, setQueue] = useState<IntakeItemRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function loadQueue() {
    setQueueLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("intake_items")
      .select("id, created_at, raw_name, status, category, property, tags")
      .eq("status", "unsorted")
      .order("created_at", { ascending: false })
      .limit(50);

    setQueueLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    setQueue((data ?? []) as IntakeItemRow[]);
  }

  useEffect(() => {
    if (!loading && session) loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    setBusy(true);
    setMsg(null);
    setErr(null);

    try {
      if (!files || files.length === 0) throw new Error("Select one or more files to upload.");

      // Create a monthly batch
      const { data: batchData, error: batchErr } = await supabase
        .from("intake_batches")
        .insert({
          month,
          source: source.trim() || null,
          created_by: session.user.id,
        })
        .select("id")
        .single();

      if (batchErr) throw batchErr;
      const batchId = batchData.id as string;

      // Create intake item
      const itemName = rawName.trim() || `Upload ${new Date().toLocaleString()}`;

      const { data: itemData, error: itemErr } = await supabase
        .from("intake_items")
        .insert({
          batch_id: batchId,
          uploader: session.user.id,
          status: "unsorted",
          raw_name: itemName,
          tags: [],
        })
        .select("id")
        .single();

      if (itemErr) throw itemErr;
      const intakeItemId = itemData.id as string;

      // Upload each file to Storage + record it
      const uploaded: {
        object_path: string;
        file_name: string;
        mime_type: string | null;
        size_bytes: number;
      }[] = [];

      for (const f of Array.from(files)) {
        const safeName = f.name.replaceAll("/", "_");
        const objectPath = `${session.user.id}/${month}/${intakeItemId}/${crypto.randomUUID()}-${safeName}`;

        const { error: upErr } = await supabase.storage.from("intake").upload(objectPath, f, {
          upsert: false,
          contentType: f.type || undefined,
        });

        if (upErr) throw upErr;

        uploaded.push({
          object_path: objectPath,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
        });
      }

      const { error: filesErr } = await supabase.from("intake_files").insert(
        uploaded.map((u) => ({
          intake_item_id: intakeItemId,
          bucket: "intake",
          object_path: u.object_path,
          file_name: u.file_name,
          mime_type: u.mime_type,
          size_bytes: u.size_bytes,
        }))
      );

      if (filesErr) throw filesErr;

      // Audit log (best-effort)
      await supabase.from("audit_log").insert({
        actor: session.user.id,
        action: "intake_upload",
        target_type: "intake_item",
        target_id: intakeItemId,
        details: { month, source: source.trim() || null, fileCount: files.length },
      });

      setMsg(`Uploaded ${files.length} file(s) into Intake.`);
      setRawName("");
      setSource("");
      setFiles(null);

      const input = document.getElementById("fileInput") as HTMLInputElement | null;
      if (input) input.value = "";

      await loadQueue();
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
        <h1 className="text-2xl font-semibold">Intake</h1>
        <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/library")}>
          Back to Library
        </button>
      </div>

      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Bulk Upload</h2>
        <p className="text-sm text-gray-600">
          Upload files into <strong>Intake</strong> for later sorting. Current batch month: <strong>{month}</strong>
        </p>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="w-full border rounded-lg p-2"
              placeholder="Optional: Intake item name (e.g., 'January Patreon drop')"
              value={rawName}
              onChange={(e) => setRawName(e.target.value)}
            />
            <input
              className="w-full border rounded-lg p-2"
              placeholder="Optional: Source (Printables, Patreon, etc.)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          <input
            id="fileInput"
            className="w-full border rounded-lg p-2"
            type="file"
            multiple
            onChange={(e) => setFiles(e.target.files)}
          />

          {err && <div className="text-sm text-red-600">{err}</div>}
          {msg && <div className="text-sm text-green-700">{msg}</div>}

          <button
            disabled={busy}
            className="rounded-lg px-4 py-2 border bg-black text-white disabled:opacity-50"
            type="submit"
          >
            {busy ? "Uploading..." : "Upload to Intake"}
          </button>
        </form>
      </section>

      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Unsorted Intake Queue</h2>
          <button className="border rounded-lg px-3 py-2" onClick={loadQueue} disabled={queueLoading}>
            Refresh
          </button>
        </div>

        {queueLoading ? (
          <div className="text-sm text-gray-600">Loading queue…</div>
        ) : queue.length === 0 ? (
          <div className="text-sm text-gray-600">No unsorted items yet.</div>
        ) : (
          <div className="space-y-2">
            {queue.map((q) => (
              <div
                key={q.id}
                className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/intake/${q.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/intake/${q.id}`);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{q.raw_name ?? "(no name)"}</div>
                  <div className="text-xs text-gray-500">{new Date(q.created_at).toLocaleString()}</div>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Category: {q.category ?? "—"} • Property: {q.property ?? "—"} • Tags:{" "}
                  {q.tags?.length ? q.tags.join(", ") : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-1">ID: {q.id}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
