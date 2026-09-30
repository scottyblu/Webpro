import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { periodLabel } from "@/lib/periods";

export interface NotificationLogRow {
  id: string;
  member_id: string | null;
  type: string;
  channel: string;
  status: "sent" | "failed" | "skipped";
  detail: string | null;
  recipient?: string | null;
  period_year?: number | null;
  period_month?: number | null;
  scheduled_for?: string | null;
  created_at: string;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  upcoming_payment_reminder: "Payment reminder",
  past_due_reminder: "Overdue reminder",
  manual_reminder: "Reminder (sent by admin)",
  payment_confirmation: "Payment receipt",
  failed_payment_notice: "Card payment failed",
  admin_zelle_reported: "Admin: Zelle reported",
  admin_payment_failed: "Admin: card failed",
  admin_overdue_summary: "Admin: who still owes",
  admin_monthly_summary: "Admin: monthly summary",
  admin_test: "Admin: test email",
};

const CHANNEL_LABELS: Record<string, string> = { sms: "Text", email: "Email", push: "App", log: "Log" };

function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** Notification history: member, type, where it went, when, which month, delivered or not. */
export function NotificationHistory({
  rows,
  timeZone,
  memberNames,
  emptyText = "No notifications yet.",
}: {
  rows: NotificationLogRow[];
  timeZone: string;
  /** Show a member column (for the club-wide history). */
  memberNames?: Map<string, string>;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="px-6 py-10 text-center text-sm text-stone-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((n) => {
        const failed = n.status === "failed";
        const sending = n.status === "skipped" && n.detail === "sending";
        return (
          <li key={n.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="font-semibold text-stone-900">
                {memberNames && n.member_id && (
                  <>
                    <Link href={`/member-management/${n.member_id}`} className="hover:text-brand-600">
                      {memberNames.get(n.member_id) ?? "Former member"}
                    </Link>
                    {" · "}
                  </>
                )}
                {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                {n.period_year && n.period_month && (
                  <span className="font-normal text-stone-600"> · {periodLabel({ year: n.period_year, month: n.period_month })}</span>
                )}
              </p>
              <p className="text-xs text-stone-500">
                {when(n.created_at, timeZone)} · {CHANNEL_LABELS[n.channel] ?? n.channel}
                {n.recipient && <> to {n.recipient}</>}
              </p>
              {n.detail && n.detail !== "sending" && (
                <p className={`mt-0.5 break-words text-xs ${failed ? "text-red-700" : "text-stone-500"}`}>{n.detail}</p>
              )}
            </div>
            <div className="shrink-0">
              {n.status === "sent" ? (
                <Badge tone="green">Delivered</Badge>
              ) : failed ? (
                <Badge tone="red">Failed</Badge>
              ) : (
                <Badge tone="gray">{sending ? "Not confirmed" : "Skipped"}</Badge>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
