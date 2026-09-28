"use client";

import { useActionState } from "react";
import { addAdmin, updateSettings } from "@/app/actions/settings";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ClubSettings } from "@/lib/types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function SettingsForm({ settings }: { settings: ClubSettings }) {
  const [state, action] = useActionState(updateSettings, {});
  const timezones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES];
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Club</legend>
        <Field label="Club name" htmlFor="club_name" className="sm:col-span-2">
          <Input id="club_name" name="club_name" defaultValue={settings.club_name} required />
        </Field>
        <Field
          label="Monthly membership fee ($)"
          htmlFor="monthly_fee"
          hint="The amount members pay each month. Also used for expected revenue and new Stripe subscriptions (existing Stripe subscriptions keep their price)."
        >
          <Input id="monthly_fee" name="monthly_fee" type="number" min="1" step="0.01" inputMode="decimal" defaultValue={(settings.monthly_fee_cents / 100).toFixed(2)} required />
        </Field>
        <Field label="Payment due day" htmlFor="payment_due_day" hint="Day of the month dues are due for members paying manually (1–28).">
          <Input id="payment_due_day" name="payment_due_day" type="number" min="1" max="28" defaultValue={settings.payment_due_day} required />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue="usd">
            <option value="usd">USD — US Dollar</option>
          </Select>
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Decides which month a payment belongs to.">
          <Select id="timezone" name="timezone" defaultValue={settings.timezone}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Zelle (shown to members)</legend>
        <p className="-mt-1 text-sm text-stone-500 sm:col-span-2">
          Fill in the Zelle email or phone number where members should send dues. Leave blank to hide the Zelle option.
        </p>
        <Field label="Recipient name (as it appears in Zelle)" htmlFor="zelle_recipient_name">
          <Input id="zelle_recipient_name" name="zelle_recipient_name" defaultValue={settings.zelle_recipient_name ?? ""} placeholder="e.g. John Smith" />
        </Field>
        <Field label="Zelle email or phone number" htmlFor="zelle_contact">
          <Input id="zelle_contact" name="zelle_contact" defaultValue={settings.zelle_contact ?? ""} placeholder="e.g. dues@example.com or (555) 123-4567" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Admin contact (shown to members)</legend>
        <Field label="Name" htmlFor="admin_name">
          <Input id="admin_name" name="admin_name" defaultValue={settings.admin_name ?? ""} />
        </Field>
        <Field label="Email" htmlFor="admin_email">
          <Input id="admin_email" name="admin_email" type="email" defaultValue={settings.admin_email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="admin_phone">
          <Input id="admin_phone" name="admin_phone" type="tel" defaultValue={settings.admin_phone ?? ""} />
        </Field>
      </fieldset>

      <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function AddAdminForm() {
  const [state, action] = useActionState(addAdmin, {});
  return (
    <form action={action} className="space-y-3" key={state.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="admin-email" className="sr-only">
          Email of the person to make an administrator
        </label>
        <Input id="admin-email" name="email" type="email" placeholder="person@example.com" required className="sm:flex-1" />
        <SubmitButton pendingText="Adding…">Add administrator</SubmitButton>
      </div>
      <p className="text-xs text-stone-500">They must create an account first (Register page), then you can add them here.</p>
    </form>
  );
}
