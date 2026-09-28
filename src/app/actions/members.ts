"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { hasLiveSubscription } from "@/lib/billing";
import { siteUrl } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { syncSubscription } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState, Member } from "@/lib/types";

const ADMIN_PATHS = ["/admin", "/member-management", "/payment-management", "/reports"];
function revalidateAdmin(memberId?: string) {
  ADMIN_PATHS.forEach((p) => revalidatePath(p));
  if (memberId) revalidatePath(`/member-management/${memberId}`);
}

const memberSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the member's full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(30),
  joined_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid join date"),
  notes: z.string().trim().max(2000),
});

function parseMember(formData: FormData) {
  return memberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    joined_date: formData.get("joined_date"),
    notes: formData.get("notes") ?? "",
  });
}

async function loadMember(id: string): Promise<Member | null> {
  const db = createAdminClient();
  const { data } = await db.from("members").select("*").eq("id", id).maybeSingle();
  return (data as Member | null) ?? null;
}

export async function createMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseMember(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const db = createAdminClient();
  const { data, error } = await db
    .from("members")
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      joined_date: parsed.data.joined_date,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A member with that email already exists." };
    return { error: `Could not add member: ${error.message}` };
  }

  // Optionally email them an invite so they can log in and pay online.
  // When they accept, the database trigger links the login to this member record.
  if (formData.get("send_invite") === "on") {
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.full_name, phone: parsed.data.phone },
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    if (inviteError) console.error("[members] invite failed", inviteError);
  }

  revalidateAdmin();
  redirect(`/member-management/${data.id}?created=1`);
}

export async function updateMember(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseMember(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const member = await loadMember(memberId);
  if (!member) return { error: "Member not found." };

  const db = createAdminClient();
  const { error } = await db
    .from("members")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      joined_date: parsed.data.joined_date,
      notes: parsed.data.notes || null,
    })
    .eq("id", memberId);
  if (error) {
    if (error.code === "23505") return { error: "Another member already uses that email." };
    return { error: `Could not save: ${error.message}` };
  }

  if (member.stripe_customer_id) {
    try {
      await getStripe().customers.update(member.stripe_customer_id, {
        name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone || undefined,
      });
    } catch (err) {
      console.error("[members] Stripe customer update failed", err);
    }
  }

  revalidateAdmin(memberId);
  return { ok: true, message: "Member saved." };
}

/** Stop billing a member in Stripe (immediately). Safe to call when there is no subscription. */
async function cancelStripeSubscription(member: Member) {
  if (!member.stripe_subscription_id || !hasLiveSubscription(member)) return;
  const subscription = await getStripe().subscriptions.cancel(member.stripe_subscription_id);
  await syncSubscription(subscription);
}

export async function deactivateMember(memberId: string): Promise<void> {
  await requireAdmin();
  const member = await loadMember(memberId);
  if (!member) return;
  await cancelStripeSubscription(member);
  const db = createAdminClient();
  await db.from("members").update({ membership_status: "inactive" }).eq("id", memberId);
  revalidateAdmin(memberId);
}

export async function reactivateMember(memberId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  await db.from("members").update({ membership_status: "active" }).eq("id", memberId);
  revalidateAdmin(memberId);
}

/** Cancel the member's Stripe subscription at the end of the paid period (member stays active until then). */
export async function cancelMemberSubscription(memberId: string): Promise<void> {
  await requireAdmin();
  const member = await loadMember(memberId);
  if (!member?.stripe_subscription_id) return;
  const subscription = await getStripe().subscriptions.update(member.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  await syncSubscription(subscription);
  revalidateAdmin(memberId);
}

/**
 * Permanently delete a member. Their payment history is KEPT (payments.member_id
 * becomes null and the payment keeps the member's name), so revenue reports stay correct.
 */
export async function deleteMember(memberId: string): Promise<void> {
  const { user } = await requireAdmin();
  const member = await loadMember(memberId);
  if (!member) redirect("/member-management");

  await cancelStripeSubscription(member);
  const db = createAdminClient();
  const { error } = await db.from("members").delete().eq("id", memberId);
  if (error) throw new Error(`Could not delete member: ${error.message}`);

  // Remove their login too (never the admin's own login, and never another admin's).
  if (member.user_id && member.user_id !== user.id) {
    const { data: isAdmin } = await db.from("admin_users").select("id").eq("user_id", member.user_id).maybeSingle();
    if (!isAdmin) await db.auth.admin.deleteUser(member.user_id);
  }

  revalidateAdmin();
  redirect("/member-management?deleted=1");
}
