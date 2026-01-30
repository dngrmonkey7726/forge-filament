import { supabase } from "@/lib/supabaseClient";

export default async function TestPage() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);

  return (
    <main style={{ padding: 24 }}>
      <h1>Supabase Connection Test</h1>
      <pre>{JSON.stringify({ ok: !error, error, data }, null, 2)}</pre>
    </main>
  );
}
