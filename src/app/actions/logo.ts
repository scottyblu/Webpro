"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { LOGO_VARIANTS, type LogoImages } from "@/lib/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const MAX_TOTAL_BYTES = 3_000_000;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

function saveError(message: string): string {
  if (/logo_images|logo_updated_at/.test(message)) {
    return "The database needs updating: run supabase/migrations/0006_club_logo.sql in the Supabase SQL Editor.";
  }
  return `Could not save the logo: ${message}`;
}

/** Save the firehouse logo (already resized in the browser into each size the app needs). */
export async function saveLogo(images: LogoImages): Promise<ActionState> {
  await requireAdmin();
  const clean: LogoImages = {};
  let total = 0;
  for (const variant of LOGO_VARIANTS) {
    const value = images?.[variant];
    if (typeof value !== "string" || !PNG_DATA_URL.test(value)) return { error: "That image couldn't be read. Please try a PNG or JPG file." };
    total += value.length;
    clean[variant] = value;
  }
  if (total > MAX_TOTAL_BYTES) return { error: "That image is too detailed to use as a logo. Please try a smaller or simpler image." };

  const db = createAdminClient();
  const { error } = await db
    .from("club_settings")
    .update({ logo_images: clean, logo_updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: saveError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Logo saved. It now shows on the login screen, in the menu and as the app icon." };
}

/** Go back to the default Breakfast Club icon. */
export async function removeLogo(): Promise<ActionState> {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from("club_settings").update({ logo_images: null, logo_updated_at: null }).eq("id", 1);
  if (error) return { error: saveError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Logo removed. The default icon is back." };
}
