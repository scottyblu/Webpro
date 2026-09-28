import "server-only";
import Stripe from "stripe";
import { stripeSecretKey } from "@/lib/env";

let stripe: Stripe | null = null;

/** Lazily-created Stripe client (so builds don't need the secret key). */
export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(stripeSecretKey(), {
      appInfo: { name: "The Breakfast Club" },
    });
  }
  return stripe;
}
