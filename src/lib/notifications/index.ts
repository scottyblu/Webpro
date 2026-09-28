import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logProvider } from "./providers/log";
import { resendEmailProvider } from "./providers/email-resend";
import { twilioSmsProvider } from "./providers/sms-twilio";
import { renderNotification } from "./templates";
import type { NotificationContext, NotificationProvider, NotificationRecipient, NotificationType } from "./types";

export type { NotificationType } from "./types";

/**
 * Register delivery channels here. Email and SMS switch on automatically once
 * their environment variables are set; "log" always runs.
 */
const PROVIDERS: NotificationProvider[] = [resendEmailProvider, twilioSmsProvider, logProvider];

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
