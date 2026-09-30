"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, requireAdmin } from "@/lib/auth";
import { buildCoverage, coverageFor } from "@/lib/billing";
import { getLedger, monthOverviewFrom } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { DeliveryChannel } from "@/lib/notifications";
import { generateVapidKeys, pushConfigured } from "@/lib/notifications/providers/push";
import { periodLabel, zonedDateString } from "@/lib/periods";
import { manualReminderFor, sendReminder } from "@/lib/reminders";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState, Member, Payment, PaymentAllocation } from "@/lib/types";

const CHANNEL_NAMES: Record<DeliveryChannel, string> = { sms: "Text", email: "Email", push: "App notification" };

/** Admin: "Send reminder" on a member's profile, by the methods the admin picks. */
export async function sendManualReminder(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const channels = formData
    .getAll("channel")
    .map(String)
    .filter((c): c is DeliveryChannel => c === "sms" || c === "email" || c === "push");
  if (channels.length === 0) return { error: "Choose at least one way to send the reminder." };

  const db = createAdminClient();
  const { data: member } = await db.from("members").select("*").eq("id", memberId).maybeSingle();
  if (!member) return { error: "Member not found." };
  const settings = await getSettings(db);
  const [{ data: allocations }, { data: pending }] = await Promise.all([
    db.from("payment_allocations").select("*").eq("member_id", memberId),
    db.from("payments").select("*").eq("member_id", memberId).eq("payment_status", "pending"),
  ]);
  const cov = coverageFor(
    buildCoverage((allocations ?? []) as PaymentAllocation[], (pending ?? []) as Payment[]),
    memberId,
  );
  const today = zonedDateString(new Date(), settings.timezone);
  const reminder = manualReminderFor(member as Member, cov, settings, today);
  if (!reminder) return { error: `${(member as Member).full_name} has nothing due — they're paid up.` };

  const results = await sendReminder(settings, reminder, { scheduledFor: today, channels, manual: true });
  revalidatePath(`/member-management/${memberId}`);
  revalidatePath("/admin/notifications");

  const sent = results.filter((r) => r.status === "sent");
  const problems = results.filter((r) => r.status !== "sent");
  const about = `${periodLabel(reminder.period)} (due ${formatDate(reminder.dueDate)})`;
  if (sent.length === 0) {
    return { error: `Reminder not sent. ${problems.map((r) => `${CHANNEL_NAMES[r.channel]}: ${r.detail}`).join(" · ")}` };
  }
  return {
    ok: true,
    message: [
      `${reminder.type === "past_due_reminder" ? "Overdue reminder" : "Reminder"} for ${about} sent by ${sent.map((r) => CHANNEL_NAMES[r.channel]).join(" and ")}.`,
      ...problems.map((r) => `${CHANNEL_NAMES[r.channel]} not sent: ${r.detail}`),
    ].join(" "),
  };
}

/**
 * Admin: one tap to remind every member who hasn't paid this month (Unpaid or Overdue).
 * Each member is reminded by their own preferred methods, about their oldest unpaid month.
 * Members who reported a Zelle payment (Pending) are skipped. Tapping twice in a day
 * doesn't send twice.
 */
export async function remindAllUnpaid(): Promise<ActionState> {
  await requireAdmin();
  const db = createAdminClient();
  const ledger = await getLedger(db);
  const { settings } = ledger;
  const today = zonedDateString(new Date(), settings.timezone);
  const { rows } = monthOverviewFrom(ledger, ledger.current);
  const unpaid = rows.filter((r) => r.status === "UNPAID" || r.status === "OVERDUE");
  if (unpaid.length === 0) return { ok: true, message: "Everyone has paid. Nobody to remind. 🎉" };

  const byId = new Map(ledger.members.map((m) => [m.id, m]));
  let reminded = 0;
  let alreadyToday = 0;
  const unreachable: string[] = [];
  for (const row of unpaid) {
    const member = byId.get(row.memberId);
    if (!member) continue;
    const reminder = manualReminderFor(member, coverageFor(ledger.coverage, member.id), settings, today);
    if (!reminder) continue;
    const results = await sendReminder(settings, reminder, { scheduledFor: today, bulk: true });
    if (results.some((r) => r.status === "sent")) reminded++;
    else if (results.some((r) => r.detail === "Already sent")) alreadyToday++;
    else unreachable.push(member.full_name);
  }

  revalidatePath("/admin/notifications");
  const parts = [`Reminder sent to ${reminded} member${reminded === 1 ? "" : "s"}.`];
  if (alreadyToday) parts.push(`${alreadyToday} already got one today.`);
  if (unreachable.length) {
    parts.push(
      `Couldn't reach ${unreachable.join(", ")} (reminders turned off, or no working email / phone / app). Details are under Notifications.`,
    );
  }
  if (reminded === 0 && alreadyToday === 0) return { error: parts.slice(1).join(" ") || "No reminders could be sent." };
  return { ok: true, message: parts.join(" ") };
}

/** Admin: create a key pair for app (push) notifications, to paste into Vercel. */
export async function createPushKeys(): Promise<{ publicKey: string; privateKey: string; alreadyConfigured: boolean }> {
  await requireAdmin();
  return { ...generateVapidKeys(), alreadyConfigured: pushConfigured() };
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Member: this device wants app notifications. */
export async function savePushSubscription(subscription: unknown, userAgent: string): Promise<{ ok: boolean; error?: string }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Please sign in again." };
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "This device returned an invalid subscription." };
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      member_id: member.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  return { ok: true };
}

/** Member: this device no longer wants app notifications. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;
  const db = createAdminClient();
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("member_id", member.id);
}
