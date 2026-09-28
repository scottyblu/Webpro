"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { parsePeriodKey, periodLabel } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState, Member, PaymentMethod } from "@/lib/types";

const manualPaymentSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Choose the month this payment is for"),
  method: z.enum(MANUAL_PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]], { message: "Choose a payment method" }),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(100000),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it was paid"),
  notes: z.string().trim().max(500),
});

/** Admin marks a member as paid for a month (cash, Zelle, Venmo, Cash App, check, other). */
export async function recordManualPayment(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const parsed = manualPaymentSchema.safeParse({
    period: formData.get("period"),
    method: formData.get("method"),
    amount: formData.get("amount"),
    payment_date: formData.get("payment_date"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const period = parsePeriodKey(parsed.data.period);
  if (!period) return { error: "Invalid month." };

  const db = createAdminClient();
  const { data: member } = await db.from("members").select("*").eq("id", memberId).maybeSingle();
  if (!member) return { error: "Member not found." };
  const m = member as Member;
  const settings = await getSettings(db);
  const amountCents = Math.round(parsed.data.amount * 100);

  const { error } = await db.from("payments").insert({
    member_id: m.id,
    member_name: m.full_name,
    amount_cents: amountCents,
    currency: settings.currency,
    payment_month: period.month,
    payment_year: period.year,
    payment_date: new Date(`${parsed.data.payment_date}T12:00:00Z`).toISOString(),
    payment_method: parsed.data.method,
    payment_status: "paid",
    notes: parsed.data.notes || null,
    recorded_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: `${m.full_name} is already marked paid for ${periodLabel(period)}.` };
    return { error: `Could not record payment: ${error.message}` };
  }

  // A manual payment brings a past-due (non-Stripe) member back to active.
  if (m.membership_status === "past_due" && !m.stripe_subscription_id) {
    await db.from("members").update({ membership_status: "active" }).eq("id", m.id);
  }

  await notify(
    "payment_confirmation",
    { memberId: m.id, name: m.full_name, email: m.email, phone: m.phone },
    {
      clubName: settings.club_name,
      amount: formatMoney(amountCents, settings.currency),
      periodLabel: periodLabel(period),
      paymentMethod: PAYMENT_METHOD_LABELS[parsed.data.method],
      dashboardUrl: `${siteUrl()}/dashboard`,
    },
    `payment_confirmation:manual:${m.id}:${parsed.data.period}`,
  );

  ["/admin", "/payment-management", "/reports", "/member-management", `/member-management/${m.id}`].forEach((p) =>
    revalidatePath(p),
  );
  return { ok: true, message: `Recorded ${formatMoney(amountCents, settings.currency)} ${PAYMENT_METHOD_LABELS[parsed.data.method]} payment for ${periodLabel(period)}.` };
}

/**
 * Void a manual payment entered by mistake. The row is kept (status "void") so the
 * history is never lost. Stripe payments can't be voided here — refund them in Stripe.
 */
export async function voidManualPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: payment } = await db.from("payments").select("id, member_id, payment_method, notes").eq("id", paymentId).maybeSingle();
  if (!payment || payment.payment_method === "stripe") return;
  await db
    .from("payments")
    .update({ payment_status: "void", notes: [payment.notes, "Voided by admin"].filter(Boolean).join(" — ") })
    .eq("id", paymentId);
  ["/admin", "/payment-management", "/reports"].forEach((p) => revalidatePath(p));
  if (payment.member_id) revalidatePath(`/member-management/${payment.member_id}`);
}
