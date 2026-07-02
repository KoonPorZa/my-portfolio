import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public browser Supabase client (anon key) used only for the live-location
// realtime subscription on /trip/001. The anon key is public/safe for the
// browser; all writes still go through the Railway service-role backend.
// Returns null when the public env vars are not configured.
let cached: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached =
    url && anonKey
      ? createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 5 } },
        })
      : null;

  return cached;
}
