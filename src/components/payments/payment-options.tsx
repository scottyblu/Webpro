"use client";

import { useMemo, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select } from "@/components/ui/form";
import { planPayment } from "@/lib/billing";
import { EXTRA_CATEGORY_LABELS, MIN_PAYMENT_CENTS, MIN_PAYMENT_MESSAGE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { addMonths, periodKey, periodLabel, periodShortLabel, type Period } from "@/lib/periods";
import type { ExtraCategory } from "@/lib/types";

export type PayOption = "one" | "multi" | "year" | "custom";
type Purpose = "dues" | "donation" | "other";

/** State for choosing a payment: one month, several months, a year, or a custom amount. */
export function usePaymentOptions(duesCents: number) {
  const [option, setOption] = useState<PayOption>("one");
  const [months, setMonths] = useState(3);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("dues");
  const [customMonths, setCustomMonths] = useState<number | null>(null); // null = as many as the amount covers
  const [extraCategory, setExtraCategory] = useState<ExtraCategory>("donation");

  const computed = useMemo(() => {
    const parsed = Number.parseFloat(amount);
    const customCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
    const amountCents =
      option === "one" ? duesCents : option === "multi" ? duesCents * months : option === "year" ? duesCents * 12 : customCents;
    let coverMonths = option === "one" ? 1 : option === "multi" ? months : option === "year" ? 12 : 0;
    let maxMonths = coverMonths;
    if (option === "custom" && purpose === "dues") {
      const plan = planPayment(customCents, duesCents, customMonths ?? undefined);
      coverMonths = plan.months;
      maxMonths = plan.maxMonths;
    }
    const extraCents = Math.max(0, amountCents - coverMonths * duesCents);
    const valid = amountCents >= MIN_PAYMENT_CENTS;
    return {
      amountCents,
      coverMonths,
      maxMonths,
      extraCents,
      valid,
      error: option === "custom" && amount !== "" && !valid ? MIN_PAYMENT_MESSAGE : null,
    };
  }, [option, months, amount, purpose, customMonths, duesCents]);

  return {
    option,
    setOption,
    months,
    setMonths,
    amount,
    setAmount,
    purpose,
    setPurpose,
    customMonths,
    setCustomMonths,
    extraCategory,
    setExtraCategory,
    duesCents,
    ...computed,
  };
}

export type PaymentOptionsState = ReturnType<typeof usePaymentOptions>;

/** The four payment choices plus their extra fields. Submits as hidden form fields. */
export function PaymentOptionFields({
  state,
  currency,
  allowDonation = true,
}: {
  state: PaymentOptionsState;
  currency: string;
  /** Show "Donation / Other" purposes for custom amounts (admin). */
  allowDonation?: boolean;
}) {
  const money = (c: number) => formatMoney(c, currency);
  const d = state.duesCents;
  const choices: { value: PayOption; title: string; detail: string }[] = [
    { value: "one", title: "One month", detail: money(d) },
    { value: "multi", title: "Multiple months", detail: `${money(d)} × months` },
    { value: "year", title: "Full year", detail: `${money(d * 12)} · 12 months` },
    { value: "custom", title: "Custom amount", detail: `${money(MIN_PAYMENT_CENTS)} or more` },
  ];

  return (
    <div className="space-y-4">
      <input type="hidden" name="option" value={state.option} />
      <input type="hidden" name="months" value={state.months} />
      <input type="hidden" name="purpose" value={state.purpose} />
      <input type="hidden" name="custom_months" value={state.coverMonths} />
      <input type="hidden" name="extra_category" value={state.extraCategory} />

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment option">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={state.option === c.value}
            onClick={() => state.setOption(c.value)}
            className={cn(
              "rounded-xl px-3 py-3 text-left ring-1 ring-inset transition-colors",
              state.option === c.value ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-stone-300 hover:bg-stone-50",
            )}
          >
            <span className="block font-semibold text-stone-900">{c.title}</span>
            <span className="block text-xs text-stone-500">{c.detail}</span>
          </button>
        ))}
      </div>

      {state.option === "multi" && (
        <Field label="How many months?" htmlFor="pay-months">
          <Select id="pay-months" value={state.months} onChange={(e) => state.setMonths(Number(e.target.value))}>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} months — {money(d * n)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {state.option === "custom" && (
        <div className="space-y-4 rounded-xl bg-stone-50 p-4">
          <Field label="Amount ($)" htmlFor="pay-amount">
            <Input
              id="pay-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min={MIN_PAYMENT_CENTS / 100}
              step="0.01"
              placeholder={(MIN_PAYMENT_CENTS / 100).toFixed(2)}
              value={state.amount}
              onChange={(e) => {
                state.setAmount(e.target.value);
                state.setCustomMonths(null);
              }}
              aria-invalid={!!state.error}
              required
            />
          </Field>
          {state.error && (
            <p className="-mt-2 text-sm font-semibold text-red-600" role="alert">
              {state.error}
            </p>
          )}

          {allowDonation && (
            <Field label="What is it for?" htmlFor="pay-purpose">
              <Select id="pay-purpose" value={state.purpose} onChange={(e) => state.setPurpose(e.target.value as Purpose)}>
                <option value="dues">Membership months</option>
                <option value="donation">Donation / extra contribution</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          )}

          {state.purpose === "dues" && state.valid && (
            <Field
              label="Months to cover"
              htmlFor="pay-custom-months"
              hint={`Each month needs a full ${money(d)}. There are no partial months.`}
            >
              <Select
                id="pay-custom-months"
                value={state.coverMonths}
                onChange={(e) => state.setCustomMonths(Number(e.target.value))}
              >
                {Array.from({ length: state.maxMonths + 1 }, (_, i) => state.maxMonths - i).map((n) => (
                  <option key={n} value={n}>
                    {n} month{n === 1 ? "" : "s"} ({money(n * d)})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {state.valid && state.extraCents > 0 && (
            <Field label={`The extra ${money(state.extraCents)} is`} htmlFor="pay-extra">
              <Select
                id="pay-extra"
                value={state.extraCategory}
                onChange={(e) => state.setExtraCategory(e.target.value as ExtraCategory)}
                disabled={!allowDonation}
              >
                {(Object.keys(EXTRA_CATEGORY_LABELS) as ExtraCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {EXTRA_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

/** Months covered starting at `start`, skipping months already paid. */
export function coveredPeriods(start: Period, months: number, paidKeys: Set<string>): Period[] {
  const out: Period[] = [];
  for (let p = start, guard = 0; out.length < months && guard < 600; p = addMonths(p, 1), guard++) {
    if (!paidKeys.has(periodKey(p))) out.push(p);
  }
  return out;
}

export function describePeriods(periods: Period[]): string {
  if (periods.length === 0) return "";
  if (periods.length === 1) return periodLabel(periods[0]!);
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const consecutive = periods.every((p, i) => i === 0 || periodKey(p) === periodKey(addMonths(periods[i - 1]!, 1)));
  return consecutive
    ? `${periodLabel(first)} – ${periodLabel(last)}`
    : periods.map((p) => periodShortLabel(p)).join(", ");
}

/** "Covers Oct 2026 – Dec 2026 (3 months) · $10 extra: Donation" */
export function CoveragePreview({
  state,
  start,
  paidKeys,
  currency,
}: {
  state: PaymentOptionsState;
  start: Period;
  paidKeys: Set<string>;
  currency: string;
}) {
  if (!state.valid) return null;
  const periods = coveredPeriods(start, state.coverMonths, paidKeys);
  return (
    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
      <p className="font-semibold">Payment: {formatMoney(state.amountCents, currency)}</p>
      {periods.length > 0 ? (
        <p>
          Covers {describePeriods(periods)} ({periods.length} month{periods.length === 1 ? "" : "s"})
        </p>
      ) : (
        <p>Doesn&apos;t cover any membership months.</p>
      )}
      {state.extraCents > 0 && (
        <p>
          {formatMoney(state.extraCents, currency)}{" "}
          {state.option === "custom" && state.purpose !== "dues"
            ? `recorded as ${state.purpose === "donation" ? "a donation / extra contribution" : "other"}`
            : `extra: ${EXTRA_CATEGORY_LABELS[state.extraCategory]}`}
        </p>
      )}
    </div>
  );
}
