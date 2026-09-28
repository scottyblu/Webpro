"use client";

import { useActionState } from "react";
import { requestPasswordReset, updatePassword } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}
