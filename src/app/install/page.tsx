import type { Metadata } from "next";
import Link from "next/link";
import { ClubLogo } from "@/components/club-logo";
import { InstallGuide } from "@/components/pwa/install-guide";
import { siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  title: "Add the app to your phone",
  description: "Step-by-step pictures for adding the Breakfast Club app to your iPhone or Android home screen.",
};

/** Public guide: how to add the app to an iPhone or Android home screen (share it with new members). */
export default function InstallPage() {
  let host = "payforbreakfast.com";
  try {
    host = new URL(siteUrl()).host;
  } catch {
    // Keep the default.
  }

  return (
    <main className="min-h-dvh bg-stone-100 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-xl">
        <Link href="/">
          <ClubLogo />
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Put the club app on your phone</h1>
        <p className="mt-2 text-stone-600">
          It takes about a minute. After this, the club shows up as an app icon: tap it to pay your dues, see what you owe
          and get reminders.
        </p>

        <div className="mt-6">
          <InstallGuide siteHost={host} />
        </div>

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-stone-900">Once you&apos;re in</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-stone-600 [&_b]:text-stone-900">
            <li>
              <b>New member?</b> Tap <b>Create an account</b>, then tap the link in the confirmation email before signing in.
            </li>
            <li>
              <b>Pay your dues:</b> tap the <b>Pay</b> button on your dashboard and choose Zelle or Venmo, then tap{" "}
              <b>“I&apos;ve sent my payment”</b>.
            </li>
            <li>
              <b>Get reminders on your phone:</b> on your dashboard, tap <b>Turn on</b> next to “App notifications”, then{" "}
              <b>Allow</b>.
            </li>
            <li>
              <b>Forgot your password?</b> Tap <b>Forgot password?</b> on the sign-in screen. The reset link works right from
              your email app.
            </li>
          </ul>
        </section>

        <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-semibold">
          <Link href="/login" className="rounded-lg bg-brand-500 px-4 py-2.5 text-white hover:bg-brand-600">
            Sign in
          </Link>
          <Link href="/register" className="rounded-lg bg-white px-4 py-2.5 text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
