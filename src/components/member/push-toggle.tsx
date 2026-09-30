"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/reminders";
import { buttonClass } from "@/components/ui/button";

type State = "loading" | "unsupported" | "install" | "blocked" | "off" | "on" | "working";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Member: turn app notifications (payment reminders) on or off for this device.
 * Works once the app is installed on the home screen and notifications are allowed.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone only offers notifications to apps added to the home screen.
        setState(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone() ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const result = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!result.ok) throw new Error(result.error);
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn on notifications.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {state === "on" ? (
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-stone-400" aria-hidden />
        )}
        <div className="text-sm">
          <p className="font-semibold text-stone-900">App notifications {state === "on" ? "are on" : "are off"}</p>
          <p className="text-stone-500">
            {state === "install"
              ? "To get payment reminders as notifications, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there."
              : state === "blocked"
                ? "Notifications are blocked for this app. Allow them in your phone or browser settings to get payment reminders."
                : "Get payment reminders on this device."}
          </p>
          {error && <p className="mt-1 text-red-600">{error}</p>}
        </div>
      </div>
      {(state === "off" || state === "working") && (
        <button type="button" onClick={turnOn} disabled={state === "working"} className={buttonClass("primary", "sm", "shrink-0")}>
          {state === "working" ? "Please wait…" : "Turn on"}
        </button>
      )}
      {state === "on" && (
        <button type="button" onClick={turnOff} className={buttonClass("secondary", "sm", "shrink-0")}>
          Turn off
        </button>
      )}
    </div>
  );
}
