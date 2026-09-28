export type MembershipStatus = "active" | "past_due" | "cancelled" | "inactive";
export type PaymentMethod = "stripe" | "cash" | "zelle" | "venmo" | "cash_app" | "check" | "other";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded" | "void";
export type AdminRole = "owner" | "admin";

/** Status of a member for one specific month, as shown on the dashboards. */
export type MonthStatus = "PAID" | "UNPAID" | "PENDING" | "CANCELLED";

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
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
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
}
