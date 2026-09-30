import "server-only";
import type Stripe from "stripe";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notifications";
import { addMonths, periodKey, periodLabel, periodOfDate, type Period } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Member, MembershipStatus, PaymentStatus } from "@/lib/types";
import { getStripe } from "./client";

/**
 * Everything that turns Stripe objects into database rows lives here, shared by
 * the webhook handler and the post-checkout redirect. Every function is
 * idempotent: running it twice for the same Stripe object has no extra effect.
 */

type Db = ReturnType<typeof createAdminClient>;

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

async function findMember(db: Db, opts: { memberId?: string | null; customerId?: string | null; subscriptionId?: string | null }) {
  if (opts.memberId) {
    const { data } = await db.from("members").select("*").eq("id", opts.memberId).maybeSingle();
    if (data) return data as Member;
  }
  if (opts.subscriptionId) {
    const { data } = await db.from("members").select("*").eq("stripe_subscription_id", opts.subscriptionId).maybeSingle();
    if (data) return data as Member;
  }
  if (opts.customerId) {
    const { data } = await db.from("members").select("*").eq("stripe_customer_id", opts.customerId).maybeSingle();
    if (data) return data as Member;
  }
  return null;
}

function membershipStatusFor(subStatus: Stripe.Subscription.Status, current: MembershipStatus): MembershipStatus {
  if (current === "inactive") return "inactive"; // An admin deactivation always wins.
  switch (subStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return current; // incomplete / paused: leave as-is
  }
}

/** Mirror a Stripe subscription onto the member record. */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const db = createAdminClient();
  const member = await findMember(db, {
    memberId: subscription.metadata?.member_id,
    subscriptionId: subscription.id,
    customerId: idOf(subscription.customer),
  });
  if (!member) {
    console.warn(`[stripe] no member found for subscription ${subscription.id}`);
    return;
  }

  // If the member has since started a different subscription, ignore events for the old one
  // (except to record nothing). Only the member's current subscription drives their status.
  const isCurrent = !member.stripe_subscription_id || member.stripe_subscription_id === subscription.id;
  const isLive = !["canceled", "incomplete_expired"].includes(subscription.status);
  if (!isCurrent && !isLive) return;

  const periodEnd = subscription.items.data[0]?.current_period_end ?? null;

  const { error } = await db
    .from("members")
    .update({
      stripe_customer_id: idOf(subscription.customer),
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || !!subscription.cancel_at,
      membership_status: membershipStatusFor(subscription.status, member.membership_status),
    })
    .eq("id", member.id);
  if (error) throw new Error(`Failed to update member ${member.id}: ${error.message}`);
}

function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

/** Which month an invoice pays for: the start of the billing period on its first line, in club time. */
function invoicePeriod(invoice: Stripe.Invoice, timeZone: string): Period {
  const line = invoice.lines?.data?.find((l) => l.amount > 0) ?? invoice.lines?.data?.[0];
  const start = line?.period?.start ?? invoice.created;
  return periodOfDate(new Date(start * 1000), timeZone);
}

/**
 * Record (or update) the payment row for a subscription invoice.
 * The Stripe invoice id is stored in payments.stripe_payment_id, which is UNIQUE,
 * so repeated webhook deliveries can never create duplicate payments.
 */
export async function recordInvoice(invoice: Stripe.Invoice, status: PaymentStatus): Promise<void> {
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (!subscriptionId) return; // Not a membership invoice.
  const amount = status === "paid" ? invoice.amount_paid : invoice.amount_due;
  if (amount <= 0) return; // $0 invoices (trials, credits) are not payments.

  const db = createAdminClient();
  const settings = await getSettings(db);
  const member = await findMember(db, {
    memberId: invoice.parent?.subscription_details?.metadata?.member_id,
    subscriptionId,
    customerId: idOf(invoice.customer),
  });
  if (!member) {
    console.warn(`[stripe] no member found for invoice ${invoice.id}`);
    return;
  }

  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  const paymentDate = new Date((status === "paid" ? paidAt : invoice.created) * 1000).toISOString();

  const { data: existing } = await db
    .from("payments")
    .select("id, payment_status")
    .eq("stripe_payment_id", invoice.id)
    .maybeSingle();

  if (existing) {
    // Never downgrade a paid invoice (events can arrive out of order).
    if (existing.payment_status === "paid" || existing.payment_status === status) return;
    // Moving to paid: make sure the month doesn't already have a (manual) paid payment.
    const update: Record<string, unknown> = { payment_status: status, amount_cents: amount, payment_date: paymentDate };
    if (status === "paid") {
      const { data: row } = await db.from("payments").select("payment_year, payment_month").eq("id", existing.id).single();
      const target = await firstUnpaidPeriod(db, member.id, { year: row!.payment_year, month: row!.payment_month });
      update.payment_year = target.year;
      update.payment_month = target.month;
    }
    const { error } = await db.from("payments").update(update).eq("id", existing.id);
    if (error) throw new Error(`Failed to update payment for invoice ${invoice.id}: ${error.message}`);
    if (status === "paid") {
      const target = { year: update.payment_year as number, month: update.payment_month as number };
      await allocate(db, existing.id, member.id, target, amount);
      await sendPaymentNotice(member, "payment_confirmation", amount, invoice, settings, target);
    }
    return;
  }

  let period = invoicePeriod(invoice, settings.timezone);
  // If this month was already paid another way (e.g. cash), apply the Stripe payment to the next unpaid month.
  if (status === "paid") period = await firstUnpaidPeriod(db, member.id, period);

  const { data: inserted, error } = await db
    .from("payments")
    .insert({
      member_id: member.id,
      member_name: member.full_name,
      amount_cents: amount,
      currency: invoice.currency,
      payment_month: period.month,
      payment_year: period.year,
      payment_date: paymentDate,
      payment_method: "stripe",
      payment_status: status,
      stripe_payment_id: invoice.id,
      notes: status === "failed" ? "Card payment failed" : null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return; // Unique violation: a concurrent delivery already recorded it.
    throw new Error(`Failed to record payment for invoice ${invoice.id}: ${error.message}`);
  }

  if (status === "paid") {
    await allocate(db, inserted.id as string, member.id, period, amount);
    await sendPaymentNotice(member, "payment_confirmation", amount, invoice, settings, period);
  } else if (status === "failed") {
    await sendPaymentNotice(member, "failed_payment_notice", amount, invoice, settings, period);
    await notifyAdmins(
      "admin_payment_failed",
      `Card payment failed: ${member.full_name} (${periodLabel(period)})`,
      `${member.full_name}'s ${formatMoney(amount, invoice.currency)} card payment for ${periodLabel(period)} failed. Stripe will retry automatically, and the member has been asked to update their card.\n\nMember profile: ${siteUrl()}/member-management/${member.id}`,
      `admin_payment_failed:${invoice.id}`,
    );
  }
}

/** First month from `start` that no payment covers yet. */
async function firstUnpaidPeriod(db: Db, memberId: string, start: Period): Promise<Period> {
  const { data } = await db
    .from("payment_allocations")
    .select("period_year, period_month")
    .eq("member_id", memberId)
    .gte("period_year", start.year);
  const paid = new Set((data ?? []).map((a) => periodKey({ year: a.period_year, month: a.period_month })));
  let p = start;
  for (let i = 0; i < 24 && paid.has(periodKey(p)); i++) p = addMonths(p, 1);
  return p;
}

/** A paid card payment covers one month: record that coverage (idempotent). */
async function allocate(db: Db, paymentId: string, memberId: string, period: Period, amount: number) {
  if (amount < 2000) return;
  const { error } = await db.from("payment_allocations").insert({
    payment_id: paymentId,
    member_id: memberId,
    period_year: period.year,
    period_month: period.month,
    amount_cents: amount,
  });
  if (error && error.code !== "23505") console.error(`[stripe] could not record coverage for ${paymentId}`, error.message);
}

async function sendPaymentNotice(
  member: Member,
  type: "payment_confirmation" | "failed_payment_notice",
  amount: number,
  invoice: Stripe.Invoice,
  settings: Awaited<ReturnType<typeof getSettings>>,
  period?: Period,
) {
  await notify(
    type,
    { memberId: member.id, name: member.full_name, email: member.email, phone: member.phone, pref: member.notification_pref },
    {
      clubName: settings.club_name,
      amount: formatMoney(amount, invoice.currency),
      periodLabel: period ? periodLabel(period) : undefined,
      paymentMethod: PAYMENT_METHOD_LABELS.stripe,
      dashboardUrl: `${siteUrl()}/dashboard`,
    },
    `${type}:${invoice.id}`,
  );
}

/** After Checkout: link the Stripe customer + subscription to the member and record the first invoice. */
export async function syncCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription") return;
  const db = createAdminClient();
  const memberId = session.client_reference_id ?? session.metadata?.member_id ?? null;
  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);

  if (memberId && customerId) {
    await db.from("members").update({ stripe_customer_id: customerId }).eq("id", memberId).is("stripe_customer_id", null);
  }
  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription);

  const invoiceId = idOf(session.invoice) ?? idOf(subscription.latest_invoice);
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.status === "paid") await recordInvoice(invoice, "paid");
  }
}
