import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logProvider } from "./providers/log";
import { emailConfigured, emailProvider, sendEmail } from "./providers/email";
import { twilioSmsProvider } from "./providers/sms-twilio";
import { renderNotification } from "./templates";
import type { NotificationContext, NotificationProvider, NotificationRecipient, NotificationType } from "./types";

export type { NotificationType } from "./types";

export { emailConfigured };

/**
 * Register delivery channels here. Email and SMS switch on automatically once
 * their environment variables are set; "log" always runs.
 */
const PROVIDERS: NotificationProvider[] = [emailProvider, twilioSmsProvider, logProvider];

/**
 * Send a notification to a member on every enabled channel.
 * `dedupeKey` makes sending idempotent: the same key is never sent twice on the
 * same channel (e.g. "past_due:<memberId>:2026-09").
 * Never throws — a notification problem must not break a payment or webhook.
 */
export async function notify(
  type: NotificationType,
  recipient: NotificationRecipient,
  ctx: NotificationContext,
  dedupeKey: string,
): Promise<void> {
  const db = createAdminClient();
  const message = renderNotification(type, recipient.name, ctx);

  for (const provider of PROVIDERS) {
    if (!provider.isEnabled()) continue;
    if (provider.channel === "email" && !recipient.email) continue;
    if (provider.channel === "sms" && !recipient.phone) continue;

    // Claim the key first so concurrent runs can't double-send.
    const { error: claimError } = await db.from("notification_log").insert({
      member_id: recipient.memberId,
      type,
      channel: provider.channel,
      dedupe_key: dedupeKey,
      status: "skipped",
      detail: "sending",
    });
    if (claimError) continue; // Already sent (unique dedupe_key + channel) or DB issue.

    try {
      await provider.send(recipient, message);
      await db
        .from("notification_log")
        .update({ status: "sent", detail: message.subject })
        .eq("dedupe_key", dedupeKey)
        .eq("channel", provider.channel);
    } catch (err) {
      console.error(`[notification] ${provider.channel} failed`, err);
      await db
        .from("notification_log")
        .update({ status: "failed", detail: String(err instanceof Error ? err.message : err).slice(0, 500) })
        .eq("dedupe_key", dedupeKey)
        .eq("channel", provider.channel);
    }
  }
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
    const { error: claimError } = await db.from("notification_log").insert({
      member_id: null,
      type,
      channel: "email",
      dedupe_key: key,
      status: "skipped",
      detail: "sending",
    });
    if (claimError) continue; // already sent

    try {
      await sendEmail(to, subject, text, clubName);
      await db.from("notification_log").update({ status: "sent", detail: `${subject} → ${to}` }).eq("dedupe_key", key).eq("channel", "email");
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
