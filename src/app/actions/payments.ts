"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, getCurrentUser, requireAdmin } from "@/lib/auth";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notifications";
import { addMonths, comparePeriods, currentPeriod, parsePeriodKey, periodLabel, periodOfDateString, zonedDateString } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState, Member, Payment, PaymentMethod } from "@/lib/types";

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

const PAYMENT_PATHS = ["/admin", "/payment-management", "/reports", "/member-management", "/dashboard"];

/**
 * A member says "I've sent my Zelle payment". This records a PENDING Zelle payment
 * for the month; an admin confirms it (PAID) after checking the bank, or rejects it.
 */
export async function reportZellePayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const member = await getCurrentMember();
  if (!user || !member) return { error: "You must be signed in." };
  if (member.membership_status === "inactive") return { error: "Your membership is inactive. Please contact an administrator." };

  const db = createAdminClient();
  const settings = await getSettings(db);
  if (!settings.zelle_contact) return { error: "Zelle payments aren't set up yet. Please contact an administrator." };

  const period = parsePeriodKey(String(formData.get("period") ?? ""));
  const current = currentPeriod(settings.timezone);
  const joined = periodOfDateString(member.joined_date);
  const earliest = comparePeriods(joined, addMonths(current, -6)) > 0 ? joined : addMonths(current, -6);
  if (!period || comparePeriods(period, earliest) < 0 || comparePeriods(period, addMonths(current, 3)) > 0) {
    return { error: "Choose the month this payment is for." };
  }
  const note = String(formData.get("notes") ?? "").trim().slice(0, 300);

  const { data: existing } = await db
    .from("payments")
    .select("payment_status")
    .eq("member_id", member.id)
    .eq("payment_year", period.year)
    .eq("payment_month", period.month)
    .in("payment_status", ["paid", "pending"]);
  if (existing?.some((p) => p.payment_status === "paid")) return { error: `You're already marked paid for ${periodLabel(period)}.` };
  if (existing?.some((p) => p.payment_status === "pending")) return { error: `Your ${periodLabel(period)} payment is already waiting for confirmation.` };

  const { data: inserted, error } = await db.from("payments").insert({
    member_id: member.id,
    member_name: member.full_name,
    amount_cents: settings.monthly_fee_cents,
    currency: settings.currency,
    payment_month: period.month,
    payment_year: period.year,
    payment_date: new Date(`${zonedDateString(new Date(), settings.timezone)}T12:00:00Z`).toISOString(),
    payment_method: "zelle",
    payment_status: "pending",
    notes: ["Reported by member", note].filter(Boolean).join(" — "),
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: `Your ${periodLabel(period)} payment is already recorded.` };
    return { error: "Could not save. Please try again." };
  }

  const fee = formatMoney(settings.monthly_fee_cents, settings.currency);
  await notifyAdmins(
    "admin_zelle_reported",
    `${member.full_name} sent a ${fee} Zelle payment for ${periodLabel(period)}`,
    [
      `${member.full_name} says they sent their ${fee} Zelle payment for ${periodLabel(period)}.`,
      ...(note ? [`Their note: "${note}"`] : []),
      "",
      `Check your bank for a Zelle payment from ${member.full_name}, then open the admin dashboard and tap "Received" (or "Not received"):`,
      `${siteUrl()}/admin`,
    ].join("\n"),
    `admin_zelle_reported:${inserted.id}`,
  );

  PAYMENT_PATHS.forEach((p) => revalidatePath(p));
  return {
    ok: true,
    message: `Thanks! Your ${periodLabel(period)} Zelle payment is marked PENDING. It turns PAID once an administrator confirms it arrived.`,
  };
}

async function loadPendingReport(paymentId: string) {
  const db = createAdminClient();
  const { data } = await db.from("payments").select("*").eq("id", paymentId).maybeSingle();
  const payment = data as Payment | null;
  if (!payment || payment.payment_status !== "pending" || payment.stripe_payment_id) return { db, payment: null };
  return { db, payment };
}

/** Admin confirms a member-reported (pending) payment arrived => PAID. */
export async function confirmPendingPayment(paymentId: string): Promise<void> {
  const { user } = await requireAdmin();
  const { db, payment } = await loadPendingReport(paymentId);
  if (!payment) return;

  const { error } = await db
    .from("payments")
    .update({ payment_status: "paid", recorded_by: user.id, notes: [payment.notes, "Confirmed by admin"].filter(Boolean).join(" — ") })
    .eq("id", payment.id)
    .eq("payment_status", "pending");
  if (error?.code === "23505") {
    // The month was already marked paid another way; keep this report for the record.
    await db
      .from("payments")
      .update({ payment_status: "void", notes: [payment.notes, "Month was already paid"].filter(Boolean).join(" — ") })
      .eq("id", payment.id);
  } else if (!error && payment.member_id) {
    const { data: member } = await db.from("members").select("*").eq("id", payment.member_id).maybeSingle();
    const m = member as Member | null;
    if (m) {
      if (m.membership_status === "past_due" && !m.stripe_subscription_id) {
        await db.from("members").update({ membership_status: "active" }).eq("id", m.id);
      }
      const settings = await getSettings(db);
      const period = { year: payment.payment_year, month: payment.payment_month };
      await notify(
        "payment_confirmation",
        { memberId: m.id, name: m.full_name, email: m.email, phone: m.phone },
        {
          clubName: settings.club_name,
          amount: formatMoney(payment.amount_cents, payment.currency),
          periodLabel: periodLabel(period),
          paymentMethod: PAYMENT_METHOD_LABELS[payment.payment_method],
          dashboardUrl: `${siteUrl()}/dashboard`,
        },
        `payment_confirmation:${payment.id}`,
      );
    }
  }

  PAYMENT_PATHS.forEach((p) => revalidatePath(p));
  if (payment.member_id) revalidatePath(`/member-management/${payment.member_id}`);
}

/** Admin rejects a member-reported payment that never arrived. Kept in history as voided. */
export async function rejectPendingPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const { db, payment } = await loadPendingReport(paymentId);
  if (!payment) return;
  await db
    .from("payments")
    .update({ payment_status: "void", notes: [payment.notes, "Not received — rejected by admin"].filter(Boolean).join(" — ") })
    .eq("id", payment.id)
    .eq("payment_status", "pending");
  PAYMENT_PATHS.forEach((p) => revalidatePath(p));
  if (payment.member_id) revalidatePath(`/member-management/${payment.member_id}`);
}
