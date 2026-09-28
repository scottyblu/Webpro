"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { reportZellePayment } from "@/app/actions/payments";
import { FormMessage } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

/** "Pay with Zelle": who to send to, what to write in the memo, and an "I've sent it" button. */
export function ZelleCard({
  fee,
  recipientName,
  contact,
  memberName,
  periods,
  defaultPeriod,
}: {
  fee: string;
  recipientName: string | null;
  contact: string;
  memberName: string;
  periods: { key: string; label: string }[];
  defaultPeriod: string;
}) {
  const [state, action] = useActionState(reportZellePayment, {});
  const [period, setPeriod] = useState(defaultPeriod);
  const periodName = periods.find((p) => p.key === period)?.label ?? "";
  const memo = `Breakfast Club – ${periodName} – ${memberName}`;

  return (
    <Card>
      <div id="zelle" className="scroll-mt-20" />
      <CardHeader title="Pay with Zelle" description="Send from your bank's app, then let us know below." />
      <CardBody className="space-y-5">
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <Step n={1} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900">Open Zelle in your bank&apos;s app and send {fee} to:</p>
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

        {state.ok ? (
          <FormMessage state={state} />
        ) : (
          <form action={action} className="space-y-4 border-t border-stone-100 pt-5">
            <FormMessage state={state} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment is for" htmlFor="zelle-period">
                <Select id="zelle-period" name="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note (optional)" htmlFor="zelle-notes">
                <Input id="zelle-notes" name="notes" placeholder="e.g. sent from my wife's account" maxLength={300} />
              </Field>
            </div>
            <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Sending…">
              <Send className="h-5 w-5" aria-hidden />
              I&apos;ve sent my Zelle payment
            </SubmitButton>
            <p className="text-xs text-stone-500">You&apos;ll show as PENDING until an administrator confirms the money arrived.</p>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{n}</span>
  );
}
