"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "tbc-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * "Install the app" card. Android/Chrome: one-tap install button.
 * iPhone/iPad (Safari): shows the Share → Add to Home Screen steps.
 * Hidden once installed or dismissed.
 */
export function InstallPrompt({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (dismissed || isStandalone()) return;

    if (isIos()) {
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setMode("hidden");
  };

  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-xl p-4 pr-10",
        dark ? "border border-stone-700 bg-stone-800 text-white" : "border border-brand-200 bg-brand-50 text-stone-900",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Get the Breakfast Club app</p>
        {mode === "android" ? (
          <>
            <p className={cn("mt-0.5 text-sm", dark ? "text-stone-300" : "text-stone-600")}>Add it to your home screen for one-tap access.</p>
            <button
              className={buttonClass("primary", "sm", "mt-3")}
              onClick={async () => {
                if (!deferred) return;
                await deferred.prompt();
                const { outcome } = await deferred.userChoice;
                if (outcome === "accepted") setMode("hidden");
                setDeferred(null);
              }}
            >
              <Download className="h-4 w-4" aria-hidden /> Install app
            </button>
          </>
        ) : (
          <p className={cn("mt-0.5 text-sm leading-relaxed", dark ? "text-stone-300" : "text-stone-600")}>
            Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong> in Safari, then{" "}
            <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden /> <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      <button onClick={dismiss} className="absolute right-2 top-2 rounded-md p-1.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
