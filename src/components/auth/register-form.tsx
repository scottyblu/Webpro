"use client";

import { useActionState, useState } from "react";
import { signUp } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewPasswordField } from "./password-field";
import { ResendConfirmation } from "./resend-confirmation";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, {});
  // Controlled fields so nothing the person typed is cleared when the form shows an error.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState("");

  if (state.ok) {
    return (
      <div className="space-y-6">
        <FormMessage state={state} />
        {state.unconfirmedEmail && (
          <ResendConfirmation email={state.unconfirmedEmail} />
        )}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="full_name">
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </Field>
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
      <Field label="Phone number" htmlFor="phone">
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <NewPasswordField email={email} />
      <Field label="Confirm password" htmlFor="confirm">
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
      <SubmitButton
        className="w-full"
        size="lg"
        pendingText="Creating account…"
      >
        Create account
      </SubmitButton>
    </form>
  );
}
