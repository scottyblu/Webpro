"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ fullName, email, phone }: { fullName: string; email: string; phone: string }) {
  const [state, action] = useActionState(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={fullName} autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email" hint="Contact an administrator to change your email.">
        <Input id="email" value={email} disabled className="bg-stone-50 text-stone-500" />
      </Field>
      <Field label="Phone number" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" />
      </Field>
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}
