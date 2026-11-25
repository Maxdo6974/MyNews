"use client";

import { useEffect } from "react";

/** Enregistre le service worker (appli installable, page hors ligne). */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
