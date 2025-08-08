"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    const isDev = process.env.NODE_ENV === "development";
    const enableDev =
      process.env.NEXT_PUBLIC_PWA_ENABLE === "1" ||
      process.env.NEXT_PUBLIC_PWA_ENABLE === "true";

    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production, or in dev if explicitly enabled
    if (!enableDev && isDev) return;

    const wb = (window as any).workbox;
    if (wb && typeof wb.register === "function") {
      wb.register();
      return;
    }

    const swUrl = "/sw.js";
    navigator.serviceWorker.register(swUrl).catch((err) => {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.error("SW registration failed (dev)", err);
      }
    });
  }, []);
  return null;
}
