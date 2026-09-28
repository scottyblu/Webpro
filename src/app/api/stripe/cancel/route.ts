import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { siteUrl, stripeEnabled } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { syncSubscription } from "@/lib/stripe/sync";

/**
 * Member cancels their own subscription. It stays active until the end of the
 * month they've already paid for, then Stripe cancels it (and the webhook marks
 * the membership CANCELLED).
 */
export async function POST() {
  const base = siteUrl();
  if (!stripeEnabled()) return NextResponse.redirect(`${base}/dashboard?error=no-stripe`, 303);
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(`${base}/login`, 303);
  if (!member.stripe_subscription_id) return NextResponse.redirect(`${base}/dashboard`, 303);

  const subscription = await getStripe().subscriptions.update(member.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  await syncSubscription(subscription);
  return NextResponse.redirect(`${base}/dashboard?cancelled=1`, 303);
}
