"use client";

import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

export function HowItWorksTrigger({
  className,
  children = "How it works",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const setOpen = useUiStore((s) => s.setHowItWorks);
  return (
    <button type="button" onClick={() => setOpen(true)} className={cn(className)}>
      {children}
    </button>
  );
}
