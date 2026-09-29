"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MIN_PAYMENT_CENTS, NOTIFICATION_PREF_LABELS } from "@/lib/constants";
import type { ActionState, NotificationPref } from "@/lib/types";

export interface MemberFormValues {
  full_name: string;
  email: string;
  phone: string;
  joined_date: string;
  notes: string;
  notification_pref: NotificationPref;
  /** Dollars, "" = club default. */
  dues: string;
  /** "" = club default. */
  due_day: string;
}

export function MemberForm({
  action,
  initial,
  submitLabel,
  showInvite = false,
  clubDues,
  clubDueDay,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: MemberFormValues;
  submitLabel: string;
  showInvite?: boolean;
  /** Club default monthly amount, formatted (e.g. "$20"). */
  clubDues: string;
  clubDueDay: number;
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
        <Field label="Phone number" htmlFor="phone" hint="Needed for text (SMS) reminders.">
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone} placeholder="(555) 123-4567" />
        </Field>
        <Field label="Date joined" htmlFor="joined_date">
          <Input id="joined_date" name="joined_date" type="date" defaultValue={initial.joined_date} required />
        </Field>
        <Field label="Monthly amount ($)" htmlFor="dues" hint={`Leave blank for the club amount (${clubDues}). Minimum $20.`}>
          <Input
            id="dues"
            name="dues"
            type="number"
            inputMode="decimal"
            min={MIN_PAYMENT_CENTS / 100}
            step="0.01"
            defaultValue={initial.dues}
            placeholder={clubDues.replace("$", "")}
          />
        </Field>
        <Field label="Due day of the month" htmlFor="due_day" hint={`Leave blank for the club due day (${clubDueDay}).`}>
          <Input
            id="due_day"
            name="due_day"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            defaultValue={initial.due_day}
            placeholder={String(clubDueDay)}
          />
        </Field>
        <Field label="Payment reminders by" htmlFor="notification_pref" className="sm:col-span-2" hint="Text needs a phone number. App notifications need the app installed with notifications allowed.">
          <Select id="notification_pref" name="notification_pref" defaultValue={initial.notification_pref}>
            {(Object.keys(NOTIFICATION_PREF_LABELS) as NotificationPref[]).map((k) => (
              <option key={k} value={k}>
                {NOTIFICATION_PREF_LABELS[k]}
              </option>
            ))}
          </Select>
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
