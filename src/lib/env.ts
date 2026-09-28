import { normalizeKey, normalizeSupabaseUrl } from "@/lib/supabase/config";

/**
 * Central place for reading environment variables.
 * Every secret is read from the environment — never hardcoded.
 * See .env.example for where each value comes from.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (locally) or your hosting provider's environment settings. See .env.example.`,
    );
  }
  return value;
}

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL));
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", normalizeKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));

export const supabaseServiceRoleKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", normalizeKey(process.env.SUPABASE_SERVICE_ROLE_KEY));

/** Stripe is optional: card payments are offered only when a secret key is configured. */
export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

export const stripeSecretKey = () => required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
export const stripeWebhookSecret = () => required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
/** Optional. When set, Checkout uses this Stripe Price instead of the fee from Settings. */
export const stripePriceId = () => process.env.STRIPE_PRICE_ID || null;

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const cronSecret = () => process.env.CRON_SECRET || null;
