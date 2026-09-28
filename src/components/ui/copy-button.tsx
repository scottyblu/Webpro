"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "./cn";

/** Copy text to the clipboard, falling back to the older method some phone browsers still need. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback below
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** One-tap "Copy" button that briefly confirms with "Copied!". */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        setStatus((await copyText(text)) ? "copied" : "failed");
        setTimeout(() => setStatus("idle"), 2000);
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        status === "copied"
          ? "bg-emerald-600 text-white"
          : status === "failed"
            ? "bg-red-100 text-red-700"
            : "bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50",
        className,
      )}
      aria-live="polite"
    >
      {status === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {status === "copied" ? "Copied!" : status === "failed" ? "Press & hold to copy" : label}
    </button>
  );
}
