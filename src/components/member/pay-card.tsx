"use client";

import { useActionState, useMemo, useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { reportMemberPayment } from "@/app/actions/payments";
import {
  CoveragePreview,
  PaymentOptionFields,
  coveredPeriods,
  describePeriods,
  usePaymentOptions,
} from "@/components/payments/payment-options";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import { parsePeriodKey } from "@/lib/periods";
import { venmoPayLink, venmoProfileLink } from "@/lib/venmo";

type Method = "zelle" | "venmo";

/**
 * "Pay your dues" with Zelle and/or Venmo: choose one month, several months, a full
 * year or a custom amount (minimum $20), send it, then tap "I've sent my payment".
 * Venmo gets a button that opens the Venmo app with the amount and note filled in.
 */
export function PayCard({
  duesCents,
  currency,
  zelle,
  venmoUsername,
  memberName,
  periods,
  defaultPeriod,
  takenKeys,
}: {
  duesCents: number;
  currency: string;
  zelle: { recipientName: string | null; contact: string } | null;
  venmoUsername: string | null;
  memberName: string;
  /** Months a payment can start from (not already paid or waiting for confirmation). */
  periods: { key: string; label: string }[];
  defaultPeriod: string;
  /** Months already paid or reported (skipped when covering several months). */
  takenKeys: string[];
}) {
  const [state, action] = useActionState(reportMemberPayment, {});
  const methods: Method[] = [...(zelle ? (["zelle"] as const) : []), ...(venmoUsername ? (["venmo"] as const) : [])];
  const [method, setMethod] = useState<Method>(methods[0] ?? "zelle");
  const options = usePaymentOptions(duesCents);
  const [start, setStart] = useState(defaultPeriod);
  const taken = useMemo(() => new Set(takenKeys), [takenKeys]);
  const startPeriod = parsePeriodKey(start) ?? parsePeriodKey(defaultPeriod)!;
  const amount = options.valid ? formatMoney(options.amountCents, currency) : "your payment";
  const covered = options.valid ? coveredPeriods(startPeriod, options.coverMonths, taken) : [];
  const memo = `Breakfast Club – ${covered.length ? describePeriods(covered) : "dues"} – ${memberName}`;
  const label = method === "venmo" ? "Venmo" : "Zelle";
  const title = methods.length > 1 ? "Pay with Zelle or Venmo" : `Pay with ${label}`;

  if (state.ok) {
    return (
      <Card>
        <div id="pay" className="scroll-mt-20" />
        <CardHeader title={title} />
        <CardBody>
          <FormMessage state={state} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <div id="pay" className="scroll-mt-20" />
      <div id="zelle" className="scroll-mt-20" />
      <CardHeader title={title} description="Choose how much to pay, send it, then let us know below." />
      <CardBody>
        <form action={action} className="space-y-5">
          <FormMessage state={state} />
          <input type="hidden" name="method" value={method} />

          {methods.length > 1 && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pay with">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-center font-semibold ring-1 ring-inset transition-colors",
                    method === m ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-stone-300 hover:bg-stone-50",
                  )}
                >
                  {m === "venmo" ? "Venmo" : "Zelle"}
                </button>
              ))}
            </div>
          )}

          <PaymentOptionFields state={options} currency={currency} allowDonation={false} />

          {options.coverMonths > 0 && (
            <Field label="Starting with" htmlFor="pay-start" hint="Months you've already paid are skipped.">
              <Select id="pay-start" name="start" value={start} onChange={(e) => setStart(e.target.value)}>
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
            {method === "venmo" && venmoUsername ? (
              <li className="flex gap-3">
                <Step n={1} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium text-stone-900">Tap to open Venmo with {amount} and the note filled in:</p>
                  {options.valid ? (
                    <a
                      href={venmoPayLink(venmoUsername, options.amountCents, memo)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass("primary", "lg", "w-full bg-[#008CFF] hover:bg-[#0074d4] sm:w-auto")}
                    >
                      <ExternalLink className="h-5 w-5" aria-hidden /> Pay {amount} on Venmo
                    </a>
                  ) : (
                    <p className="text-stone-500">Choose an amount above first.</p>
                  )}
                  <div className="flex items-center gap-3 rounded-lg bg-stone-100 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-stone-500">
                        Or send it yourself to{" "}
                        <a href={venmoProfileLink(venmoUsername)} target="_blank" rel="noopener noreferrer" className="underline">
                          this profile
                        </a>
                        , with the note below:
                      </p>
                      <p className="select-all break-all font-mono text-base text-stone-900">@{venmoUsername}</p>
                    </div>
                    <CopyButton text={venmoUsername} />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-stone-100 px-4 py-3">
                    <p className="min-w-0 flex-1 select-all font-mono text-stone-900">{memo}</p>
                    <CopyButton text={memo} />
                  </div>
                </div>
              </li>
            ) : zelle ? (
              <>
                <li className="flex gap-3">
                  <Step n={1} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-900">Open Zelle in your bank&apos;s app and send {amount} to:</p>
                    <div className="mt-2 flex items-center gap-3 rounded-lg bg-stone-100 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        {zelle.recipientName && <p className="font-semibold text-stone-900">{zelle.recipientName}</p>}
                        <p className="select-all break-all font-mono text-base text-stone-900">{zelle.contact}</p>
                      </div>
                      <CopyButton text={zelle.contact} />
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
              </>
            ) : null}
            <li className="flex gap-3">
              <Step n={method === "venmo" ? 2 : 3} />
              <p className="font-medium text-stone-900">Come back and tap the button below so we know to look for it.</p>
            </li>
          </ol>

          <Field label="Note (optional)" htmlFor="pay-notes">
            <Input id="pay-notes" name="notes" placeholder="e.g. sent from my wife's account" maxLength={300} />
          </Field>
          <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Sending…" disabled={!options.valid}>
            <Send className="h-5 w-5" aria-hidden />
            I&apos;ve sent my {options.valid ? formatMoney(options.amountCents, currency) : ""} {label} payment
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
