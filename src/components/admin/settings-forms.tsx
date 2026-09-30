"use client";

import { useActionState, useState, useTransition } from "react";
import { createPushKeys } from "@/app/actions/reminders";
import { addAdmin, sendTestEmail, updateReminderSettings, updateSettings } from "@/app/actions/settings";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { DEFAULT_OVERDUE_MESSAGE, DEFAULT_REMINDER_MESSAGE } from "@/lib/constants";
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
          hint="The amount members pay each month (minimum $20). Also used for expected revenue and new Stripe subscriptions (existing Stripe subscriptions keep their price)."
        >
          <Input id="monthly_fee" name="monthly_fee" type="number" min="20" step="0.01" inputMode="decimal" defaultValue={(settings.monthly_fee_cents / 100).toFixed(2)} required />
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

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Notification emails</legend>
        <Field
          label="Send admin alerts to"
          htmlFor="notification_emails"
          hint="One email per line (up to 10). These addresses get an alert when a member reports a Zelle payment, a list of who still owes a few days after the due date, and a summary at the start of each month."
        >
          <Textarea
            id="notification_emails"
            name="notification_emails"
            rows={3}
            defaultValue={(settings.notification_emails ?? []).join("\n")}
            placeholder={"you@example.com\ntreasurer@example.com"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
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

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-lg bg-stone-50 p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-500" />
      <span>
        <span className="font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Settings → Payment reminders. */
export function ReminderSettingsForm({
  settings,
  services,
}: {
  settings: ClubSettings;
  /** Which delivery services are connected (environment variables). */
  services: { sms: boolean; email: boolean; push: boolean };
}) {
  const [state, action] = useActionState(updateReminderSettings, {});
  const notSet = " — not set up yet, see below";
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Before the due date</legend>
        <Toggle
          name="reminders_enabled"
          label="Send automatic payment reminders"
          hint="Only to members who haven't paid that month yet. They stop as soon as the month is paid (or prepaid)."
          defaultChecked={settings.reminders_enabled}
        />
        <Field label="Days before the due date" htmlFor="reminder_days_before" hint="Comma-separated. 0 = on the due date. Default: 3, 1, 0">
          <Input id="reminder_days_before" name="reminder_days_before" defaultValue={settings.reminder_days_before.join(", ")} inputMode="numeric" />
        </Field>
        <Field
          label="Reminder message"
          htmlFor="reminder_message"
          hint="Leave blank for the standard message. You can use {first_name}, {amount}, {club}, {due_date} and {month}."
        >
          <Textarea id="reminder_message" name="reminder_message" rows={2} defaultValue={settings.reminder_message ?? ""} placeholder={DEFAULT_REMINDER_MESSAGE} maxLength={500} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">After the due date</legend>
        <Toggle
          name="overdue_enabled"
          label="Send overdue reminders"
          hint="To members whose month is still unpaid after the due date. Each is sent only once."
          defaultChecked={settings.overdue_enabled}
        />
        <Field label="Days after the due date" htmlFor="overdue_days_after" hint="Comma-separated. Default: 1, 3, 7">
          <Input id="overdue_days_after" name="overdue_days_after" defaultValue={settings.overdue_days_after.join(", ")} inputMode="numeric" />
        </Field>
        <Field label="Overdue message" htmlFor="overdue_message" hint="Leave blank for the standard message. Same placeholders as above.">
          <Textarea id="overdue_message" name="overdue_message" rows={2} defaultValue={settings.overdue_message ?? ""} placeholder={DEFAULT_OVERDUE_MESSAGE} maxLength={500} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Send reminders by</legend>
        <p className="-mt-1 text-sm text-stone-500">Each member also picks their own preference on their profile (text, email, app, or none).</p>
        <Toggle name="sms_enabled" label={`Text message (SMS)${services.sms ? "" : notSet}`} hint="Members with a phone number." defaultChecked={settings.sms_enabled} />
        <Toggle name="email_enabled" label={`Email${services.email ? "" : notSet}`} defaultChecked={settings.email_enabled} />
        <Toggle
          name="push_enabled"
          label={`App notifications${services.push ? "" : notSet}`}
          hint="Members who installed the app and turned on notifications."
          defaultChecked={settings.push_enabled}
        />
      </fieldset>

      <SubmitButton pendingText="Saving…">Save reminder settings</SubmitButton>
    </form>
  );
}

/** Creates the key pair app notifications need, for the admin to paste into Vercel. */
export function PushKeysGenerator({ configured }: { configured: boolean }) {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (configured && !keys) {
    return <p className="text-sm text-emerald-700">App notifications are set up. Members can turn them on from their dashboard.</p>;
  }
  return (
    <div className="space-y-3 text-sm">
      {!keys ? (
        <>
          <p className="text-stone-600">
            App notifications need two keys. Tap the button to create them, then add them in Vercel (Settings → Environment Variables) and Redeploy.
          </p>
          <button
            type="button"
            className={buttonClass("secondary")}
            disabled={pending}
            onClick={() => startTransition(async () => setKeys(await createPushKeys()))}
          >
            {pending ? "Creating…" : "Create app notification keys"}
          </button>
        </>
      ) : (
        <>
          <p className="text-stone-600">Add these two environment variables in Vercel, then Redeploy. Keep the private key secret.</p>
          {[
            { name: "VAPID_PUBLIC_KEY", value: keys.publicKey, type: "Config" },
            { name: "VAPID_PRIVATE_KEY", value: keys.privateKey, type: "Secret" },
          ].map((k) => (
            <div key={k.name} className="rounded-lg bg-stone-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs font-semibold">
                  {k.name} <span className="font-sans font-normal text-stone-500">({k.type})</span>
                </p>
                <CopyButton text={k.value} />
              </div>
              <p className="mt-1 select-all break-all font-mono text-xs text-stone-800">{k.value}</p>
            </div>
          ))}
          <p className="text-xs text-stone-500">These keys are not saved anywhere. If you lose them, create new ones (members will need to turn notifications on again).</p>
        </>
      )}
    </div>
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

export function TestEmailButton({ configured }: { configured: boolean }) {
  const [state, action] = useActionState(sendTestEmail, {});
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {!configured && (
        <p className="text-sm text-stone-600">
          Email isn&apos;t connected yet. Add <code className="rounded bg-stone-100 px-1">GMAIL_ADDRESS</code> and{" "}
          <code className="rounded bg-stone-100 px-1">GMAIL_APP_PASSWORD</code> in Vercel, then redeploy.
        </p>
      )}
      <SubmitButton variant="secondary" pendingText="Sending…">
        Send test email
      </SubmitButton>
    </form>
  );
}
