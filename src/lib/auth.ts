import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminUser, Member } from "@/lib/types";

/** The verified signed-in user (validated with Supabase Auth, not just read from the cookie). */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getAdminRecord = cache(async (): Promise<AdminUser | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("admin_users").select("*").eq("user_id", user.id).maybeSingle();
  return (data as AdminUser | null) ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Server-side admin gate. Use at the top of every admin page, route handler and server action.
 * Redirects signed-out users to /login and non-admins to their member dashboard.
 */
export async function requireAdmin() {
  const user = await requireUser();
  const admin = await getAdminRecord();
  if (!admin) redirect("/dashboard");
  return { user, admin };
}

/** The member record belonging to the signed-in user (null if there is none, e.g. an admin-only account). */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle();
  return (data as Member | null) ?? null;
});
