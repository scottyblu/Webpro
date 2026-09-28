import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { syncCheckoutSession } from "@/lib/stripe/sync";

/**
 * Stripe redirects here after a successful Checkout. We sync the session right away
 * so the dashboard shows PAID immediately (the webhook does the same thing and is the
 * source of truth — both are idempotent, so whichever runs first wins).
 */
export async function GET(request: NextRequest) {
  const base = siteUrl();
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const member = await getCurrentMember();

  if (sessionId && member) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      // Only sync sessions that belong to the signed-in member.
      if (session.client_reference_id === member.id && session.status === "complete") {
        await syncCheckoutSession(session);
      }
    } catch (err) {
      console.error("[stripe] checkout success sync failed", err);
    }
  }

  return NextResponse.redirect(`${base}/dashboard?checkout=success`, 303);
}
