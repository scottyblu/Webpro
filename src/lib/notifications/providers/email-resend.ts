import type { NotificationProvider } from "../types";

/**
 * Email via Resend (https://resend.com). Enabled automatically when
 * RESEND_API_KEY and NOTIFICATIONS_FROM_EMAIL are set.
 * To use a different email service, copy this file and implement `send`.
 */
export const resendEmailProvider: NotificationProvider = {
  channel: "email",
  isEnabled: () => !!process.env.RESEND_API_KEY && !!process.env.NOTIFICATIONS_FROM_EMAIL,
  async send(recipient, message) {
    if (!recipient.email) throw new Error("Member has no email address");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATIONS_FROM_EMAIL,
        to: [recipient.email],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  },
};
