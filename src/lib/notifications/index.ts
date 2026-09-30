import "server-only";
import type { Period } from "@/lib/periods";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationPref } from "@/lib/types";
import { logProvider } from "./providers/log";
import { emailConfigured, emailProvider, sendEmail } from "./providers/email";
import { memberPushSubscriptions, pushConfigured, pushProvider } from "./providers/push";
import { twilioSmsProvider } from "./providers/sms-twilio";
import { renderNotification } from "./templates";
import type {
  DeliveryChannel,
  DeliveryResult,
  NotificationContext,
  NotificationProvider,
  NotificationRecipient,
  NotificationType,
} from "./types";

export type { DeliveryChannel, DeliveryResult, NotificationType } from "./types";

export { emailConfigured, pushConfigured };

/**
 * Delivery channels. Email, SMS and push switch on automatically once their
 * environment variables are set.
 */
const PROVIDERS: Record<DeliveryChannel, NotificationProvider> = {
  email: emailProvider,
  sms: twilioSmsProvider,
  push: pushProvider,
};

export function smsConfigured(): boolean {
  return twilioSmsProvider.isEnabled();
}

/** Channels a reminder preference allows. */
export function channelsForPref(pref: NotificationPref | undefined): DeliveryChannel[] {
  switch (pref ?? "all") {
    case "none":
      return [];
    case "sms":
      return ["sms"];
    case "email":
      return ["email"];
    case "push":
      return ["push"];
    case "sms_email":
      return ["sms", "email"];
    default:
      return ["sms", "email", "push"];
  }
}

/**
 * Channels that can actually reach this member right now:
 * email needs an address, SMS needs a phone number (and Twilio), push needs the
 * app installed with notifications allowed.
 */
export async function availableChannels(recipient: NotificationRecipient): Promise<DeliveryChannel[]> {
  const out: DeliveryChannel[] = [];
  if (recipient.phone && smsConfigured()) out.push("sms");
  if (recipient.email && emailConfigured()) out.push("email");
  if (pushConfigured() && (await memberPushSubscriptions(recipient.memberId)).length > 0) out.push("push");
  return out;
}

export interface NotifyOptions {
  /** Limit to these channels (e.g. the club's enabled reminder channels, or the admin's pick). */
  channels?: DeliveryChannel[];
  /** Follow the member's reminder preference (used for reminders). */
  usePreference?: boolean;
  /** Billing month the notification is about (shown in the history). */
  period?: Period;
  /** Day a scheduled reminder was for (YYYY-MM-DD). */
  scheduledFor?: string;
}

/**
 * Record that we're about to send (the unique dedupe_key + channel stops a second
 * send). Falls back to the original columns if SQL file 0005 hasn't been run.
 */
async function claim(
  db: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await db.from("notification_log").insert({ ...row, ...extra });
  if (!error) return true;
  if (error.code === "23505") return false; // already sent
  if (/column|schema cache/i.test(error.message)) {
    const { error: retry } = await db.from("notification_log").insert(row);
    return !retry;
  }
  console.error("[notification] could not record notification", error.message);
  return false;
}

/**
 * Send a notification to a member on every allowed channel.
 * `dedupeKey` makes sending idempotent: the same key is never sent twice on the
 * same channel (e.g. "reminder:<memberId>:2026-10:2026-09-28").
 * Never throws — a notification problem must not break a payment or webhook.
 */
export async function notify(
  type: NotificationType,
  recipient: NotificationRecipient,
  ctx: NotificationContext,
  dedupeKey: string,
  opts: NotifyOptions = {},
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  try {
    const db = createAdminClient();
    const message = renderNotification(type, recipient.name, ctx);
    await logProvider.send(recipient, message);

    let channels: DeliveryChannel[] = opts.channels ?? ["email", "sms", "push"];
    if (opts.usePreference) channels = channels.filter((c) => channelsForPref(recipient.pref).includes(c));

    for (const channel of channels) {
      const provider = PROVIDERS[channel];
      if (!provider.isEnabled()) {
        results.push({ channel, status: "skipped", detail: `${channel === "sms" ? "Text messages" : channel === "push" ? "App notifications" : "Email"} not set up` });
        continue;
      }
      if (channel === "email" && !recipient.email) {
        results.push({ channel, status: "skipped", detail: "No email address" });
        continue;
      }
      if (channel === "sms" && !recipient.phone) {
        results.push({ channel, status: "skipped", detail: "No phone number" });
        continue;
      }
      if (channel === "push" && (await memberPushSubscriptions(recipient.memberId)).length === 0) {
        results.push({ channel, status: "skipped", detail: "App notifications not turned on" });
        continue;
      }

      const to = channel === "email" ? recipient.email : channel === "sms" ? recipient.phone : "App";
      const claimed = await claim(
        db,
        { member_id: recipient.memberId, type, channel, dedupe_key: dedupeKey, status: "skipped", detail: "sending" },
        {
          recipient: to,
          period_year: opts.period?.year ?? null,
          period_month: opts.period?.month ?? null,
          scheduled_for: opts.scheduledFor ?? null,
        },
      );
      if (!claimed) {
        results.push({ channel, status: "skipped", detail: "Already sent" });
        continue;
      }

      try {
        const where = await provider.send(recipient, message);
        const detail = where && channel === "push" ? `${message.subject} (${where})` : message.subject;
        await db.from("notification_log").update({ status: "sent", detail }).eq("dedupe_key", dedupeKey).eq("channel", channel);
        results.push({ channel, status: "sent", detail: String(where ?? to ?? "") });
      } catch (err) {
        const detail = String(err instanceof Error ? err.message : err).slice(0, 500);
        console.error(`[notification] ${channel} failed`, detail);
        await db.from("notification_log").update({ status: "failed", detail }).eq("dedupe_key", dedupeKey).eq("channel", channel);
        results.push({ channel, status: "failed", detail });
      }
    }
  } catch (err) {
    console.error("[notification] failed", err);
  }
  return results;
}

export type AdminAlertType =
  | "admin_zelle_reported"
  | "admin_payment_failed"
  | "admin_overdue_summary"
  | "admin_monthly_summary"
  | "admin_test";

/**
 * Email an alert to every address in Settings → Notification emails.
 * De-duplicated per address with `dedupeKey`. Never throws.
 * Returns how many emails were sent.
 */
export async function notifyAdmins(
  type: AdminAlertType,
  subject: string,
  text: string,
  dedupeKey: string,
  opts: { force?: boolean } = {},
): Promise<{ sent: number; failed: number; recipients: number; error?: string }> {
  // Nothing is claimed until email is set up, so alerts still go out once it is.
  if (!emailConfigured()) return { sent: 0, failed: 0, recipients: 0, error: "Email isn't set up yet (GMAIL_ADDRESS / GMAIL_APP_PASSWORD)." };
  const db = createAdminClient();
  const { data } = await db.from("club_settings").select("club_name, notification_emails").eq("id", 1).maybeSingle();
  const recipients: string[] = (data?.notification_emails as string[] | null) ?? [];
  const clubName = (data?.club_name as string | undefined) ?? "The Breakfast Club";
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (const to of recipients) {
    const key = opts.force ? `${dedupeKey}:${to}:${Date.now()}` : `${dedupeKey}:${to}`;
    const claimed = await claim(
      db,
      { member_id: null, type, channel: "email", dedupe_key: key, status: "skipped", detail: "sending" },
      { recipient: to },
    );
    if (!claimed) continue; // already sent

    try {
      await sendEmail(to, subject, text, clubName);
      await db.from("notification_log").update({ status: "sent", detail: subject }).eq("dedupe_key", key).eq("channel", "email");
      sent++;
    } catch (err) {
      console.error(`[notification] admin email to ${to} failed`, err);
      failed++;
      lastError = String(err instanceof Error ? err.message : err).slice(0, 300);
      // Release the claim so a scheduled alert is retried on the next daily run.
      await db.from("notification_log").delete().eq("dedupe_key", key).eq("channel", "email");
    }
  }
  return { sent, failed, recipients: recipients.length, error: lastError };
}
