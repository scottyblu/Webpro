import { NextResponse, type NextRequest } from "next/server";
import type { MemberMonthRow } from "@/lib/billing";
import { getLedger, monthOverviewFrom } from "@/lib/data";
import { cronSecret, siteUrl } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { notifyAdmins } from "@/lib/notifications";
import { addMonths, dueDateOf, periodKey, periodLabel, zonedDateString } from "@/lib/periods";
import { planReminders, sendReminder } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Days after the due day when the admins get the "who still owes" email. */
const ADMIN_OVERDUE_DAYS = 5;

/**
 * Daily reminder job. Vercel Cron calls it (see vercel.json) with
 * "Authorization: Bearer $CRON_SECRET". Any scheduler can call it the same way.
 *
 * Members (Settings → Payment reminders):
 *  - payment reminders N days before the due date (default 3, 1 and 0 days)
 *  - optional overdue reminders N days after the due date (default 1, 3 and 7 days)
 *  Sent only for months that are still unpaid, by each member's preferred methods,
 *  and never twice for the same member + month + reminder type + day.
 *
 * Admins (Settings → Notification emails):
 *  - admin_monthly_summary   once, early in each month, covering the month that just ended
 *  - admin_overdue_summary   once per month, a few days after the due day, listing who still owes
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const ledger = await getLedger(db);
  const { settings } = ledger;
  const today = zonedDateString(new Date(), settings.timezone);

  // Member reminders
  const planned = planReminders(ledger, today);
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const reminder of planned) {
    const results = await sendReminder(settings, reminder, { scheduledFor: today });
    for (const r of results) counts[r.status]++;
  }

  const period = ledger.current;
  const previous = addMonths(period, -1);
  const { rows, summary } = monthOverviewFrom(ledger, period);
  const money = (c: number) => formatMoney(c, settings.currency);
  const owingLines = (list: MemberMonthRow[]) =>
    list.map(
      (r) =>
        `  • ${r.fullName} — ${money(r.duesCents)}${r.status === "PENDING" ? " (Zelle reported, waiting for you to confirm)" : ""}${r.phone ? ` · ${r.phone}` : ""}`,
    );

  // Admin: who still owes, a few days after the club due day.
  let overdueAlert = false;
  const due = dueDateOf(period, settings.payment_due_day);
  const daysFromDue = Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
  const owing = rows.filter((r) => r.status === "UNPAID" || r.status === "OVERDUE" || r.status === "PENDING");
  if (daysFromDue >= ADMIN_OVERDUE_DAYS && owing.length > 0) {
    const result = await notifyAdmins(
      "admin_overdue_summary",
      `${owing.length} member${owing.length === 1 ? "" : "s"} still owe for ${periodLabel(period)}`,
      [
        `These members haven't paid for ${periodLabel(period)} (due ${formatDate(due)}):`,
        "",
        ...owingLines(owing),
        "",
        `Still owed this month: ${money(summary.owedCents)} · Collected this month: ${money(summary.collectedCents)}`,
        "",
        `Dashboard: ${siteUrl()}/admin`,
      ].join("\n"),
      `admin_overdue_summary:${periodKey(period)}`,
    );
    overdueAlert = result.sent > 0;
  }

  // Admin: summary of the month that just ended (sent on the first run of the new month).
  let monthlySummary = false;
  const prev = monthOverviewFrom(ledger, previous);
  if (prev.rows.length > 0) {
    const s = prev.summary;
    const prevOwing = prev.rows.filter((r) => r.status === "UNPAID" || r.status === "OVERDUE" || r.status === "PENDING");
    const pct = s.totalMembers ? Math.round((s.paid / s.totalMembers) * 100) : 0;
    const result = await notifyAdmins(
      "admin_monthly_summary",
      `${periodLabel(previous)} summary: ${s.paid} of ${s.totalMembers} paid, ${money(s.collectedCents)} collected`,
      [
        `${settings.club_name} · ${periodLabel(previous)}`,
        "",
        `Paid: ${s.paid} of ${s.totalMembers} members (${pct}%)`,
        `Money received in ${periodLabel(previous)}: ${money(s.collectedCents)} (includes any prepayments)`,
        `Still owed for ${periodLabel(previous)}: ${money(s.owedCents)}`,
        "",
        ...(prevOwing.length ? ["Still owe for this month:", ...owingLines(prevOwing)] : ["Everyone paid. 🎉"]),
        "",
        `Full report: ${siteUrl()}/reports`,
      ].join("\n"),
      `admin_monthly_summary:${periodKey(previous)}`,
    );
    monthlySummary = result.sent > 0;
  }

  return NextResponse.json({
    ok: true,
    today,
    reminders: { planned: planned.length, ...counts },
    overdueAlert,
    monthlySummary,
  });
}
