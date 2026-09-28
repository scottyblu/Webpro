import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CreditCard, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";
import { getAdminRecord, getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect((await getAdminRecord()) ? "/admin" : "/dashboard");

  return (
    <main className="flex min-h-dvh flex-col bg-stone-900 text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo light />
        <Link href="/login" className="text-sm font-semibold text-stone-300 hover:text-white">
          Sign in
        </Link>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Members only</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">The Breakfast Club</h1>
        <p className="mt-5 max-w-xl text-lg text-stone-300">
          Pay your $20 monthly membership in seconds, see your payment history, and manage your card — all in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className={buttonClass("primary", "lg")}>
            Become a member
          </Link>
          <Link href="/login" className={buttonClass("secondary", "lg")}>
            Member sign in
          </Link>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: CreditCard, title: "Secure payments", text: "Card payments handled by Stripe. We never store your card." },
            { icon: CalendarCheck, title: "Automatic monthly", text: "Set it once and your dues are paid every month." },
            { icon: ShieldCheck, title: "Private", text: "Only you and the club administrators see your payments." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-stone-700 bg-stone-800/50 p-5">
              <Icon className="h-6 w-6 text-brand-400" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-stone-400">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
