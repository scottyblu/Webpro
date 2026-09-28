import { NextResponse, type NextRequest } from "next/server";
import { buildMonthRows, hasLiveSubscription } from "@/lib/billing";
import { cronSecret, siteUrl } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { currentPeriod, dueDateOf, periodKey, periodLabel, zonedDateString } from "@/lib/periods";
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
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const settings = await getSettings(db);
  const period = currentPeriod(settings.timezone);
  const [members, payments] = await Promise.all([fetchAllMembers(db), fetchPaymentsInRange(db, period, period)]);
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
      },
      `${type}:${member.id}:${periodKey(period)}`,
    );
    sent++;
  }

  return NextResponse.json({ ok: true, period: periodKey(period), considered: rows.length, reminders: sent });
}
