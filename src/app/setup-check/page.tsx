import type { Metadata } from "next";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/logo";
import { emailConfigured } from "@/lib/notifications";
import { verifyEmailLogin } from "@/lib/notifications/providers/email";
import { normalizeKey, normalizeSupabaseUrl } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Setup check", robots: { index: false } };
export const dynamic = "force-dynamic";

type Status = "ok" | "bad" | "warn";
interface Check {
  label: string;
  status: Status;
  detail: string;
}

function keyKind(key: string | undefined): string {
  if (!key) return "missing";
  if (key.startsWith("eyJ")) return "legacy JWT key";
  if (key.startsWith("sb_publishable_")) return "publishable key";
  if (key.startsWith("sb_secret_")) return "secret key";
  return "unrecognised format";
}

/**
 * Setup check: shows whether the app's settings are wired up correctly,
 * without revealing any key values. Open /setup-check on the live site.
 */
export default async function SetupCheckPage() {
  const checks: Check[] = [];
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = normalizeSupabaseUrl(rawUrl);
  const anon = normalizeKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = normalizeKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Supabase URL
  if (!rawUrl) {
    checks.push({ label: "NEXT_PUBLIC_SUPABASE_URL", status: "bad", detail: "Not set in Vercel." });
  } else {
    const cleaned = rawUrl.trim() !== url;
    checks.push({
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: cleaned ? "warn" : "ok",
      detail: cleaned
        ? `Using ${url} (the saved value had extra text, which the app now ignores; you can tidy it to exactly this).`
        : `Using ${url}`,
    });
  }

  // Keys (format only, never values)
  const anonKind = keyKind(anon);
  checks.push({
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status: !anon ? "bad" : anonKind === "secret key" ? "bad" : anonKind === "unrecognised format" ? "warn" : "ok",
    detail: !anon
      ? "Not set in Vercel."
      : anonKind === "secret key"
        ? "This is a SECRET key. Use the anon / publishable key here instead."
        : `Set (${anonKind}, ${anon.length} characters).`,
  });
  const serviceKind = keyKind(service);
  checks.push({
    label: "SUPABASE_SERVICE_ROLE_KEY",
    status: !service ? "bad" : serviceKind === "publishable key" ? "bad" : serviceKind === "unrecognised format" ? "warn" : "ok",
    detail: !service
      ? "Not set in Vercel."
      : serviceKind === "publishable key"
        ? "This is the PUBLISHABLE key. Use the service_role / secret key here instead."
        : `Set (${serviceKind}, ${service.length} characters).`,
  });

  // Live check: can the app reach Supabase Auth with the anon key?
  if (url && anon) {
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, cache: "no-store" });
      checks.push({
        label: "Supabase sign-up / login service",
        status: res.ok ? "ok" : "bad",
        detail: res.ok
          ? "Reachable with the anon key."
          : `Supabase answered ${res.status}: ${(await res.text()).slice(0, 160)}`,
      });
      if (res.ok) {
        const authSettings = (await res.json()) as { mailer_autoconfirm?: boolean };
        checks.push({
          label: "Email verification required",
          status: authSettings.mailer_autoconfirm ? "bad" : "ok",
          detail: authSettings.mailer_autoconfirm
            ? "OFF: new members can get in without confirming their email. In Supabase: Authentication → Sign In / Providers → Email → turn ON \"Confirm email\" → Save."
            : "On: new members must tap the link in their email before they can sign in.",
        });
      }
    } catch (err) {
      checks.push({ label: "Supabase sign-up / login service", status: "bad", detail: `Could not reach ${url}: ${String(err)}` });
    }
  }

  // Live check: database tables (service key) and which SQL files have been run.
  if (url && service) {
    try {
      const res = await fetch(`${url}/rest/v1/club_settings?select=*&id=eq.1`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` },
        cache: "no-store",
      });
      if (!res.ok) {
        checks.push({
          label: "Database (SQL file 0001)",
          status: "bad",
          detail: `Supabase answered ${res.status}: ${(await res.text()).slice(0, 160)}`,
        });
      } else {
        const [row] = (await res.json()) as Record<string, unknown>[];
        checks.push({
          label: "Database (SQL file 0001)",
          status: row ? "ok" : "bad",
          detail: row ? "Tables found." : "club_settings is empty; re-run 0001_initial_schema.sql.",
        });
        if (row) {
          checks.push({
            label: "Zelle (SQL file 0002)",
            status: "zelle_contact" in row ? "ok" : "bad",
            detail: "zelle_contact" in row ? "Installed." : "Run supabase/migrations/0002_zelle_payments.sql in the SQL Editor.",
          });
          const version = await fetch(`${url}/rest/v1/rpc/tbc_schema_version`, {
            method: "POST",
            headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
          });
          checks.push({
            label: "Verified members only (SQL file 0004)",
            status: version.ok ? "ok" : "bad",
            detail: version.ok ? "Installed." : "Run supabase/migrations/0004_verified_members_only.sql in the SQL Editor.",
          });
          checks.push({
            label: "Email alerts (SQL file 0003)",
            status: "notification_emails" in row ? "ok" : "bad",
            detail:
              "notification_emails" in row ? "Installed." : "Run supabase/migrations/0003_admin_notifications.sql in the SQL Editor.",
          });
        }
      }
    } catch (err) {
      checks.push({ label: "Database", status: "bad", detail: String(err) });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  checks.push({
    label: "NEXT_PUBLIC_SITE_URL",
    status: !siteUrl ? "warn" : siteUrl.endsWith("/") ? "warn" : "ok",
    detail: !siteUrl ? "Not set (links in emails may point to the wrong address)." : siteUrl.endsWith("/") ? `${siteUrl}: remove the "/" at the end.` : siteUrl,
  });
  if (emailConfigured()) {
    const login = await verifyEmailLogin();
    checks.push({ label: "Email (Gmail)", status: login.ok ? "ok" : "bad", detail: login.detail });
  } else {
    checks.push({
      label: "Email (Gmail)",
      status: "warn",
      detail: "Not set: GMAIL_ADDRESS and GMAIL_APP_PASSWORD. The app works, but sends no emails.",
    });
  }
  checks.push({
    label: "CRON_SECRET",
    status: process.env.CRON_SECRET ? "ok" : "warn",
    detail: process.env.CRON_SECRET ? "Set (daily reminders can run)." : "Not set: reminders and summaries won't run.",
  });
  checks.push({
    label: "Stripe (optional)",
    status: "ok",
    detail: process.env.STRIPE_SECRET_KEY ? "Card payments on." : "Off (Zelle / cash only).",
  });

  const icon = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle };
  const color = { ok: "text-emerald-600", bad: "text-red-600", warn: "text-amber-600" };
  const problems = checks.filter((c) => c.status === "bad").length;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-stone-50 px-4 pb-12 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Setup check</h1>
      {process.env.BUILD_TIME && (
        <p className="mt-1 text-sm text-stone-500">
          This version was deployed{" "}
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "America/New_York",
          }).format(new Date(process.env.BUILD_TIME))}{" "}
          (Eastern).
        </p>
      )}
      <p className={`mt-1 font-medium ${problems ? "text-red-700" : "text-emerald-700"}`}>
        {problems ? `${problems} problem${problems === 1 ? "" : "s"} to fix` : "Everything required is set up."}
      </p>
      <ul className="mt-6 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {checks.map((c) => {
          const Icon = icon[c.status];
          return (
            <li key={c.label} className="flex gap-3 px-4 py-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color[c.status]}`} aria-hidden />
              <div className="min-w-0">
                <p className="break-all font-semibold text-stone-900">{c.label}</p>
                <p className="break-words text-sm text-stone-600">{c.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-stone-500">No keys or passwords are shown on this page.</p>
    </main>
  );
}
