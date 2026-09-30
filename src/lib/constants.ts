import type {
  ExtraCategory,
  MembershipStatus,
  MonthStatus,
  NotificationPref,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
} from "./types";

/** The absolute minimum for any payment. Partial payments are never allowed. */
export const MIN_PAYMENT_CENTS = 2000;
export const MIN_PAYMENT_MESSAGE = "Minimum payment amount is $20.";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Stripe",
  cash: "Cash",
  zelle: "Zelle",
  venmo: "Venmo",
  cash_app: "Cash App",
  check: "Check",
  other: "Other",
};

/** Methods an admin can pick when recording a manual payment. */
export const MANUAL_PAYMENT_METHODS: PaymentMethod[] = ["zelle", "cash", "venmo", "cash_app", "check", "other"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  void: "Voided",
};

export const MONTH_STATUS_LABELS: Record<MonthStatus, string> = {
  PAID: "PAID",
  PAID_AHEAD: "PAID AHEAD",
  UNPAID: "UNPAID",
  OVERDUE: "OVERDUE",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
};

export const PAYMENT_CATEGORY_LABELS: Record<PaymentCategory, string> = {
  dues: "Membership dues",
  prepayment: "Prepaid membership",
  donation: "Donation / extra contribution",
  other: "Other",
};

export const EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
  donation: "Donation / extra contribution",
  credit: "Unallocated credit",
  other: "Other",
};

export const NOTIFICATION_PREF_LABELS: Record<NotificationPref, string> = {
  all: "All available methods",
  sms_email: "Text + Email",
  sms: "Text (SMS) only",
  email: "Email only",
  push: "App notification only",
  none: "No reminders",
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  inactive: "Inactive",
};

/** Stripe subscription statuses that mean the member is (or will be) billed automatically. */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export const DEFAULT_REMINDER_MESSAGE =
  "Hi {first_name}, this is a reminder that your {amount} {club} payment is due on {due_date}. Thank you!";
export const DEFAULT_OVERDUE_MESSAGE =
  "Hi {first_name}, your {amount} {club} payment for {month} was due on {due_date} and hasn't been received yet. Please pay when you can. Thank you!";

export const DEFAULT_SETTINGS = {
  club_name: "The Breakfast Club",
  monthly_fee_cents: 2000,
  payment_due_day: 1,
  currency: "usd",
  timezone: "America/New_York",
  reminders_enabled: true,
  reminder_days_before: [3, 1, 0],
  overdue_enabled: false,
  overdue_days_after: [1, 3, 7],
  sms_enabled: true,
  email_enabled: true,
  push_enabled: true,
  reminder_message: null as string | null,
  overdue_message: null as string | null,
};
