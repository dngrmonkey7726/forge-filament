"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type FieldKey = "category" | "property" | "sub_property";

type FacetRow = {
  category: string | null;
  property: string | null;
  sub_property: string | null;
};

function uniqSorted(values: (string | null | undefined)[]) {
  const out = Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export default function BulkFixPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const [facetRows, setFacetRows] = useState<FacetRow[]>([]);
  const [facetLoading, setFacetLoading] = useState(false);

  const [field, setField] = useState<FieldKey>("category");
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");

  const [includeIntake, setIncludeIntake] = useState(false);

  const [previewCountAssets, setPreviewCountAssets] = useState<number | null>(null);
  const [previewCountIntake, setPreviewCountIntake] = useState<number | null>(null);
  const [previewIds, setPreviewIds] = useState<string[]>([]);

  const [confirmText, setConfirmText] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function loadFacets() {
    setFacetLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("assets")
      .select("category, property, sub_property")
      .limit(5000);

    setFacetLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    setFacetRows((data ?? []) as FacetRow[]);
  }

  useEffect(() => {
    if (!loading && session) loadFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  const options = useMemo(() => {
    if (field === "category") return uniqSorted(facetRows.map((r) => r.category));
    if (field === "property") return uniqSorted(facetRows.map((r) => r.property));
    return uniqSorted(facetRows.map((r) => r.sub_property));
  }, [facetRows, field]);

  function resetPreview() {
    setPreviewCountAssets(null);
    setPreviewCountIntake(null);
    setPreviewIds([]);
  }

  useEffect(() => {
    resetPreview();
    setMsg(null);
    setErr(null);
    setConfirmText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, fromValue, toValue, includeIntake]);

  async function preview() {
    setErr(null);
    setMsg(null);
    setPreviewIds([]);
    setPreviewCountAssets(null);
    setPreviewCountIntake(null);

    const from = fromValue.trim();
    if (!from) {
      setErr("Pick a FROM value to preview.");
      return;
    }

    // Count assets
    const { count: assetCount, error: assetCountErr } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq(field, from);

    if (assetCountErr) {
      setErr(assetCountErr.message);
      return;
    }
    setPreviewCountAssets(assetCount ?? 0);

    // Sample IDs (first 12)
    const { data: sampleRows, error: sampleErr } = await supabase
      .from("assets")
      .select("id")
      .eq(field, from)
      .order("created_at", { ascending: false })
      .limit(12);

    if (sampleErr) {
      setErr(sampleErr.message);
      return;
    }
    setPreviewIds((sampleRows ?? []).map((r: any) => r.id));

    // Optional intake preview (unsorted only, so we don't rewrite history unless you really want it)
    if (includeIntake) {
      const { count: intakeCount, error: intakeErr } = await supabase
        .from("intake_items")
        .select("id", { count: "exact", head: true })
        .eq(field, from)
        .eq("status", "unsorted");

      if (intakeErr) {
        setErr(intakeErr.message);
        return;
      }
      setPreviewCountIntake(intakeCount ?? 0);
    }
  }

  async function applyFix() {
    setErr(null);
    setMsg(null);

    const from = fromValue.trim();
    const to = toValue.trim();

    if (!from) return setErr("FROM value is required.");
    if (!to) return setErr("TO value is required.");
    if (from === to) return setErr("FROM and TO cannot be the same.");
    if (confirmText.trim().toUpperCase() !== "APPLY") {
      return setErr('Type APPLY in the confirmation box to run the bulk update.');
    }

    setBusy(true);

    try {
      // Assets update
      const { error: updErr } = await supabase
        .from("assets")
        .update({ [field]: to })
        .eq(field, from);

      if (updErr) throw new Error(`Assets update failed: ${updErr.message}`);

      // Optional intake update (unsorted only)
      if (includeIntake) {
        const { error: intakeUpdErr } = await supabase
          .from("intake_items")
          .update({ [field]: to })
          .eq(field, from)
          .eq("status", "unsorted");

        if (intakeUpdErr) throw new Error(`Intake update failed: ${intakeUpdErr.message}`);
      }

      // Audit log (best-effort)
      if (session) {
        await supabase.from("audit_log").insert({
          actor: session.user.id,
          action: "bulk_fix_metadata",
          target_type: "assets",
          target_id: null,
          details: {
            field,
            from,
            to,
            includeIntakeUnsrt: includeIntake,
            // preview counts (if user ran preview)
            previewAssets: previewCountAssets,
            previewIntake: previewCountIntake,
          },
        });
      }

      setMsg(`✅ Applied bulk fix: ${field} "${from}" → "${to}".`);
      setConfirmText("");
      await loadFacets();
      resetPreview();
      setFromValue("");
      setToValue("");
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
        <h1 className="text-2xl font-semibold">Admin • Bulk Fix Metadata</h1>
        <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/assets")}>
          Back to Assets
        </button>
      </div>

      <div className="border rounded-xl p-4 space-y-3">
        <div className="text-sm text-gray-700">
          This updates <strong>all Assets</strong> where a field matches a value (e.g. fix a typo like{" "}
          <code>Helmte</code> → <code>Helmet</code>).
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Field</label>
            <select
              className="w-full border rounded-lg p-2"
              value={field}
              onChange={(e) => setField(e.target.value as FieldKey)}
              disabled={busy}
            >
              <option value="category">category</option>
              <option value="property">property</option>
              <option value="sub_property">sub_property</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">FROM (existing value)</label>
            <select
              className="w-full border rounded-lg p-2"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              disabled={busy || facetLoading}
            >
              <option value="">Select…</option>
              {options.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500">Pulled from existing assets.</div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">TO (correct value)</label>
            <input
              className="w-full border rounded-lg p-2"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              placeholder='e.g. "Helmet"'
              disabled={busy}
            />
            <div className="text-xs text-gray-500">Type the corrected value exactly.</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="includeIntake"
            type="checkbox"
            checked={includeIntake}
            onChange={(e) => setIncludeIntake(e.target.checked)}
            disabled={busy}
          />
          <label htmlFor="includeIntake" className="text-sm">
            Also update <strong>unsorted intake_items</strong> (optional)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="border rounded-lg px-3 py-2"
            onClick={loadFacets}
            disabled={busy || facetLoading}
          >
            {facetLoading ? "Refreshing…" : "Refresh list"}
          </button>

          <button className="border rounded-lg px-3 py-2" onClick={preview} disabled={busy || !fromValue}>
            Preview impact
          </button>
        </div>

        {(previewCountAssets !== null || previewCountIntake !== null) && (
          <div className="border rounded-xl p-3 bg-gray-50 text-sm space-y-2">
            <div>
              <strong>Assets matching:</strong>{" "}
              {previewCountAssets !== null ? previewCountAssets : "—"}
            </div>
            {includeIntake && (
              <div>
                <strong>Unsorted intake_items matching:</strong>{" "}
                {previewCountIntake !== null ? previewCountIntake : "—"}
              </div>
            )}
            {previewIds.length > 0 && (
              <div>
                <div className="font-medium">Sample asset IDs:</div>
                <div className="text-xs text-gray-600 break-all">{previewIds.join(", ")}</div>
              </div>
            )}
          </div>
        )}

        <div className="border rounded-xl p-3 bg-yellow-50 text-sm space-y-2">
          <div className="font-medium">⚠️ Confirmation</div>
          <div>
            Type <strong>APPLY</strong> to enable the bulk update.
          </div>
          <input
            className="w-full border rounded-lg p-2"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type APPLY"
            disabled={busy}
          />
          <button
            className="border rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
            onClick={applyFix}
            disabled={busy}
          >
            {busy ? "Applying…" : "Apply bulk fix"}
          </button>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        {msg && <div className="text-sm text-green-700">{msg}</div>}
      </div>
    </main>
  );
}
