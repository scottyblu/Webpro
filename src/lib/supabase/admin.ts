import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES Row Level Security.
 * Only use on the server AFTER the caller has been authorized
 * (requireAdmin / requireMember) or inside the verified Stripe webhook.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
