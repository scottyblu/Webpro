import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { ClubSettings } from "@/lib/types";

export async function getSettings(supabase: SupabaseClient): Promise<ClubSettings> {
  const { data } = await supabase.from("club_settings").select("*").eq("id", 1).maybeSingle();
  // Columns added by newer SQL files may be missing until those files are run; fall back to defaults.
  const row = Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => v !== null && v !== undefined));
  return {
    id: 1,
    admin_name: null,
    admin_email: null,
    admin_phone: null,
    zelle_recipient_name: null,
    zelle_contact: null,
    venmo_username: null,
    notification_emails: [],
    updated_at: new Date().toISOString(),
    ...DEFAULT_SETTINGS,
    ...row,
  } as ClubSettings;
}
