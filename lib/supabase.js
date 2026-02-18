import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const hasSupabase = Boolean(supabaseUrl && supabaseKey);

if (!hasSupabase) {
  console.warn("Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and a key to use Supabase REST.");
}

const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

export { supabase, hasSupabase };
