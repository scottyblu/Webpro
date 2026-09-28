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

function gmailTransport() {
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_ADDRESS?.trim(),
      // Google shows app passwords with spaces; they work with or without them.
      pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
    },
  });
  return gmail;
}

/** Turn Gmail's error codes into instructions a person can follow. */
export function explainEmailError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const address = process.env.GMAIL_ADDRESS?.trim() || "the GMAIL_ADDRESS account";
  if (/534-5\.7\.9|Application-specific password required/i.test(message)) {
    return `Gmail wants an app password. GMAIL_APP_PASSWORD in Vercel is a normal password (or an app password from a different Google account). Signed in as ${address}, create one at myaccount.google.com/apppasswords, paste it into Vercel, then Redeploy.`;
  }
  if (/535-5\.7\.8|BadCredentials|Username and Password not accepted/i.test(message)) {
    return `Gmail rejected the login. Check that GMAIL_ADDRESS is exactly ${address} and GMAIL_APP_PASSWORD is an app password created while signed in to that same account, then Redeploy.`;
  }
  return message;
}

/** Log in to Gmail without sending anything (used by /setup-check). */
export async function verifyEmailLogin(): Promise<{ ok: boolean; detail: string }> {
  const service = emailConfigured();
  if (service !== "gmail") return { ok: service !== null, detail: service ? `Using ${service}.` : "Not configured." };
  try {
    await gmailTransport().verify();
    return { ok: true, detail: `Gmail login works (${process.env.GMAIL_ADDRESS?.trim()}).` };
  } catch (err) {
    return { ok: false, detail: explainEmailError(err) };
  }
}

export async function sendEmail(to: string, subject: string, text: string, fromName = "The Breakfast Club"): Promise<void> {
  const service = emailConfigured();
  if (service === "gmail") {
    try {
      await gmailTransport().sendMail({ from: { name: fromName, address: process.env.GMAIL_ADDRESS!.trim() }, to, subject, text });
    } catch (err) {
      throw new Error(explainEmailError(err));
    }
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
