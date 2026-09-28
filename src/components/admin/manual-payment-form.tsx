"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { ActionState } from "@/lib/types";

export function ManualPaymentForm({
  action,
  periods,
  defaultPeriod,
  defaultAmount,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  periods: { key: string; label: string }[];
  defaultPeriod: string;
  defaultAmount: string;
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" key={state.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="For month" htmlFor="period">
          <Select id="period" name="period" defaultValue={defaultPeriod}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method" htmlFor="method">
          <Select id="method" name="method" defaultValue="cash">
            {MANUAL_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount ($)" htmlFor="amount">
          <Input id="amount" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={defaultAmount} required />
        </Field>
        <Field label="Date paid" htmlFor="payment_date">
          <Input id="payment_date" name="payment_date" type="date" defaultValue={today} max={today} required />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" placeholder="e.g. Paid at firehouse" rows={2} />
      </Field>
      <SubmitButton variant="success" pendingText="Saving…">
        Mark as paid
      </SubmitButton>
    </form>
  );
}
