"use client";

import { useEffect, useMemo, useState } from "react";
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

type FacetRow = {
  category: string | null;
  property: string | null;
  sub_property: string | null;
};

function norm(v: string | null | undefined) {
  return (v ?? "").trim();
}

function uniqSorted(values: (string | null | undefined)[]) {
  const out = Array.from(new Set(values.map((v) => norm(v)).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export default function AssetsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [facetRows, setFacetRows] = useState<FacetRow[]>([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [prop, setProp] = useState("");
  const [sub, setSub] = useState("");

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function loadAll() {
    setBusy(true);
    setErr(null);

    // Pull a reasonable chunk for MVP (client-side filtering)
    const { data, error } = await supabase
      .from("assets")
      .select("id, created_at, name, title, category, property, sub_property, tags")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    const rows = (data ?? []) as AssetRow[];
    setAssets(rows);

    // Facets can be derived from the same pull
    setFacetRows(
      rows.map((r) => ({
        category: r.category,
        property: r.property,
        sub_property: r.sub_property,
      }))
    );

    setBusy(false);
  }

  useEffect(() => {
    if (!loading && session) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  // When category changes, clear downstream filters
  useEffect(() => {
    setProp("");
    setSub("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  useEffect(() => {
    setSub("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop]);

  const categoryOptions = useMemo(() => uniqSorted(facetRows.map((r) => r.category)), [facetRows]);

  const propertyOptions = useMemo(() => {
    if (!cat) return uniqSorted(facetRows.map((r) => r.property));
    return uniqSorted(
      facetRows
        .filter((r) => norm(r.category) === cat)
        .map((r) => r.property)
    );
  }, [facetRows, cat]);

  const subPropertyOptions = useMemo(() => {
    return uniqSorted(
      facetRows
        .filter((r) => {
          const cOk = cat ? norm(r.category) === cat : true;
          const pOk = prop ? norm(r.property) === prop : true;
          return cOk && pOk;
        })
        .map((r) => r.sub_property)
    );
  }, [facetRows, cat, prop]);

  // Counts for facet lists (computed from current asset set)
  const counts = useMemo(() => {
    const catCount = new Map<string, number>();
    const propCount = new Map<string, number>();
    const subCount = new Map<string, number>();

    for (const a of assets) {
      const c = norm(a.category);
      const p = norm(a.property);
      const s = norm(a.sub_property);

      if (c) catCount.set(c, (catCount.get(c) ?? 0) + 1);

      // property counts depend on chosen category context
      if (p) {
        const key = cat ? `${c}||${p}` : p;
        // if cat is selected, only count properties inside that category
        if (!cat || c === cat) propCount.set(key, (propCount.get(key) ?? 0) + 1);
      }

      // sub-property counts depend on chosen cat/prop context
      if (s) {
        const key = `${c}||${p}||${s}`;
        const cOk = cat ? c === cat : true;
        const pOk = prop ? p === prop : true;
        if (cOk && pOk) subCount.set(key, (subCount.get(key) ?? 0) + 1);
      }
    }

    return { catCount, propCount, subCount };
  }, [assets, cat, prop]);

  const filteredAssets = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return assets.filter((a) => {
      const c = norm(a.category);
      const p = norm(a.property);
      const s = norm(a.sub_property);

      if (cat && c !== cat) return false;
      if (prop && p !== prop) return false;
      if (sub && s !== sub) return false;

      if (!qq) return true;

      const hay = [
        a.title ?? "",
        a.name ?? "",
        c,
        p,
        s,
        ...(a.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [assets, q, cat, prop, sub]);

  function clearFilters() {
    setQ("");
    setCat("");
    setProp("");
    setSub("");
  }

  if (loading) return <main className="p-6">Loading…</main>;
  if (!session) return <main className="p-6">Redirecting…</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Assets</h1>

        <div className="flex gap-2 flex-wrap">
          <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/admin/bulk-fix")}>
            Bulk Fix Metadata
          </button>

          <button className="border rounded-lg px-3 py-2" onClick={loadAll} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>

          <button className="border rounded-lg px-3 py-2" onClick={clearFilters} disabled={busy}>
            Clear Filters
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* LEFT: NAV / FILTERS */}
        <aside className="border rounded-xl p-4 space-y-4 h-fit">
          <div className="space-y-2">
            <div className="text-sm font-medium">Search</div>
            <input
              className="w-full border rounded-lg p-2"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, tags, property…"
            />
            <div className="text-xs text-gray-500">
              Showing <strong>{filteredAssets.length}</strong> of <strong>{assets.length}</strong>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Category</div>
            <div className="space-y-1 max-h-56 overflow-auto">
              <button
                className={`w-full text-left border rounded-lg px-3 py-2 ${cat === "" ? "bg-gray-50" : ""}`}
                onClick={() => setCat("")}
              >
                All <span className="text-xs text-gray-500">({assets.length})</span>
              </button>

              {categoryOptions.map((c) => (
                <button
                  key={c}
                  className={`w-full text-left border rounded-lg px-3 py-2 ${cat === c ? "bg-gray-50" : ""}`}
                  onClick={() => setCat(c)}
                >
                  {c}{" "}
                  <span className="text-xs text-gray-500">({counts.catCount.get(c) ?? 0})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Property</div>
            <div className="space-y-1 max-h-56 overflow-auto">
              <button
                className={`w-full text-left border rounded-lg px-3 py-2 ${prop === "" ? "bg-gray-50" : ""}`}
                onClick={() => setProp("")}
                disabled={propertyOptions.length === 0}
              >
                All
              </button>

              {propertyOptions.map((p) => {
                const key = cat ? `${cat}||${p}` : p;
                const n = counts.propCount.get(key) ?? 0;

                return (
                  <button
                    key={p}
                    className={`w-full text-left border rounded-lg px-3 py-2 ${prop === p ? "bg-gray-50" : ""}`}
                    onClick={() => setProp(p)}
                  >
                    {p} <span className="text-xs text-gray-500">({n})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Sub-property</div>
            <div className="space-y-1 max-h-56 overflow-auto">
              <button
                className={`w-full text-left border rounded-lg px-3 py-2 ${sub === "" ? "bg-gray-50" : ""}`}
                onClick={() => setSub("")}
                disabled={subPropertyOptions.length === 0}
              >
                All
              </button>

              {subPropertyOptions.map((s) => {
                // counts keyed by full triple; we’ll compute it with current cat/prop context
                // If cat/prop is blank, we still show the option but count may be 0 unless it matches selected context.
                // For display purposes, best-effort count:
                const bestCat = cat || "";
                const bestProp = prop || "";
                const key =
                  bestCat && bestProp ? `${bestCat}||${bestProp}||${s}` : `${""}||${""}||${s}`;

                // Better: sum counts across all categories/properties if cat/prop not selected
                let n = 0;
                if (cat && prop) {
                  n = counts.subCount.get(`${cat}||${prop}||${s}`) ?? 0;
                } else {
                  // sum all occurrences of this sub_property within current context
                  for (const a of assets) {
                    const c = norm(a.category);
                    const p = norm(a.property);
                    const sp = norm(a.sub_property);
                    const cOk = cat ? c === cat : true;
                    const pOk = prop ? p === prop : true;
                    if (cOk && pOk && sp === s) n += 1;
                  }
                }

                return (
                  <button
                    key={s}
                    className={`w-full text-left border rounded-lg px-3 py-2 ${sub === s ? "bg-gray-50" : ""}`}
                    onClick={() => setSub(s)}
                  >
                    {s} <span className="text-xs text-gray-500">({n})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT: RESULTS */}
        <section className="space-y-3">
          {busy ? (
            <div className="text-sm text-gray-600">Loading assets…</div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-sm text-gray-600">No assets match your filters.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.map((a) => (
                <div
                  key={a.id}
                  className="border rounded-xl p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/assets/${a.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/assets/${a.id}`);
                  }}
                >
                  <div className="font-medium">{a.title || a.name || "(untitled)"}</div>

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
        </section>
      </div>
    </main>
  );
}
