export type NotificationType =
  | "payment_confirmation"
  | "upcoming_payment_reminder"
  | "failed_payment_notice"
  | "past_due_reminder";

export type NotificationChannel = "email" | "sms" | "log";

export interface NotificationRecipient {
  memberId: string;
  name: string;
  email: string | null;
  phone: string | null;
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
}

export interface RenderedMessage {
  subject: string;
  text: string;
  sms: string;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  /** Return false if the provider is not configured (missing API keys etc.). */
  isEnabled(): boolean;
  send(recipient: NotificationRecipient, message: RenderedMessage): Promise<void>;
}
