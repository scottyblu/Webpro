"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CoveragePreview,
  PaymentOptionFields,
  usePaymentOptions,
} from "@/components/payments/payment-options";
import { FormMessage } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { parsePeriodKey } from "@/lib/periods";
import type { ActionState } from "@/lib/types";

/**
 * Admin "Record a payment": one month, multiple months, a full year or a custom
 * amount (minimum $20). One payment = one transaction that covers whole months.
 */
export function ManualPaymentForm(props: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Months the payment can start from ("(paid)" marks months already covered). */
  periods: { key: string; label: string }[];
  defaultPeriod: string;
  duesCents: number;
  currency: string;
  paidKeys: string[];
  today: string;
}) {
  const [state, formAction] = useActionState(props.action, {});
  // Re-mount the fields after a successful save so the form starts fresh.
  return <PaymentFormFields key={state.ok ? state.message : "form"} {...props} state={state} formAction={formAction} />;
}

function PaymentFormFields({
  periods,
  defaultPeriod,
  duesCents,
  currency,
  paidKeys,
  today,
  state,
  formAction,
}: Parameters<typeof ManualPaymentForm>[0] & { state: ActionState; formAction: (fd: FormData) => void }) {
  const options = usePaymentOptions(duesCents);
  const [start, setStart] = useState(defaultPeriod);
  const paid = useMemo(() => new Set(paidKeys), [paidKeys]);
  const startPeriod = parsePeriodKey(start) ?? parsePeriodKey(defaultPeriod)!;

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <PaymentOptionFields state={options} currency={currency} />

      <div className="grid gap-4 sm:grid-cols-2">
        {options.coverMonths > 0 && (
          <Field label="Starting month" htmlFor="start" hint="Months already paid are skipped.">
            <Select id="start" name="start" value={start} onChange={(e) => setStart(e.target.value)}>
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Paid by" htmlFor="method">
          <Select id="method" name="method" defaultValue="zelle">
            {MANUAL_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date paid" htmlFor="payment_date">
          <Input id="payment_date" name="payment_date" type="date" defaultValue={today} max={today} required />
        </Field>
      </div>

      <CoveragePreview state={options} start={startPeriod} paidKeys={paid} currency={currency} />

      <Field label="Note (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" placeholder="e.g. Paid at firehouse" rows={2} />
      </Field>
      <SubmitButton variant="success" pendingText="Saving…" disabled={!options.valid}>
        {options.valid ? `Record ${formatMoney(options.amountCents, currency)} payment` : "Record payment"}
      </SubmitButton>
    </form>
  );
}
