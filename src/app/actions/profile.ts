"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().max(30),
});

/** A member updates their own name / phone. Email and status can only be changed by an admin. */
export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await getCurrentMember();
  if (!member) return { error: "You must be signed in." };

  const parsed = profileSchema.safeParse({ full_name: formData.get("full_name"), phone: formData.get("phone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const db = createAdminClient();
  const { error } = await db
    .from("members")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
    .eq("id", member.id);
  if (error) return { error: "Could not save your profile. Please try again." };

  if (member.stripe_customer_id) {
    try {
      await getStripe().customers.update(member.stripe_customer_id, {
        name: parsed.data.full_name,
        phone: parsed.data.phone || undefined,
      });
    } catch (err) {
      console.error("[profile] could not update Stripe customer", err);
    }
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Profile saved." };
}
