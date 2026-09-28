"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";

/** Friendly fallback for unexpected errors (instead of a blank "Application error" page). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-stone-100 px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold text-stone-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-stone-600">
        Please try again. If this keeps happening, an administrator can open the setup check to see what&apos;s wrong.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-stone-400">Error code: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => reset()} className={buttonClass("primary", "lg")}>
          Try again
        </button>
        <Link href="/setup-check" className={buttonClass("secondary", "lg")}>
          Setup check
        </Link>
      </div>
    </main>
  );
}
