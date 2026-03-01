import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Admin client using service role key — only used in API routes (server-side)
// Auth is handled by MSAL, not Supabase Auth, so we need full access
// Lazy-initialized to avoid build errors when env vars aren't set locally
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Lazy proxy so `import { supabase }` still works without triggering at import time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient = new Proxy({} as any, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSupabase() as any)[prop];
  },
});
