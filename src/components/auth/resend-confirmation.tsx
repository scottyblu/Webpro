"use client";

import { useActionState } from "react";
import { resendConfirmation } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

/** "Didn't get it? Resend the confirmation email" */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      {state.error || state.message ? <FormMessage state={state} /> : null}
      <p className="text-sm text-stone-600">
        Didn&apos;t get it? Check your spam folder, or
      </p>
      <SubmitButton variant="secondary" pendingText="Sending…">
        Resend confirmation email
      </SubmitButton>
    </form>
  );
}
