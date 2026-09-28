import type { NotificationProvider } from "../types";

/**
 * SMS via Twilio. Enabled automatically when TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are set.
 */
export const twilioSmsProvider: NotificationProvider = {
  channel: "sms",
  isEnabled: () =>
    !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER,
  async send(recipient, message) {
    if (!recipient.phone) throw new Error("Member has no phone number");
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: recipient.phone, From: process.env.TWILIO_FROM_NUMBER!, Body: message.sms }),
    });
    if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
  },
};
