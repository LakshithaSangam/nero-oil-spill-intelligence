"use client";

import { useEffect } from "react";
import { useUiStore } from "@/store/ui";

/**
 * Keeps <html data-theme> in step with the ui store on every route (the store is
 * seeded from localStorage). A tiny inline script in <body> sets the attribute
 * before first paint; this handles later changes from the Settings panel.
 */
export function ThemeManager() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}
