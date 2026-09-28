"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ResendConfirmation } from "./resend-confirmation";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, {});
  const [email, setEmail] = useState(""); // controlled so a failed sign-in doesn't clear it
  return (
    <>
      <form action={action} className="space-y-4">
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
      {state.unconfirmedEmail && (
        <div className="mt-6 border-t border-stone-100 pt-6">
          <ResendConfirmation email={state.unconfirmedEmail} />
        </div>
      )}
    </>
  );
}
