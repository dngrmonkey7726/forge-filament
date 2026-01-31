"use client";

import { useEffect, useMemo, useState } from "react";
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

const UNSPECIFIED = "__UNSPECIFIED__";

function uniqSorted(values: (string | null | undefined)[]) {
  const out = Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export default function AssetsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  // Selected filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [selectedSubProperty, setSelectedSubProperty] = useState<string | null>(null);

  // Left-nav options
  const [categories, setCategories] = useState<string[]>([]);
  const [propertiesByCategory, setPropertiesByCategory] = useState<Record<string, string[]>>({});
  const [subPropsByCatProp, setSubPropsByCatProp] = useState<Record<string, string[]>>({});

  // Assets list
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingNav, setLoadingNav] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  function goToAsset(id: string) {
    router.push(`/assets/${id}`);
  }

  // Load the nav tree from assets table
  async function loadNav() {
    setLoadingNav(true);
    setErr(null);

    const { data, error } = await supabase.from("assets").select("category, property, sub_property").limit(5000);

    setLoadingNav(false);

    if (error) {
      setErr(error.message);
      return;
    }

    const rows = (data ?? []) as Array<{
      category: string | null;
      property: string | null;
      sub_property: string | null;
    }>;

    const cats = uniqSorted(rows.map((r) => r.category));
    setCategories(cats);

    const propsMap: Record<string, string[]> = {};
    const subMap: Record<string, string[]> = {};

    for (const c of cats) {
      const props = uniqSorted(
        rows.filter((r) => (r.category ?? "").trim() === c).map((r) => r.property)
      );
      propsMap[c] = props;

      for (const p of props) {
        const key = `${c}|||${p}`;

        const scoped = rows.filter(
          (r) => (r.category ?? "").trim() === c && (r.property ?? "").trim() === p
        );

        const subs = uniqSorted(scoped.map((r) => r.sub_property));

        const hasUnspecified = scoped.some((r) => ((r.sub_property ?? "").trim().length === 0));
        subMap[key] = hasUnspecified ? [UNSPECIFIED, ...subs] : subs;
      }
    }

    setPropertiesByCategory(propsMap);
    setSubPropsByCatProp(subMap);
  }

  // Load assets list based on selected filters
  async function loadAssets() {
    setLoadingAssets(true);
    setErr(null);

    let q = supabase
      .from("assets")
      .select("id, title, category, property, sub_property, tags, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (selectedCategory) q = q.eq("category", selectedCategory);
    if (selectedProperty) q = q.eq("property", selectedProperty);

    if (selectedSubProperty) {
      if (selectedSubProperty === UNSPECIFIED) {
        q = q.or("sub_property.is.null,sub_property.eq.");
      } else {
        q = q.eq("sub_property", selectedSubProperty);
      }
    }

    const { data, error } = await q;

    setLoadingAssets(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setAssets((data ?? []) as AssetRow[]);
  }

  useEffect(() => {
    if (!loading && session) {
      loadNav();
      loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  useEffect(() => {
    if (!loading && session) loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedProperty, selectedSubProperty]);

  function clearFilters() {
    setSelectedCategory(null);
    setSelectedProperty(null);
    setSelectedSubProperty(null);
  }

  function pickCategory(c: string) {
    setSelectedCategory((prev) => (prev === c ? null : c));
    setSelectedProperty(null);
    setSelectedSubProperty(null);
  }

  function pickProperty(p: string) {
    setSelectedProperty((prev) => (prev === p ? null : p));
    setSelectedSubProperty(null);
  }

  function pickSubProperty(s: string) {
    setSelectedSubProperty((prev) => (prev === s ? null : s));
  }

  if (loading) return <main className="p-6">Loading...</main>;
  if (!session) return <main className="p-6">Redirecting...</main>;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets Library</h1>
        <div className="flex gap-2">
          <button className="border rounded-lg px-3 py-2" onClick={() => router.push("/library")}>
            Back to Library
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* LEFT NAV */}
        <aside className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Browse</h2>
            <button
              className="text-sm underline disabled:opacity-50"
              onClick={clearFilters}
              disabled={!selectedCategory && !selectedProperty && !selectedSubProperty}
              title="Clear selections"
            >
              Clear
            </button>
          </div>

          {loadingNav ? (
            <div className="text-sm text-gray-600">Loading categories…</div>
          ) : categories.length === 0 ? (
            <div className="text-sm text-gray-600">No categories yet.</div>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => {
                const isOpen = selectedCategory === c;
                const props = propertiesByCategory[c] ?? [];

                return (
                  <div key={c} className="border rounded-lg">
                    <button
                      className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50"
                      onClick={() => pickCategory(c)}
                      title="Toggle category"
                    >
                      <span className="font-medium">{c}</span>
                      <span className="text-xs text-gray-500">{isOpen ? "▾" : "▸"}</span>
                    </button>

                    {isOpen && (
                      <div className="px-2 pb-2 space-y-1">
                        {props.length === 0 ? (
                          <div className="text-xs text-gray-500 px-2 py-1">No properties</div>
                        ) : (
                          props.map((p) => {
                            const propOpen = selectedProperty === p;
                            const subs = subPropsByCatProp[`${c}|||${p}`] ?? [];

                            return (
                              <div key={p} className="ml-1">
                                <button
                                  className={`w-full text-left px-2 py-1 rounded hover:bg-gray-50 ${
                                    propOpen ? "bg-gray-50" : ""
                                  }`}
                                  onClick={() => pickProperty(p)}
                                  title="Toggle property"
                                >
                                  <span className="text-sm">{p}</span>{" "}
                                  <span className="text-xs text-gray-500">{propOpen ? "▾" : "▸"}</span>
                                </button>

                                {propOpen && (
                                  <div className="ml-3 mt-1 space-y-1">
                                    {subs.length === 0 ? (
                                      <div className="text-xs text-gray-500 px-2 py-1">No sub-properties</div>
                                    ) : (
                                      subs.map((s) => (
                                        <button
                                          key={s}
                                          className={`w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-sm ${
                                            selectedSubProperty === s ? "bg-gray-50" : ""
                                          }`}
                                          onClick={() => pickSubProperty(s)}
                                          title="Select sub-property"
                                        >
                                          {s === UNSPECIFIED ? "Unspecified" : s}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* MAIN PANE */}
        <section className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Results</div>
              <div className="text-xs text-gray-600">
                {selectedCategory ? selectedCategory : "All Categories"}
                {selectedProperty ? ` → ${selectedProperty}` : ""}
                {selectedSubProperty
                  ? ` → ${selectedSubProperty === UNSPECIFIED ? "Unspecified" : selectedSubProperty}`
                  : ""}
              </div>
            </div>
            <button className="border rounded-lg px-3 py-2" onClick={loadAssets} disabled={loadingAssets}>
              Refresh
            </button>
          </div>

          {loadingAssets ? (
            <div className="text-sm text-gray-600">Loading assets…</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-gray-600">No matching assets.</div>
          ) : (
            <div className="space-y-2">
              {assets.map((a) => (
                <div
                  key={a.id}
                  className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => goToAsset(a.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToAsset(a.id);
                    }
                  }}
                  title="Click to edit"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.title}</div>
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

                    <button
                      className="border rounded-lg px-3 py-2 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToAsset(a.id);
                      }}
                      title="Edit this asset"
                    >
                      Edit
                    </button>
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
