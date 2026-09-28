import type { NotificationProvider } from "../types";

/** Always-on provider: writes notifications to the server log. Useful in development. */
export const logProvider: NotificationProvider = {
  channel: "log",
  isEnabled: () => true,
  async send(recipient, message) {
    console.info(`[notification] to=${recipient.email ?? recipient.phone ?? recipient.memberId} subject="${message.subject}"`);
  },
};
