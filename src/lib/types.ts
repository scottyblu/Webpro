export type MembershipStatus = "active" | "past_due" | "cancelled" | "inactive";
export type PaymentMethod = "stripe" | "cash" | "zelle" | "venmo" | "cash_app" | "check" | "other";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded" | "void";
export type AdminRole = "owner" | "admin";
/** What a payment was for. */
export type PaymentCategory = "dues" | "prepayment" | "donation" | "other";
/** What any money beyond whole months is. */
export type ExtraCategory = "donation" | "credit" | "other";
/** How a member wants payment reminders. */
export type NotificationPref = "sms" | "email" | "push" | "sms_email" | "all" | "none";

/**
 * Status of a member for one specific month, as shown on the dashboards.
 * PAID_AHEAD: paid this month and at least the next month too.
 * OVERDUE:    unpaid and the due date has passed.
 * PENDING:    the member reported a Zelle payment that an admin hasn't confirmed yet.
 * There is deliberately no "partially paid": a month is paid only by a full month's dues.
 */
export type MonthStatus = "PAID" | "PAID_AHEAD" | "UNPAID" | "OVERDUE" | "PENDING" | "CANCELLED";

export interface ClubSettings {
  id: number;
  club_name: string;
  monthly_fee_cents: number;
  payment_due_day: number;
  currency: string;
  timezone: string;
  admin_name: string | null;
  admin_email: string | null;
  admin_phone: string | null;
  zelle_recipient_name: string | null;
  zelle_contact: string | null;
  notification_emails: string[];
  reminders_enabled: boolean;
  reminder_days_before: number[];
  overdue_enabled: boolean;
  overdue_days_after: number[];
  sms_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  reminder_message: string | null;
  overdue_message: string | null;
  updated_at: string;
}

export interface Member {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  joined_date: string; // YYYY-MM-DD
  membership_status: MembershipStatus;
  ended_at: string | null; // YYYY-MM-DD
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  notes: string | null;
  notification_pref: NotificationPref;
  /** Personal monthly dues (null = the club's standard fee). Never below $20. */
  dues_cents: number | null;
  /** Personal due day of the month (null = the club's due day). */
  due_day: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Money received. One row per transaction, even when it covers many months.
 * payment_year/payment_month is the first month it covers (for a donation: the month received).
 */
export interface Payment {
  id: string;
  member_id: string | null;
  member_name: string;
  amount_cents: number;
  currency: string;
  payment_month: number;
  payment_year: number;
  payment_date: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  stripe_payment_id: string | null;
  stripe_payment_intent_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  category: PaymentCategory;
  /** Full months this payment covers (0 for a donation/other). */
  months_count: number;
  /** Money beyond whole months (e.g. $10 of a $50 payment). */
  extra_cents: number;
  extra_category: ExtraCategory | null;
  created_at: string;
  updated_at: string;
}

/** One month covered by one payment. A month is PAID only when one of these exists. */
export interface PaymentAllocation {
  id: string;
  payment_id: string;
  member_id: string;
  period_year: number;
  period_month: number;
  amount_cents: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

/** Generic return shape for server actions used with useActionState. */
export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Set when the person needs to confirm this email address (offers "Resend email"). */
  unconfirmedEmail?: string;
}
