"use client";

import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useMapStore } from "@/store/map";

export function MapControls() {
  const map = useMapStore((s) => s.map);

  return (
    <div className="relative z-20 flex shrink-0 flex-col gap-1.5">
      <div className="panel flex flex-col overflow-hidden p-0">
        <IconButton
          className="rounded-none border-0 border-b border-border bg-transparent"
          aria-label="Zoom in"
          onClick={() => map?.zoomIn({ duration: 300 })}
        >
          <Plus size={15} />
        </IconButton>
        <IconButton
          className="rounded-none border-0 bg-transparent"
          aria-label="Zoom out"
          onClick={() => map?.zoomOut({ duration: 300 })}
        >
          <Minus size={15} />
        </IconButton>
      </div>
    </div>
  );
}
