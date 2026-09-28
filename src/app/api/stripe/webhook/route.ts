import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeWebhookSecret } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { recordInvoice, syncCheckoutSession, syncSubscription } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint: https://YOUR-DOMAIN/api/stripe/webhook
 *
 * Events handled (select these in the Stripe Dashboard):
 *   checkout.session.completed
 *   customer.subscription.created / updated / deleted
 *   invoice.paid
 *   invoice.payment_failed
 *   invoice.payment_action_required
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret());
  } catch (err) {
    console.error("[stripe] webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();

  // Idempotency: skip events we've already processed successfully.
  const { data: seen } = await db.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await syncCheckoutSession(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "invoice.paid":
        await recordInvoice(event.data.object, "paid");
        break;
      case "invoice.payment_failed":
        await recordInvoice(event.data.object, "failed");
        break;
      case "invoice.payment_action_required":
        await recordInvoice(event.data.object, "pending");
        break;
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(`[stripe] failed to process ${event.type} ${event.id}`, err);
    // Non-2xx => Stripe retries later. Handlers are idempotent so retries are safe.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  await db.from("stripe_events").insert({ id: event.id, type: event.type });
  return NextResponse.json({ received: true });
}
