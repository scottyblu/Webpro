import type { MembershipStatus, PaymentMethod, PaymentStatus } from "./types";

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
export const MANUAL_PAYMENT_METHODS: PaymentMethod[] = ["cash", "zelle", "venmo", "cash_app", "check", "other"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  void: "Voided",
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  inactive: "Inactive",
};

/** Stripe subscription statuses that mean the member is (or will be) billed automatically. */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export const DEFAULT_SETTINGS = {
  club_name: "The Breakfast Club",
  monthly_fee_cents: 2000,
  payment_due_day: 1,
  currency: "usd",
  timezone: "America/New_York",
};
