"use client";

import { useActionState, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { reportZellePayment } from "@/app/actions/payments";
import {
  CoveragePreview,
  PaymentOptionFields,
  coveredPeriods,
  describePeriods,
  usePaymentOptions,
} from "@/components/payments/payment-options";
import { FormMessage } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import { parsePeriodKey } from "@/lib/periods";

/**
 * "Pay with Zelle": choose one month, several months, a full year or a custom amount
 * (minimum $20), see who to send to and what to write in the memo, then "I've sent it".
 */
export function ZelleCard({
  duesCents,
  currency,
  recipientName,
  contact,
  memberName,
  periods,
  defaultPeriod,
  takenKeys,
}: {
  duesCents: number;
  currency: string;
  recipientName: string | null;
  contact: string;
  memberName: string;
  /** Months a payment can start from (not already paid or waiting for confirmation). */
  periods: { key: string; label: string }[];
  defaultPeriod: string;
  /** Months already paid or reported (skipped when covering several months). */
  takenKeys: string[];
}) {
  const [state, action] = useActionState(reportZellePayment, {});
  const options = usePaymentOptions(duesCents);
  const [start, setStart] = useState(defaultPeriod);
  const taken = useMemo(() => new Set(takenKeys), [takenKeys]);
  const startPeriod = parsePeriodKey(start) ?? parsePeriodKey(defaultPeriod)!;
  const amount = options.valid ? formatMoney(options.amountCents, currency) : "your payment";
  const covered = options.valid ? coveredPeriods(startPeriod, options.coverMonths, taken) : [];
  const memo = `Breakfast Club – ${covered.length ? describePeriods(covered) : "dues"} – ${memberName}`;

  if (state.ok) {
    return (
      <Card>
        <div id="zelle" className="scroll-mt-20" />
        <CardHeader title="Pay with Zelle" />
        <CardBody>
          <FormMessage state={state} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <div id="zelle" className="scroll-mt-20" />
      <CardHeader title="Pay with Zelle" description="Choose how much to pay, send it from your bank's app, then let us know below." />
      <CardBody>
        <form action={action} className="space-y-5">
          <FormMessage state={state} />
          <PaymentOptionFields state={options} currency={currency} allowDonation={false} />

          {options.coverMonths > 0 && (
            <Field label="Starting with" htmlFor="zelle-start" hint="Months you've already paid are skipped.">
              <Select id="zelle-start" name="start" value={start} onChange={(e) => setStart(e.target.value)}>
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <CoveragePreview state={options} start={startPeriod} paidKeys={taken} currency={currency} />

          <ol className="space-y-4 border-t border-stone-100 pt-5 text-sm">
            <li className="flex gap-3">
              <Step n={1} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900">Open Zelle in your bank&apos;s app and send {amount} to:</p>
                <div className="mt-2 flex items-center gap-3 rounded-lg bg-stone-100 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {recipientName && <p className="font-semibold text-stone-900">{recipientName}</p>}
                    <p className="select-all break-all font-mono text-base text-stone-900">{contact}</p>
                  </div>
                  <CopyButton text={contact} />
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900">In the memo, write:</p>
                <div className="mt-2 flex items-center gap-3 rounded-lg bg-stone-100 px-4 py-3">
                  <p className="min-w-0 flex-1 select-all font-mono text-stone-900">{memo}</p>
                  <CopyButton text={memo} />
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <p className="font-medium text-stone-900">Tap the button below so we know to look for it.</p>
            </li>
          </ol>

          <Field label="Note (optional)" htmlFor="zelle-notes">
            <Input id="zelle-notes" name="notes" placeholder="e.g. sent from my wife's account" maxLength={300} />
          </Field>
          <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Sending…" disabled={!options.valid}>
            <Send className="h-5 w-5" aria-hidden />
            I&apos;ve sent my {options.valid ? formatMoney(options.amountCents, currency) : ""} Zelle payment
          </SubmitButton>
          <p className="text-xs text-stone-500">You&apos;ll show as PENDING until an administrator confirms the money arrived.</p>
        </form>
      </CardBody>
    </Card>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{n}</span>
  );
}
