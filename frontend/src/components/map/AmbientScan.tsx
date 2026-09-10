"use client";

import { useEffect, useRef, useState } from "react";
import { useDetectionStore } from "@/store/detection";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useOceanStore } from "@/store/ocean";
import { useScenarioStore } from "@/store/scenario";

/**
 * Ambient depth cues over the map. Purely decorative, pointer-events-none,
 * reads existing stores only — no map layers, no interaction:
 *   - a slow radar sweep across the console every ~18 s
 *   - a faint sonar pulse radiating from the reconstructed spill origin
 * Both respect prefers-reduced-motion (handled by the global CSS reset).
 */
export function AmbientScan() {
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const originOn = useLayersStore((s) => s.layers.find((l) => l.id === "origin")?.visible ?? false);
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const origin = useOceanStore((s) =>
    detection ? s.byDetection[detection.id]?.hindcast?.origin : undefined,
  );

  const [pulsePos, setPulsePos] = useState<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !ready || !originOn || !origin) {
      setPulsePos(null);
      return;
    }
    const update = () => {
      raf.current = null;
      const p = map.project([origin.point.lon, origin.point.lat]);
      setPulsePos({ x: p.x, y: p.y });
    };
    const schedule = () => {
      if (raf.current == null) raf.current = requestAnimationFrame(update);
    };
    update();
    for (const ev of ["move", "zoom", "rotate", "pitch", "resize"] as const) map.on(ev, schedule);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      for (const ev of ["move", "zoom", "rotate", "pitch", "resize"] as const) map.off(ev, schedule);
    };
  }, [map, ready, originOn, origin]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      {/* radar sweep — one rotation every ~18 s, invisible the rest of the time */}
      <div className="ambient-radar" />

      {/* sonar pulse from the detected spill origin */}
      {pulsePos && (
        <div
          className="absolute"
          style={{ left: pulsePos.x, top: pulsePos.y, transform: "translate(-50%, -50%)" }}
        >
          <span className="ambient-sonar" />
          <span className="ambient-sonar ambient-sonar-2" />
        </div>
      )}
    </div>
  );
}
