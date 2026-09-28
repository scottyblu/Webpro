import type { MembershipStatus, MonthStatus, PaymentStatus } from "@/lib/types";
import { MEMBERSHIP_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { cn } from "./cn";

type Tone = "green" | "red" | "yellow" | "gray" | "blue";

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  red: "bg-red-100 text-red-800 ring-red-600/20",
  yellow: "bg-amber-100 text-amber-800 ring-amber-600/20",
  gray: "bg-stone-100 text-stone-600 ring-stone-500/20",
  blue: "bg-sky-100 text-sky-800 ring-sky-600/20",
};

const dotClasses: Record<Tone, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  yellow: "bg-amber-500",
  gray: "bg-stone-400",
  blue: "bg-sky-500",
};

export function Badge({ tone, children, size = "sm" }: { tone: Tone; children: React.ReactNode; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ring-1 ring-inset",
        size === "lg" ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs",
        toneClasses[tone],
      )}
    >
      <span className={cn("rounded-full", size === "lg" ? "h-2.5 w-2.5" : "h-1.5 w-1.5", dotClasses[tone])} />
      {children}
    </span>
  );
}

const monthTone: Record<MonthStatus, Tone> = { PAID: "green", UNPAID: "red", PENDING: "yellow", CANCELLED: "gray" };

/** PAID (green) · UNPAID (red) · PENDING (yellow) · CANCELLED (gray) */
export function StatusBadge({ status, size }: { status: MonthStatus; size?: "sm" | "lg" }) {
  return (
    <Badge tone={monthTone[status]} size={size}>
      {status}
    </Badge>
  );
}

const paymentTone: Record<PaymentStatus, Tone> = {
  paid: "green",
  pending: "yellow",
  failed: "red",
  refunded: "blue",
  void: "gray",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={paymentTone[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

const membershipTone: Record<MembershipStatus, Tone> = {
  active: "green",
  past_due: "red",
  cancelled: "gray",
  inactive: "gray",
};

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  return <Badge tone={membershipTone[status]}>{MEMBERSHIP_STATUS_LABELS[status]}</Badge>;
}
