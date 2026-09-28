"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/types";

export interface MemberFormValues {
  full_name: string;
  email: string;
  phone: string;
  joined_date: string;
  notes: string;
}

export function MemberForm({
  action,
  initial,
  submitLabel,
  showInvite = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: MemberFormValues;
  submitLabel: string;
  showInvite?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={initial.full_name} required />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={initial.email} required />
        </Field>
        <Field label="Phone number" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone} />
        </Field>
        <Field label="Date joined" htmlFor="joined_date">
          <Input id="joined_date" name="joined_date" type="date" defaultValue={initial.joined_date} required />
        </Field>
      </div>
      <Field label="Admin notes" htmlFor="notes" hint="Only visible to administrators.">
        <Textarea id="notes" name="notes" defaultValue={initial.notes} />
      </Field>
      {showInvite && (
        <label className="flex items-start gap-3 rounded-lg bg-stone-50 p-3 text-sm">
          <input type="checkbox" name="send_invite" defaultChecked className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-500" />
          <span>
            <span className="font-medium text-stone-800">Email them an invitation to log in</span>
            <span className="block text-stone-500">So they can pay online and see their history. Leave unchecked for cash-only members.</span>
          </span>
        </label>
      )}
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
