import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationProvider } from "../types";

/**
 * App (push) notifications using the standard Web Push protocol (VAPID + aes128gcm),
 * implemented with Node's crypto so no extra service or package is needed.
 *
 * Enabled when VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set (Admin → Settings →
 * Payment reminders can generate a pair). A member only receives push notifications
 * after installing the app and tapping "Turn on notifications".
 */

const b64url = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64url = (s: string) => Buffer.from(s.trim(), "base64url");

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return !!vapidPublicKey() && !!process.env.VAPID_PRIVATE_KEY?.trim();
}

/** A new VAPID key pair (base64url), for the admin to paste into Vercel. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

function vapidSubject(): string {
  const configured = process.env.VAPID_SUBJECT?.trim();
  if (configured) return configured.startsWith("mailto:") || configured.startsWith("https:") ? configured : `mailto:${configured}`;
  const email = process.env.GMAIL_ADDRESS?.trim();
  return email ? `mailto:${email}` : "mailto:admin@example.com";
}

/** Signed VAPID JWT for a push service origin. */
function vapidAuthorization(endpoint: string): string {
  const publicKey = fromB64url(vapidPublicKey()!);
  const privateKey = fromB64url(process.env.VAPID_PRIVATE_KEY!);
  if (publicKey.length !== 65 || privateKey.length !== 32) throw new Error("VAPID keys are not valid P-256 keys");
  const key = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64url(privateKey),
      x: b64url(publicKey.subarray(1, 33)),
      y: b64url(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapidSubject() }),
    ),
  );
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${b64url(publicKey)}`;
}

/** Encrypt a payload for one subscription (RFC 8291, aes128gcm). */
function encryptPayload(payload: string, p256dh: string, authSecret: string): Buffer {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, body]);
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Send one push message. Returns "gone" when the browser unsubscribed (the row should be deleted). */
export async function sendPush(sub: PushSubscriptionRow, payload: object): Promise<"sent" | "gone"> {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 3600),
      Urgency: "normal",
    },
    body: new Uint8Array(encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth)),
  });
  if (res.status === 404 || res.status === 410) return "gone";
  if (!res.ok) throw new Error(`Push service error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return "sent";
}

export async function memberPushSubscriptions(memberId: string): Promise<PushSubscriptionRow[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", memberId);
  if (error) return [];
  return (data ?? []) as PushSubscriptionRow[];
}

export const pushProvider: NotificationProvider = {
  channel: "push",
  isEnabled: pushConfigured,
  async send(recipient, message) {
    const subs = await memberPushSubscriptions(recipient.memberId);
    if (subs.length === 0) throw new Error("The app isn't installed with notifications turned on");
    const db = createAdminClient();
    let delivered = 0;
    let lastError: unknown = null;
    for (const sub of subs) {
      try {
        if ((await sendPush(sub, message.push)) === "gone") await db.from("push_subscriptions").delete().eq("id", sub.id);
        else delivered++;
      } catch (err) {
        lastError = err;
      }
    }
    if (delivered === 0) throw lastError ?? new Error("Notifications were turned off on every device");
    return `${delivered} device${delivered === 1 ? "" : "s"}`;
  },
};
