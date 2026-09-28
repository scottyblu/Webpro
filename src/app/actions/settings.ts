"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { notifyAdmins } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const settingsSchema = z.object({
  club_name: z.string().trim().min(1, "Enter the club name").max(100),
  monthly_fee: z.coerce.number().min(1, "Fee must be at least $1").max(10000),
  payment_due_day: z.coerce.number().int().min(1).max(28, "Due day must be between 1 and 28"),
  currency: z.literal("usd"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  admin_name: z.string().trim().max(120),
  admin_email: z.union([z.literal(""), z.string().trim().email("Enter a valid admin email")]),
  admin_phone: z.string().trim().max(30),
  zelle_recipient_name: z.string().trim().max(120),
  zelle_contact: z.string().trim().max(120),
  notification_emails: z.string().max(2000),
});

/** Split "a@x.com, b@y.com\nc@z.com" into a clean, de-duplicated list. */
function parseEmailList(raw: string): { emails: string[]; invalid: string | null } {
  const emails = [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const invalid = emails.find((e) => !z.string().email().safeParse(e).success) ?? null;
  return { emails, invalid };
}

export async function updateSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  const { emails, invalid } = parseEmailList(d.notification_emails);
  if (invalid) return { error: `"${invalid}" isn't a valid email address.` };
  if (emails.length > 10) return { error: "Please list at most 10 notification emails." };

  const db = createAdminClient();
  const { error } = await db
    .from("club_settings")
    .update({
      club_name: d.club_name,
      monthly_fee_cents: Math.round(d.monthly_fee * 100),
      payment_due_day: d.payment_due_day,
      currency: d.currency,
      timezone: d.timezone,
      admin_name: d.admin_name || null,
      admin_email: d.admin_email || null,
      admin_phone: d.admin_phone || null,
      zelle_recipient_name: d.zelle_recipient_name || null,
      zelle_contact: d.zelle_contact || null,
      notification_emails: emails,
    })
    .eq("id", 1);
  if (error) return { error: `Could not save settings: ${error.message}` };

  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

/** Send a test email to every notification address, so the admin can confirm email works. */
export async function sendTestEmail(): Promise<ActionState> {
  await requireAdmin();
  const result = await notifyAdmins(
    "admin_test",
    "Test email from The Breakfast Club app",
    `It works! This address will receive:\n\n  • an alert when a member says they sent a Zelle payment\n  • a list of who still owes, a few days after the due date\n  • a summary at the start of each month\n\nDashboard: ${siteUrl()}/admin`,
    "admin_test",
    { force: true },
  );
  if (result.error && result.sent === 0) return { error: result.error };
  if (result.recipients === 0) return { error: "Add at least one notification email above and click Save settings first." };
  if (result.failed > 0) return { error: `Sent ${result.sent}, failed ${result.failed}: ${result.error}` };
  return { ok: true, message: `Test email sent to ${result.sent} address${result.sent === 1 ? "" : "es"}. Check the inbox (and spam folder).` };
}

/** Grant admin access to someone who already has an account (they must register first). */
export async function addAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };

  const db = createAdminClient();
  const userId = await findAuthUserId(db, email.data);
  if (!userId) return { error: "No account with that email. Ask them to register first, then add them here." };

  const { error } = await db.from("admin_users").insert({ user_id: userId, email: email.data, role: "admin" });
  if (error) {
    if (error.code === "23505") return { error: "That person is already an administrator." };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: true, message: `${email.data} is now an administrator.` };
}

export async function removeAdmin(adminId: string): Promise<void> {
  const { admin } = await requireAdmin();
  if (admin.id === adminId) return; // Can't remove yourself.
  const db = createAdminClient();
  const { data: target } = await db.from("admin_users").select("role").eq("id", adminId).maybeSingle();
  if (!target) return;
  if (target.role === "owner" && admin.role !== "owner") return; // Only an owner can remove an owner.
  await db.from("admin_users").delete().eq("id", adminId);
  revalidatePath("/admin/settings");
}

async function findAuthUserId(db: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  // Fast path: registered users have a linked member record.
  const { data: member } = await db.from("members").select("user_id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).not("user_id", "is", null).maybeSingle();
  if (member?.user_id) return member.user_id as string;
  // Fallback: search auth users (admins without a member record).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
