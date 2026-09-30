import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The firehouse logo uploaded in Settings, stored as ready-sized PNG data URLs:
 *  - mark        the logo itself (transparent background), shown next to the club name
 *  - icon192/512 the app icon (logo on a white square)
 *  - apple180    the iPhone home-screen icon
 *  - maskable512 the Android adaptive icon (extra padding so nothing is cropped)
 */
export const LOGO_VARIANTS = ["mark", "icon192", "icon512", "apple180", "maskable512"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];
export type LogoImages = Partial<Record<LogoVariant, string>>;

/** Default icons used until a logo is uploaded. */
export const DEFAULT_LOGO_FILES: Record<LogoVariant, string> = {
  mark: "/icons/icon-192.png",
  icon192: "/icons/icon-192.png",
  icon512: "/icons/icon-512.png",
  apple180: "/icons/apple-180.png",
  maskable512: "/icons/maskable-512.png",
};

/** When the logo was last changed (used to refresh cached images), or null if there is none. */
export const getLogoVersion = cache(async (): Promise<string | null> => {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("club_settings").select("logo_updated_at").eq("id", 1).maybeSingle();
    if (error || !data?.logo_updated_at) return null;
    return String(new Date(data.logo_updated_at as string).getTime());
  } catch {
    return null; // Not configured yet, or SQL file 0006 not run: use the default logo.
  }
});

export async function getLogoImage(variant: LogoVariant): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("club_settings").select("logo_images").eq("id", 1).maybeSingle();
    if (error) return null;
    return ((data?.logo_images as LogoImages | null) ?? {})[variant] ?? null;
  } catch {
    return null;
  }
}
