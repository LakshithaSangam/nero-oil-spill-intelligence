"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import { useUiStore } from "@/store/ui";

/** The floating content column on the left. Holds the active route; the map shows through. */
export function WorkspacePanel({ children }: { children: React.ReactNode }) {
  const collapsed = useUiStore((s) => s.panelCollapsed);
  const togglePanel = useUiStore((s) => s.togglePanel);

  if (collapsed) {
    return (
      <div className="pointer-events-auto">
        <IconButton className="panel" aria-label="Show panel" onClick={togglePanel}>
          <PanelLeftOpen size={16} />
        </IconButton>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto panel flex w-[24rem] max-w-[calc(100vw-8rem)] flex-col overflow-hidden",
        "h-full",
      )}
    >
      <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
        <IconButton
          size="sm"
          className="border-transparent bg-transparent"
          aria-label="Hide panel"
          onClick={togglePanel}
        >
          <PanelLeftClose size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
