import { NextResponse } from "next/server";
import { hasLiveSubscription } from "@/lib/billing";
import { getCurrentMember, getCurrentUser } from "@/lib/auth";
import { siteUrl, stripeEnabled, stripePriceId } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

/** Start a Stripe Checkout session for the signed-in member's $20/month subscription. */
export async function POST() {
  const base = siteUrl();
  if (!stripeEnabled()) return NextResponse.redirect(`${base}/dashboard?error=no-stripe`, 303);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/login`, 303);

  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(`${base}/dashboard?error=no-member`, 303);
  if (member.membership_status === "inactive") {
    return NextResponse.redirect(`${base}/dashboard?error=inactive`, 303);
  }

  const stripe = getStripe();
  const db = createAdminClient();

  // Already subscribed? Send them to the Customer Portal instead of creating a second subscription.
  if (hasLiveSubscription(member) && member.stripe_customer_id) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: `${base}/dashboard`,
    });
    return NextResponse.redirect(portal.url, 303);
  }

  const settings = await getSettings(db);

  let customerId = member.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: member.email,
        name: member.full_name,
        phone: member.phone ?? undefined,
        metadata: { member_id: member.id },
      },
      { idempotencyKey: `customer-${member.id}` },
    );
    customerId = customer.id;
    await db.from("members").update({ stripe_customer_id: customerId }).eq("id", member.id);
  }

  const priceId = stripePriceId();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: member.id,
    metadata: { member_id: member.id },
    subscription_data: { metadata: { member_id: member.id } },
    line_items: [
      priceId
        ? { price: priceId, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: settings.currency,
              unit_amount: settings.monthly_fee_cents,
              recurring: { interval: "month" },
              product_data: { name: `${settings.club_name} — Monthly Membership` },
            },
          },
    ],
    allow_promotion_codes: false,
    success_url: `${base}/api/stripe/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard?checkout=cancelled`,
  });

  if (!session.url) return NextResponse.redirect(`${base}/dashboard?error=checkout`, 303);
  return NextResponse.redirect(session.url, 303);
}
