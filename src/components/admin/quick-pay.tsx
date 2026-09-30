"use client";

import { useActionState, useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { quickMarkPaid, voidPayment } from "@/app/actions/payments";
import { cn } from "@/components/ui/cn";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/lib/types";

const QUICK_METHODS: PaymentMethod[] = ["zelle", "cash", "venmo", "cash_app", "check", "other"];

/**
 * "Paid" button for one member and month. Tap it, pick how they paid, done:
 * records the monthly fee with today's date.
 */
export function QuickPay({ memberId, memberName, period, fee }: { memberId: string; memberName: string; period: string; fee: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(quickMarkPaid, {});

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <Check className="h-4 w-4" aria-hidden /> Paid
        </button>
        {state.error && <p className="max-w-48 text-right text-xs text-red-600">{state.error}</p>}
      </div>
    );
  }

  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col items-end gap-2"
      aria-label={`How did ${memberName} pay ${fee}?`}
    >
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="period" value={period} />
      <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
        {pending ? "Saving…" : `${fee} paid by:`}
        <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-stone-400 hover:text-stone-700" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex max-w-72 flex-wrap justify-end gap-1.5">
        {QUICK_METHODS.map((m) => (
          <button
            key={m}
            type="submit"
            name="method"
            value={m}
            disabled={pending}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors disabled:opacity-50",
              m === "zelle"
                ? "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700"
                : "bg-white text-stone-800 ring-stone-300 hover:bg-emerald-50 hover:ring-emerald-400",
            )}
          >
            {PAYMENT_METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      {state.error && <p className="max-w-72 text-right text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

/** Small "Undo" for a manual payment (voids it; it stays in the history). */
export function UndoPayment({ paymentId, memberName }: { paymentId: string; memberName: string }) {
  return (
    <form action={voidPayment.bind(null, paymentId)} onClick={(e) => e.stopPropagation()}>
      <SubmitButton
        variant="ghost"
        size="sm"
        className="gap-1 px-2 py-1 text-xs text-stone-500"
        pendingText="…"
        confirmMessage={`Undo ${memberName}'s payment for this month? It stays in the history marked as voided and no longer counts in the totals.`}
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
      </SubmitButton>
    </form>
  );
}
