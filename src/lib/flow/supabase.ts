import { createClient } from "@supabase/supabase-js";

// Admin client using service role key — only used in API routes (server-side)
// Auth is handled by MSAL, not Supabase Auth, so we need full access
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
