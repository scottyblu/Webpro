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

// Invisible characters phones sometimes add when copying (zero-width spaces, BOM, etc.).
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

function gmailAddress(): string {
  return (process.env.GMAIL_ADDRESS ?? "").replace(INVISIBLE, "").trim().replace(/^["']|["']$/g, "");
}

/**
 * Google app passwords are 16 letters, shown in groups of four. Strip spaces,
 * invisible characters and quotes; if what remains is 16 letters, use exactly that.
 */
function gmailAppPassword(): string {
  const raw = (process.env.GMAIL_APP_PASSWORD ?? "").replace(INVISIBLE, "").replace(/\s+/g, "");
  const lettersOnly = raw.replace(/[^A-Za-z]/g, "");
  return lettersOnly.length === 16 ? lettersOnly : raw.replace(/^["']|["']$/g, "");
}

/** Describe the saved app password without revealing it (for /setup-check). */
export function describeAppPassword(): string {
  const raw = process.env.GMAIL_APP_PASSWORD ?? "";
  const cleaned = gmailAppPassword();
  const looksRight = /^[a-zA-Z]{16}$/.test(cleaned);
  const invisible = (raw.match(INVISIBLE) ?? []).length;
  return `Vercel's GMAIL_APP_PASSWORD has ${cleaned.length} characters after removing spaces${
    invisible ? ` (and ${invisible} invisible character${invisible === 1 ? "" : "s"})` : ""
  }. ${looksRight ? "That looks like a Google app password." : "A Google app password is exactly 16 letters, so this is not one."}`;
}

function gmailTransport() {
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailAddress(),
      pass: gmailAppPassword(),
    },
  });
  return gmail;
}

/** Turn Gmail's error codes into instructions a person can follow. */
export function explainEmailError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const address = gmailAddress() || "the GMAIL_ADDRESS account";
  if (/534-5\.7\.9|Application-specific password required/i.test(message)) {
    return `Gmail says ${address} needs an app password: the GMAIL_APP_PASSWORD value the app received isn't a valid app password for that account. ${describeAppPassword()} Signed in as ${address}, create one at myaccount.google.com/apppasswords, paste it into Vercel, then Redeploy.`;
  }
  if (/535-5\.7\.8|BadCredentials|Username and Password not accepted/i.test(message)) {
    return `Gmail rejected the login for ${address}. ${describeAppPassword()} Check that the app password was created while signed in to that same account, then Redeploy.`;
  }
  return message;
}

/** Log in to Gmail without sending anything (used by /setup-check). */
export async function verifyEmailLogin(): Promise<{ ok: boolean; detail: string }> {
  const service = emailConfigured();
  if (service !== "gmail") return { ok: service !== null, detail: service ? `Using ${service}.` : "Not configured." };
  try {
    await gmailTransport().verify();
    return { ok: true, detail: `Gmail login works (${gmailAddress()}).` };
  } catch (err) {
    return { ok: false, detail: explainEmailError(err) };
  }
}

export async function sendEmail(to: string, subject: string, text: string, fromName = "The Breakfast Club"): Promise<void> {
  const service = emailConfigured();
  if (service === "gmail") {
    try {
      await gmailTransport().sendMail({ from: { name: fromName, address: gmailAddress() }, to, subject, text });
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
    return recipient.email;
  },
};
