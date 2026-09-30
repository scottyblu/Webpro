import type { NotificationContext, NotificationType, RenderedMessage } from "./types";

/**
 * Fill in a custom reminder message from Settings.
 * Placeholders: {first_name} {name} {amount} {club} {due_date} {month}
 */
export function fillTemplate(template: string, name: string, ctx: NotificationContext): string {
  const first = name.split(" ")[0] || name;
  const values: Record<string, string> = {
    first_name: first,
    name,
    amount: ctx.amount,
    club: ctx.clubName,
    due_date: ctx.dueDate ?? "",
    month: ctx.periodLabel ?? "",
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match).trim();
}

/** Message copy for every notification type. Edit wording here. */
export function renderNotification(type: NotificationType, name: string, ctx: NotificationContext): RenderedMessage {
  const first = name.split(" ")[0] || name;
  const url = ctx.dashboardUrl;
  const custom = ctx.customMessage ? fillTemplate(ctx.customMessage, name, ctx) : null;

  switch (type) {
    case "payment_confirmation":
      return {
        subject: `${ctx.clubName}: payment received — thank you!`,
        text: `Hi ${first},\n\nWe received your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}${ctx.paymentMethod ? ` (${ctx.paymentMethod})` : ""}. Thank you!\n\nView your membership: ${url}\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Thanks ${first}! We received your ${ctx.amount} payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}.`,
        push: {
          title: "Payment received",
          body: `Thanks ${first}! We received your ${ctx.amount} payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}.`,
          url,
        },
      };
    case "upcoming_payment_reminder":
    case "manual_reminder": {
      const line =
        custom ??
        `Hi ${first}, this is a reminder that your ${ctx.amount} ${ctx.clubName} payment is due on ${ctx.dueDate ?? "soon"}. Thank you!`;
      return {
        subject: `${ctx.clubName}: ${ctx.amount} payment due ${ctx.dueDate ?? "soon"}`,
        text: `${line}\n\n${ctx.payInstructions ? `${ctx.payInstructions}\n\n` : ""}Pay or view your membership: ${url}\n\n— ${ctx.clubName}`,
        sms: `${line} ${url}`,
        push: { title: `${ctx.clubName} payment reminder`, body: line, url },
      };
    }
    case "failed_payment_notice":
      return {
        subject: `${ctx.clubName}: your membership payment failed`,
        text: `Hi ${first},\n\nWe couldn't process your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}. Please update your payment method so your membership stays current.\n\nUpdate payment method: ${url}\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Your ${ctx.amount} payment failed. Please update your card: ${url}`,
        push: { title: "Payment failed", body: `Your ${ctx.amount} payment didn't go through. Tap to update it.`, url },
      };
    case "past_due_reminder": {
      const line =
        custom ??
        `Hi ${first}, your ${ctx.amount} ${ctx.clubName} payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""} was due on ${ctx.dueDate ?? "earlier this month"} and hasn't been received yet. Please pay when you can. Thank you!`;
      return {
        subject: `${ctx.clubName}: ${ctx.amount} payment overdue`,
        text: `${line}\n\n${ctx.payInstructions ? `${ctx.payInstructions}\n\n` : ""}Pay or view your membership: ${url}\n\nIf you've already paid another way, please let an administrator know.\n\n— ${ctx.clubName}`,
        sms: `${line} ${url}`,
        push: { title: `${ctx.clubName} payment overdue`, body: line, url },
      };
    }
  }
}
