"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { wipePaymentHistory } from "@/app/actions/payments";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

/** "Wipe History": permanently deletes every payment (members are kept), after a confirmation dialog. */
export function WipeHistoryButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(wipePaymentHistory, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="space-y-3">
      {state.ok && <FormMessage state={state} />}
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("danger")}>
        <Trash2 className="h-4 w-4" aria-hidden /> Wipe History
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wipe-title"
            aria-describedby="wipe-desc"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wipe-title" className="text-lg font-bold text-stone-900">
              Wipe payment history?
            </h2>
            <p id="wipe-desc" className="mt-2 text-sm text-stone-700">
              Are you sure you want to permanently wipe all payment history? This action cannot be undone.
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Members are kept. All payments, months covered, totals, revenue and balances reset to zero.
            </p>
            {!state.ok && <div className="mt-3"><FormMessage state={state} /></div>}
            <form action={action} className="mt-6 flex justify-end gap-2">
              <input type="hidden" name="confirm" value="WIPE" />
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")} autoFocus>
                Cancel
              </button>
              <SubmitButton variant="danger" pendingText="Wiping…">
                Wipe History
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
