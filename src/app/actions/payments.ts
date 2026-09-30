"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, getCurrentUser, requireAdmin } from "@/lib/auth";
import { buildCoverage, coverageFor, firstUnpaidPeriod, memberDues, planPayment } from "@/lib/billing";
import {
  MANUAL_PAYMENT_METHODS,
  MIN_PAYMENT_CENTS,
  MIN_PAYMENT_MESSAGE,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notifications";
import {
  addMonths,
  comparePeriods,
  currentPeriod,
  parsePeriodKey,
  periodKey,
  periodLabel,
  zonedDateString,
  type Period,
} from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActionState,
  ClubSettings,
  ExtraCategory,
  Member,
  Payment,
  PaymentAllocation,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";

type Db = ReturnType<typeof createAdminClient>;

/** Every page that shows money or payment status. */
function refreshEverything() {
  revalidatePath("/", "layout");
}

/** Friendly text for errors raised by the database payment functions. */
function paymentError(message: string, memberName?: string): string {
  if (message.includes("MIN_AMOUNT") || message.includes("payments_min_amount")) return MIN_PAYMENT_MESSAGE;
  if (message.includes("NOT_ENOUGH")) return "That amount doesn't cover that many full months.";
  if (message.includes("ALREADY_PAID")) return `${memberName ?? "This member"} is already paid for that month.`;
  if (message.includes("MEMBER_NOT_FOUND")) return "Member not found.";
  if (/function .*tbc_|Could not find the function/i.test(message)) {
    return "The database needs updating: run supabase/migrations/0005_allocations_and_reminders.sql in the Supabase SQL Editor.";
  }
  return `Could not save the payment: ${message}`;
}

async function loadMember(db: Db, memberId: string): Promise<Member | null> {
  const { data } = await db.from("members").select("*").eq("id", memberId).maybeSingle();
  return (data as Member | null) ?? null;
}

async function loadCoverage(db: Db, memberId: string) {
  const [{ data: allocations }, { data: payments }] = await Promise.all([
    db.from("payment_allocations").select("*").eq("member_id", memberId),
    db.from("payments").select("*").eq("member_id", memberId).eq("payment_status", "pending"),
  ]);
  return coverageFor(
    buildCoverage((allocations ?? []) as PaymentAllocation[], (payments ?? []) as Payment[]),
    memberId,
  );
}

/** How a payment option translates to an amount and a number of whole months. */
const optionSchema = z.enum(["one", "multi", "year", "custom"]);

function resolveOption(
  formData: FormData,
  duesCents: number,
): { amountCents: number; months: number; category: PaymentCategory; extraCategory: ExtraCategory | null } | { error: string } {
  const option = optionSchema.safeParse(formData.get("option"));
  if (!option.success) return { error: "Choose what this payment is for." };

  if (option.data === "one") return { amountCents: duesCents, months: 1, category: "dues", extraCategory: null };
  if (option.data === "year") return { amountCents: duesCents * 12, months: 12, category: "prepayment", extraCategory: null };
  if (option.data === "multi") {
    const months = z.coerce.number().int().min(2).max(24).safeParse(formData.get("months"));
    if (!months.success) return { error: "Choose how many months (2–24)." };
    return { amountCents: duesCents * months.data, months: months.data, category: "prepayment", extraCategory: null };
  }

  // Custom amount: at least $20. Whole months of dues are covered; anything left is extra.
  const amount = z.coerce.number().finite().safeParse(formData.get("amount"));
  if (!amount.success) return { error: MIN_PAYMENT_MESSAGE };
  const amountCents = Math.round(amount.data * 100);
  if (amountCents < MIN_PAYMENT_CENTS) return { error: MIN_PAYMENT_MESSAGE };
  if (amountCents > 1_000_000) return { error: "That amount is too large." };

  const purpose = z.enum(["dues", "donation", "other"]).safeParse(formData.get("purpose") ?? "dues");
  if (!purpose.success) return { error: "Choose what the payment is for." };
  if (purpose.data !== "dues") {
    return { amountCents, months: 0, category: purpose.data, extraCategory: purpose.data === "donation" ? "donation" : "other" };
  }
  const requested = z.coerce.number().int().min(0).max(120).safeParse(formData.get("custom_months"));
  const plan = planPayment(amountCents, duesCents, requested.success ? requested.data : undefined);
  const extra = z.enum(["donation", "credit", "other"]).safeParse(formData.get("extra_category") ?? "donation");
  return {
    amountCents,
    months: plan.months,
    category: plan.months > 1 ? "prepayment" : plan.months === 1 ? "dues" : "donation",
    extraCategory: plan.extraCents > 0 ? (extra.success ? extra.data : "donation") : null,
  };
}

/** Months a payment covered, from its allocations. */
async function coveredMonths(db: Db, paymentId: string): Promise<Period[]> {
  const { data } = await db.from("payment_allocations").select("period_year, period_month").eq("payment_id", paymentId);
  return ((data ?? []) as { period_year: number; period_month: number }[])
    .map((a) => ({ year: a.period_year, month: a.period_month }))
    .sort(comparePeriods);
}

function describeMonths(months: Period[]): string {
  if (months.length === 0) return "no months";
  if (months.length === 1) return periodLabel(months[0]!);
  return `${periodLabel(months[0]!)} – ${periodLabel(months[months.length - 1]!)}`;
}

/**
 * After a payment is recorded, any "I've sent my Zelle payment" report for the same
 * months is no longer needed: void it so it can't cover months twice.
 */
async function supersedePendingReports(db: Db, memberId: string, newlyCovered: Period[]) {
  if (newlyCovered.length === 0) return;
  const covered = new Set(newlyCovered.map(periodKey));
  const { data } = await db
    .from("payments")
    .select("*")
    .eq("member_id", memberId)
    .eq("payment_status", "pending")
    .is("stripe_payment_id", null);
  for (const p of (data ?? []) as Payment[]) {
    const months = Array.from({ length: Math.max(1, p.months_count ?? 1) }, (_, i) =>
      periodKey(addMonths({ year: p.payment_year, month: p.payment_month }, i)),
    );
    if (months.some((k) => covered.has(k))) {
      await db.rpc("tbc_void_payment", { p_payment: p.id, p_note: "Replaced by a payment recorded by an admin" });
    }
  }
}

async function sendConfirmation(member: Member, settings: ClubSettings, amountCents: number, method: PaymentMethod, months: Period[], key: string) {
  await notify(
    "payment_confirmation",
    { memberId: member.id, name: member.full_name, email: member.email, phone: member.phone, pref: member.notification_pref },
    {
      clubName: settings.club_name,
      amount: formatMoney(amountCents, settings.currency),
      periodLabel: months.length ? describeMonths(months) : undefined,
      paymentMethod: PAYMENT_METHOD_LABELS[method],
      dashboardUrl: `${siteUrl()}/dashboard`,
    },
    key,
  );
}

async function recordPaymentRpc(
  db: Db,
  args: {
    memberId: string;
    amountCents: number;
    method: PaymentMethod;
    status: PaymentStatus;
    date: string; // ISO
    months: number;
    start: Period;
    category: PaymentCategory;
    extraCategory: ExtraCategory | null;
    notes: string;
    recordedBy: string | null;
    exact: boolean;
  },
) {
  return db.rpc("tbc_record_payment", {
    p_member: args.memberId,
    p_amount: args.amountCents,
    p_method: args.method,
    p_status: args.status,
    p_date: args.date,
    p_months: args.months,
    p_start_year: args.start.year,
    p_start_month: args.start.month,
    p_category: args.category,
    p_extra_category: args.extraCategory,
    p_notes: args.notes,
    p_recorded_by: args.recordedBy,
    p_exact: args.exact,
  });
}

const methodSchema = z.enum(MANUAL_PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]], {
  message: "Choose how they paid",
});

/**
 * Admin records a payment: one month, several months, a full year, or a custom amount.
 * The payment is ONE transaction; it covers whole months only, starting at the chosen month.
 */
export async function recordPayment(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const db = createAdminClient();
  const member = await loadMember(db, memberId);
  if (!member) return { error: "Member not found." };
  const settings = await getSettings(db);
  const dues = memberDues(member, settings);

  const option = resolveOption(formData, dues);
  if ("error" in option) return option;
  if (option.amountCents < MIN_PAYMENT_CENTS) return { error: MIN_PAYMENT_MESSAGE };

  const method = methodSchema.safeParse(formData.get("method"));
  if (!method.success) return { error: method.error.issues[0]!.message };
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(formData.get("payment_date"));
  if (!date.success) return { error: "Enter the date it was paid." };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  const cov = await loadCoverage(db, memberId);
  const start =
    parsePeriodKey(String(formData.get("start") ?? "")) ??
    (option.months > 0 ? firstUnpaidPeriod(member, cov, settings) : currentPeriod(settings.timezone));

  const { data: paymentId, error } = await recordPaymentRpc(db, {
    memberId,
    amountCents: option.amountCents,
    method: method.data,
    status: "paid",
    date: new Date(`${date.data}T12:00:00Z`).toISOString(),
    months: option.months,
    // A donation-only payment is filed under the month it was received.
    start: option.months > 0 ? start : (parsePeriodKey(date.data.slice(0, 7)) ?? start),
    category: option.category,
    extraCategory: option.extraCategory,
    notes,
    recordedBy: user.id,
    exact: false,
  });
  if (error) return { error: paymentError(error.message, member.full_name) };

  const months = await coveredMonths(db, paymentId as string);
  await supersedePendingReports(db, memberId, months);
  await sendConfirmation(member, settings, option.amountCents, method.data, months, `payment_confirmation:${paymentId}`);
  refreshEverything();

  const extra = option.amountCents - months.length * dues;
  return {
    ok: true,
    message: [
      `Recorded ${formatMoney(option.amountCents, settings.currency)} ${PAYMENT_METHOD_LABELS[method.data]} from ${member.full_name}.`,
      months.length ? `Covers ${describeMonths(months)} (${months.length} month${months.length === 1 ? "" : "s"}).` : "",
      extra > 0 ? `${formatMoney(extra, settings.currency)} recorded as ${option.extraCategory === "credit" ? "unallocated credit" : option.extraCategory === "other" ? "other" : "a donation / extra contribution"}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * One-tap "Paid" from the payments list: one month of dues for exactly that month,
 * dated today. If the member already reported paying that month, that report is confirmed.
 */
export async function quickMarkPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const method = methodSchema.safeParse(formData.get("method"));
  const period = parsePeriodKey(String(formData.get("period") ?? ""));
  const memberId = z.string().uuid().safeParse(formData.get("member_id"));
  if (!method.success || !period || !memberId.success) return { error: "Something was missing. Please try again." };

  const db = createAdminClient();
  const member = await loadMember(db, memberId.data);
  if (!member) return { error: "Member not found." };
  const settings = await getSettings(db);
  const dues = memberDues(member, settings);

  // A one-month report for this month: confirm it rather than recording a second payment.
  const { data: report } = await db
    .from("payments")
    .select("*")
    .eq("member_id", member.id)
    .eq("payment_year", period.year)
    .eq("payment_month", period.month)
    .eq("payment_status", "pending")
    .is("stripe_payment_id", null)
    .maybeSingle();
  let paymentId: string;
  let amountCents = dues;
  if (report && (report as Payment).months_count <= 1) {
    await db.from("payments").update({ payment_method: method.data }).eq("id", report.id);
    const { error } = await db.rpc("tbc_confirm_payment", { p_payment: report.id, p_admin: user.id });
    if (error) return { error: paymentError(error.message, member.full_name) };
    paymentId = report.id as string;
    amountCents = (report as Payment).amount_cents;
  } else {
    const { data, error } = await recordPaymentRpc(db, {
      memberId: member.id,
      amountCents: dues,
      method: method.data,
      status: "paid",
      date: new Date(`${zonedDateString(new Date(), settings.timezone)}T12:00:00Z`).toISOString(),
      months: 1,
      start: period,
      category: "dues",
      extraCategory: null,
      notes: "",
      recordedBy: user.id,
      exact: true,
    });
    if (error) return { error: paymentError(error.message, member.full_name) };
    paymentId = data as string;
  }

  await supersedePendingReports(db, member.id, [period]);
  await sendConfirmation(member, settings, amountCents, method.data, [period], `payment_confirmation:${paymentId}`);
  refreshEverything();
  return {
    ok: true,
    message: `${member.full_name}: ${formatMoney(amountCents, settings.currency)} ${PAYMENT_METHOD_LABELS[method.data]} for ${periodLabel(period)} recorded.`,
  };
}

/**
 * Void a payment: it stays in the history marked "Voided", stops counting as money
 * (Amount Collected and that month's revenue go down), and the months it covered
 * become unpaid again (reminders resume for them).
 */
export async function voidPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  await db.rpc("tbc_void_payment", { p_payment: paymentId, p_note: "Voided by admin" });
  refreshEverything();
}

/** Undo a void: the payment counts again and covers its months again. */
export async function restorePayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  await db.rpc("tbc_restore_payment", { p_payment: paymentId });
  refreshEverything();
}

/** Permanently delete a payment and the months it covered. */
export async function deletePayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  await db.rpc("tbc_delete_payment", { p_payment: paymentId });
  refreshEverything();
}

/** Permanently delete ALL payment history (members are kept). */
export async function wipePaymentHistory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  if (formData.get("confirm") !== "WIPE") return { error: "Please confirm before wiping the history." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("tbc_wipe_payment_history");
  if (error) return { error: paymentError(error.message) };
  refreshEverything();
  return { ok: true, message: `Payment history wiped (${data ?? 0} payment${data === 1 ? "" : "s"} removed). Members were kept.` };
}

/**
 * A member says "I've sent my Zelle / Venmo payment" (one month, several months, a
 * year, or a custom amount of at least $20). It's recorded as PENDING and only covers
 * months once an admin confirms the money arrived.
 */
export async function reportMemberPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const member = await getCurrentMember();
  if (!user || !member) return { error: "You must be signed in." };
  if (member.membership_status === "inactive") return { error: "Your membership is inactive. Please contact an administrator." };

  const db = createAdminClient();
  const settings = await getSettings(db);
  const method: PaymentMethod = formData.get("method") === "venmo" ? "venmo" : "zelle";
  const via = PAYMENT_METHOD_LABELS[method];
  if (method === "zelle" ? !settings.zelle_contact : !settings.venmo_username) {
    return { error: `${via} payments aren't set up yet. Please contact an administrator.` };
  }
  const dues = memberDues(member, settings);

  const option = resolveOption(formData, dues);
  if ("error" in option) return option;
  if (option.amountCents < MIN_PAYMENT_CENTS) return { error: MIN_PAYMENT_MESSAGE };
  const note = String(formData.get("notes") ?? "").trim().slice(0, 300);

  const cov = await loadCoverage(db, member.id);
  const current = currentPeriod(settings.timezone);
  const requestedStart = parsePeriodKey(String(formData.get("start") ?? ""));
  const start = requestedStart ?? firstUnpaidPeriod(member, cov, settings);
  if (comparePeriods(start, addMonths(current, 24)) > 0) return { error: "Choose a starting month within the next two years." };
  if (option.months > 0 && cov.paid.has(periodKey(start))) {
    return { error: `You're already paid for ${periodLabel(start)}. Choose the next unpaid month.` };
  }
  if (option.months > 0 && cov.pending.has(periodKey(start))) {
    return { error: `Your ${periodLabel(start)} payment is already waiting for confirmation.` };
  }

  const { data: paymentId, error } = await recordPaymentRpc(db, {
    memberId: member.id,
    amountCents: option.amountCents,
    method,
    status: "pending",
    date: new Date(`${zonedDateString(new Date(), settings.timezone)}T12:00:00Z`).toISOString(),
    months: option.months,
    start: option.months > 0 ? start : current,
    category: option.category,
    extraCategory: option.extraCategory,
    notes: ["Reported by member", note].filter(Boolean).join(" — "),
    recordedBy: null,
    exact: false,
  });
  if (error) {
    if (error.code === "23505") return { error: "That payment is already waiting for confirmation." };
    return { error: paymentError(error.message) };
  }

  const amount = formatMoney(option.amountCents, settings.currency);
  const planned = Array.from({ length: option.months }, (_, i) => addMonths(start, i));
  const covers = planned.length ? ` for ${describeMonths(planned)}` : " (donation / extra)";
  await notifyAdmins(
    "admin_zelle_reported",
    `${member.full_name} sent a ${amount} ${via} payment${covers}`,
    [
      `${member.full_name} says they sent ${amount} by ${via}${covers}.`,
      ...(note ? [`Their note: "${note}"`] : []),
      "",
      `Check ${method === "venmo" ? "Venmo" : "your bank"} for a ${via} payment from ${member.full_name}, then open the admin dashboard and tap "Received" (or "Not received"):`,
      `${siteUrl()}/admin`,
    ].join("\n"),
    `admin_zelle_reported:${paymentId}`,
  );

  refreshEverything();
  return {
    ok: true,
    message: `Thanks! Your ${amount} ${via} payment${covers} is marked PENDING. It turns PAID once an administrator confirms it arrived.`,
  };
}

/** Admin confirms a member-reported (pending) payment arrived: it becomes PAID and covers its months. */
export async function confirmPendingPayment(paymentId: string): Promise<void> {
  const { user } = await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from("payments").select("*").eq("id", paymentId).maybeSingle();
  const payment = data as Payment | null;
  if (!payment || payment.payment_status !== "pending") return;

  const { error } = await db.rpc("tbc_confirm_payment", { p_payment: paymentId, p_admin: user.id });
  if (!error && payment.member_id) {
    const member = await loadMember(db, payment.member_id);
    if (member) {
      const settings = await getSettings(db);
      const months = await coveredMonths(db, paymentId);
      await sendConfirmation(member, settings, payment.amount_cents, payment.payment_method, months, `payment_confirmation:${paymentId}`);
    }
  }
  refreshEverything();
}

/** Admin rejects a member-reported payment that never arrived. Kept in history as voided. */
export async function rejectPendingPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const db = createAdminClient();
  await db.rpc("tbc_void_payment", { p_payment: paymentId, p_note: "Not received — rejected by admin" });
  refreshEverything();
}
