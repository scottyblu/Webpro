"use client";
import { createBrowserClient } from "@supabase/ssr";
import { normalizeKey, normalizeSupabaseUrl } from "./config";

export function createClient() {
  return createBrowserClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    normalizeKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
