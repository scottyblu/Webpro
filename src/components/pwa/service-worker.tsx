"use client";

import { useEffect } from "react";

/** Registers the service worker (production only, so it never caches dev builds). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.error("Service worker registration failed", err));
  }, []);
  return null;
}
