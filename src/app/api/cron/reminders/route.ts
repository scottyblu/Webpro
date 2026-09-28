import { NextResponse, type NextRequest } from "next/server";
import { buildMonthRows, hasLiveSubscription, summarizeMonth, type MemberMonthRow } from "@/lib/billing";
import { cronSecret, siteUrl } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notifications";
import { addMonths, currentPeriod, dueDateOf, periodKey, periodLabel, zonedDateString } from "@/lib/periods";
import { fetchAllMembers, fetchPaymentsInRange } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UPCOMING_DAYS = 3; // send the "payment due soon" reminder this many days before the due day
const PAST_DUE_DAYS = 5; // send the "past due" reminder this many days after the due day

/**
 * Daily reminder job. Vercel Cron calls it (see vercel.json) with
 * "Authorization: Bearer $CRON_SECRET". Any scheduler can call it the same way.
 *
 * Sends, at most once per member per month:
 *  - upcoming_payment_reminder  to unpaid members without auto-pay, a few days before the due day
 *  - past_due_reminder          to unpaid members a few days after the due day
 * (Stripe auto-pay members get payment confirmations / failure notices from the webhook.)
 *
 * And to the addresses in Settings → Notification emails:
 *  - admin_monthly_summary   once, early in each month, covering the month that just ended
 *  - admin_overdue_summary   once per month, when past-due reminders start, listing who still owes
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const settings = await getSettings(db);
  const period = currentPeriod(settings.timezone);
  const previous = addMonths(period, -1);
  const [members, payments] = await Promise.all([fetchAllMembers(db), fetchPaymentsInRange(db, previous, period)]);
  const rows = buildMonthRows({ members, payments, period, settings });
  const byId = new Map(members.map((m) => [m.id, m]));

  const today = zonedDateString(new Date(), settings.timezone);
  const due = dueDateOf(period, settings.payment_due_day);
  const daysFromDue = Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);

  let sent = 0;
  for (const row of rows) {
    if (row.status !== "UNPAID") continue;
    const member = byId.get(row.memberId)!;
    const autopay = hasLiveSubscription(member) && member.subscription_status !== "past_due";

    let type: "upcoming_payment_reminder" | "past_due_reminder" | null = null;
    if (!autopay && daysFromDue >= -UPCOMING_DAYS && daysFromDue < 0) type = "upcoming_payment_reminder";
    else if (daysFromDue >= PAST_DUE_DAYS && member.joined_date <= due) type = "past_due_reminder";
    if (!type) continue;

    await notify(
      type,
      { memberId: member.id, name: member.full_name, email: member.email, phone: member.phone },
      {
        clubName: settings.club_name,
        amount: formatMoney(settings.monthly_fee_cents, settings.currency),
        periodLabel: periodLabel(period),
        dueDate: formatDate(due),
        dashboardUrl: `${siteUrl()}/dashboard`,
        payInstructions: settings.zelle_contact
          ? `Pay with Zelle to ${settings.zelle_recipient_name ? `${settings.zelle_recipient_name} ` : ""}(${settings.zelle_contact}), then tap "I've sent my Zelle payment" in the app.`
          : undefined,
      },
      `${type}:${member.id}:${periodKey(period)}`,
    );
    sent++;
  }

  const fee = formatMoney(settings.monthly_fee_cents, settings.currency);
  const money = (c: number) => formatMoney(c, settings.currency);
  const owingLines = (list: MemberMonthRow[]) =>
    list.map((r) => `  • ${r.fullName}${r.status === "PENDING" ? " (Zelle reported, waiting for you to confirm)" : ""}${r.phone ? ` · ${r.phone}` : ""}`);

  // Admin: who still owes, once past-due reminders have started this month.
  let overdueAlert = false;
  const owing = rows.filter((r) => r.status === "UNPAID" || r.status === "PENDING");
  if (daysFromDue >= PAST_DUE_DAYS && owing.length > 0) {
    const summary = summarizeMonth(rows, settings);
    const result = await notifyAdmins(
      "admin_overdue_summary",
      `${owing.length} member${owing.length === 1 ? "" : "s"} still owe for ${periodLabel(period)}`,
      [
        `These members haven't paid their ${fee} for ${periodLabel(period)} (due ${formatDate(due)}):`,
        "",
        ...owingLines(owing),
        "",
        `Still owed: ${money(summary.owedCents)} · Collected so far: ${money(summary.collectedCents)} of ${money(summary.expectedCents)}`,
        "They've each been sent a past-due reminder.",
        "",
        `Dashboard: ${siteUrl()}/admin`,
      ].join("\n"),
      `admin_overdue_summary:${periodKey(period)}`,
    );
    overdueAlert = result.sent > 0;
  }

  // Admin: summary of the month that just ended (sent on the first run of the new month).
  let monthlySummary = false;
  const prevRows = buildMonthRows({ members, payments, period: previous, settings });
  if (prevRows.length > 0) {
    const s = summarizeMonth(prevRows, settings);
    const prevOwing = prevRows.filter((r) => r.status === "UNPAID" || r.status === "PENDING");
    const pct = s.totalMembers ? Math.round((s.paid / s.totalMembers) * 100) : 0;
    const result = await notifyAdmins(
      "admin_monthly_summary",
      `${periodLabel(previous)} summary: ${s.paid} of ${s.totalMembers} paid, ${money(s.collectedCents)} collected`,
      [
        `${settings.club_name} · ${periodLabel(previous)}`,
        "",
        `Paid: ${s.paid} of ${s.totalMembers} members (${pct}%)`,
        `Collected: ${money(s.collectedCents)} of ${money(s.expectedCents)} expected`,
        `Still owed: ${money(s.owedCents)}`,
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
    period: periodKey(period),
    considered: rows.length,
    reminders: sent,
    overdueAlert,
    monthlySummary,
  });
}
