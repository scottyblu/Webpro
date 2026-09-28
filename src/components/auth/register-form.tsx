"use client";

import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone number" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
