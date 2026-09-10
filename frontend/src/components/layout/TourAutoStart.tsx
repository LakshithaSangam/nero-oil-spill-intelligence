"use client";

import { useEffect } from "react";
import { useUiStore } from "@/store/ui";

/** First arrival on the site → open the guided tour once (after the boot sequence). */
export function TourAutoStart() {
  const setOpen = useUiStore((s) => s.setHowItWorks);

  useEffect(() => {
    let seen = false;
    let booted = false;
    try {
      seen = !!sessionStorage.getItem("neuro:tour-seen");
      booted = !!sessionStorage.getItem("neuro:booted");
    } catch {
      /* storage blocked — treat as first visit */
    }
    if (seen) return;

    const delay = booted ? 500 : 3400; // let the boot sequence finish first
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem("neuro:tour-seen", "1");
      } catch {
        /* ignore */
      }
      setOpen(true);
    }, delay);
    return () => clearTimeout(t);
  }, [setOpen]);

  return null;
}
