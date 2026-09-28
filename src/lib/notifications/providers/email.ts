import nodemailer from "nodemailer";
import type { NotificationProvider } from "../types";

/**
 * Email delivery. Uses Gmail when GMAIL_ADDRESS + GMAIL_APP_PASSWORD are set,
 * otherwise Resend when RESEND_API_KEY + NOTIFICATIONS_FROM_EMAIL are set.
 */
export function emailConfigured(): "gmail" | "resend" | null {
  if (process.env.GMAIL_ADDRESS && process.env.GMAIL_APP_PASSWORD) return "gmail";
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_FROM_EMAIL) return "resend";
  return null;
}

let gmail: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendEmail(to: string, subject: string, text: string, fromName = "The Breakfast Club"): Promise<void> {
  const service = emailConfigured();
  if (service === "gmail") {
    gmail ??= nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_ADDRESS,
        // Google shows app passwords with spaces; they work with or without them.
        pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
      },
    });
    await gmail.sendMail({ from: { name: fromName, address: process.env.GMAIL_ADDRESS! }, to, subject, text });
    return;
  }
  if (service === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFICATIONS_FROM_EMAIL, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    return;
  }
  throw new Error("No email service is configured (set GMAIL_ADDRESS and GMAIL_APP_PASSWORD).");
}

export const emailProvider: NotificationProvider = {
  channel: "email",
  isEnabled: () => emailConfigured() !== null,
  async send(recipient, message) {
    if (!recipient.email) throw new Error("Member has no email address");
    await sendEmail(recipient.email, message.subject, message.text);
  },
};
