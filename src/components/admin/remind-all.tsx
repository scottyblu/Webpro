"use client";

import { useActionState } from "react";
import { BellRing } from "lucide-react";
import { remindAllUnpaid } from "@/app/actions/reminders";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

/** One tap: remind every member who hasn't paid this month (after a confirmation). */
export function RemindAllButton({ count, monthLabel }: { count: number; monthLabel: string }) {
  const [state, action] = useActionState(remindAllUnpaid, {});
  return (
    <form action={action} className="space-y-2">
      <SubmitButton
        variant="secondary"
        pendingText="Sending reminders…"
        disabled={count === 0}
        confirmMessage={`Send a payment reminder to the ${count} member${count === 1 ? "" : "s"} who haven't paid for ${monthLabel}? Each gets it by their chosen method (text, email or app).`}
      >
        <BellRing className="h-4 w-4" aria-hidden />
        {count === 0 ? "Everyone has paid" : `Remind ${count} who haven't paid`}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
