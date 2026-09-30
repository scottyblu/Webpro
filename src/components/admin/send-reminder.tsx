"use client";

import { useActionState } from "react";
import { BellRing } from "lucide-react";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/types";

export interface ReminderChannelOption {
  value: "sms" | "email" | "push";
  label: string;
  /** Where it goes (phone, email, "App"), or why it can't be used. */
  detail: string;
  available: boolean;
}

/** "Send reminder" on a member profile: only the methods that can reach this member can be picked. */
export function SendReminderForm({
  action,
  options,
  about,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: ReminderChannelOption[];
  /** What the reminder is about, e.g. "October 2026 · due Oct 1" */
  about: string | null;
}) {
  const [state, formAction] = useActionState(action, {});
  const anyAvailable = options.some((o) => o.available);

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      {about ? (
        <p className="text-sm text-stone-600">
          About: <span className="font-semibold text-stone-900">{about}</span>
        </p>
      ) : (
        <p className="text-sm text-emerald-700">Paid up — nothing to remind them about.</p>
      )}
      <fieldset className="space-y-2">
        <legend className="sr-only">Send by</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
              o.available ? "cursor-pointer bg-white ring-stone-200 hover:bg-stone-50" : "cursor-not-allowed bg-stone-50 ring-stone-100 text-stone-400"
            }`}
          >
            <input
              type="checkbox"
              name="channel"
              value={o.value}
              defaultChecked={o.available}
              disabled={!o.available}
              className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-500"
            />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-stone-500">{o.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingText="Sending…" disabled={!anyAvailable || !about}>
        <BellRing className="h-4 w-4" aria-hidden /> Send reminder
      </SubmitButton>
    </form>
  );
}
