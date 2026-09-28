"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, updatePassword } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewPasswordField } from "./password-field";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ email }: { email?: string }) {
  const [state, action] = useActionState(updatePassword, {});
  const [confirm, setConfirm] = useState("");
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <NewPasswordField label="New password" email={email} />
      <Field label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}
