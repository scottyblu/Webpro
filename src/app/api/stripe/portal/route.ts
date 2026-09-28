import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { siteUrl, stripeEnabled } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";

/** Open the Stripe Customer Portal (update card, view invoices, cancel). */
export async function POST() {
  const base = siteUrl();
  if (!stripeEnabled()) return NextResponse.redirect(`${base}/dashboard?error=no-stripe`, 303);
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(`${base}/login`, 303);
  if (!member.stripe_customer_id) return NextResponse.redirect(`${base}/dashboard?error=no-customer`, 303);

  const portal = await getStripe().billingPortal.sessions.create({
    customer: member.stripe_customer_id,
    return_url: `${base}/dashboard`,
  });
  return NextResponse.redirect(portal.url, 303);
}
