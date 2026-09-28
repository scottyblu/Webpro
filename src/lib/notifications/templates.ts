import type { NotificationContext, NotificationType, RenderedMessage } from "./types";

/** Message copy for every notification type. Edit wording here. */
export function renderNotification(
  type: NotificationType,
  name: string,
  ctx: NotificationContext,
): RenderedMessage {
  const first = name.split(" ")[0] || name;
  switch (type) {
    case "payment_confirmation":
      return {
        subject: `${ctx.clubName}: payment received — thank you!`,
        text: `Hi ${first},\n\nWe received your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}${ctx.paymentMethod ? ` (${ctx.paymentMethod})` : ""}. Thank you!\n\nView your membership: ${ctx.dashboardUrl}\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Thanks ${first}! We received your ${ctx.amount} payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}.`,
      };
    case "upcoming_payment_reminder":
      return {
        subject: `${ctx.clubName}: membership payment due ${ctx.dueDate ?? "soon"}`,
        text: `Hi ${first},\n\nFriendly reminder: your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""} is due ${ctx.dueDate ?? "soon"}.\n\nPay online: ${ctx.dashboardUrl}\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Reminder — your ${ctx.amount} dues are due ${ctx.dueDate ?? "soon"}. Pay: ${ctx.dashboardUrl}`,
      };
    case "failed_payment_notice":
      return {
        subject: `${ctx.clubName}: your membership payment failed`,
        text: `Hi ${first},\n\nWe couldn't process your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""}. Please update your payment method so your membership stays current.\n\nUpdate payment method: ${ctx.dashboardUrl}\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Your ${ctx.amount} payment failed. Please update your card: ${ctx.dashboardUrl}`,
      };
    case "past_due_reminder":
      return {
        subject: `${ctx.clubName}: membership payment past due`,
        text: `Hi ${first},\n\nOur records show your ${ctx.amount} membership payment${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""} (due ${ctx.dueDate ?? "earlier this month"}) hasn't been received yet.\n\nPay online: ${ctx.dashboardUrl}\n\nIf you've already paid another way, please let an administrator know.\n\n— ${ctx.clubName}`,
        sms: `${ctx.clubName}: Your ${ctx.amount} dues${ctx.periodLabel ? ` for ${ctx.periodLabel}` : ""} are past due. Pay: ${ctx.dashboardUrl}`,
      };
  }
}
