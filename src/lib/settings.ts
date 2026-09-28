import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { ClubSettings } from "@/lib/types";

export async function getSettings(supabase: SupabaseClient): Promise<ClubSettings> {
  const { data } = await supabase.from("club_settings").select("*").eq("id", 1).maybeSingle();
  return {
    id: 1,
    admin_name: null,
    admin_email: null,
    admin_phone: null,
    zelle_recipient_name: null,
    zelle_contact: null,
    updated_at: new Date().toISOString(),
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
  } as ClubSettings;
}
