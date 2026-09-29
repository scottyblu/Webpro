import type { NotificationPref } from "@/lib/types";

export type NotificationType =
  | "payment_confirmation"
  | "upcoming_payment_reminder"
  | "failed_payment_notice"
  | "past_due_reminder"
  | "manual_reminder";

export type NotificationChannel = "email" | "sms" | "push" | "log";

/** Channels a person can receive on (the "log" channel is for the server log only). */
export type DeliveryChannel = Exclude<NotificationChannel, "log">;

export interface NotificationRecipient {
  memberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** The member's reminder preference (defaults to all available methods). */
  pref?: NotificationPref;
}

export interface NotificationContext {
  clubName: string;
  amount: string; // formatted, e.g. "$20"
  periodLabel?: string; // e.g. "September 2026"
  dueDate?: string; // formatted date
  paymentMethod?: string;
  dashboardUrl: string;
  /** How to pay besides the app, e.g. "Zelle $20 to John Smith (dues@example.com)". */
  payInstructions?: string;
  /** Custom reminder text (from Settings); replaces the standard wording. */
  customMessage?: string;
}

export interface RenderedMessage {
  subject: string;
  text: string;
  sms: string;
  /** Short text for app (push) notifications. */
  push: { title: string; body: string; url: string };
}

export interface NotificationProvider {
  channel: NotificationChannel;
  /** Return false if the provider is not configured (missing API keys etc.). */
  isEnabled(): boolean;
  /** Returns where it was sent (email address, phone, "2 devices"). */
  send(recipient: NotificationRecipient, message: RenderedMessage): Promise<string | void>;
}

export interface DeliveryResult {
  channel: DeliveryChannel;
  status: "sent" | "failed" | "skipped";
  detail: string;
}
