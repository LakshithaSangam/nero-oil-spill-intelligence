"use client";

import { useEffect, useRef, useState } from "react";
import { useDetectionStore } from "@/store/detection";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useOceanStore } from "@/store/ocean";
import { useScenarioStore } from "@/store/scenario";

/**
 * A small caption pinned to the estimated-origin marker so the amber dot reads as
 * what it is — the reconstructed release point — without opening the legend.
 * Pure DOM overlay (mirrors AcquisitionZone); shown only while the `origin`
 * layer is on and a hindcast exists.
 */
export function OriginLabel() {
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const originOn = useLayersStore((s) => s.layers.find((l) => l.id === "origin")?.visible ?? false);
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const origin = useOceanStore((s) =>
    detection ? s.byDetection[detection.id]?.hindcast?.origin : undefined,
  );

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !ready || !originOn || !origin) {
      setPos(null);
      return;
    }
    const update = () => {
      raf.current = null;
      const p = map.project([origin.point.lon, origin.point.lat]);
      // keep the caption inside the map viewport so it never hides behind a
      // docked panel or slides off-screen when the origin sits near the edge
      const c = map.getContainer().getBoundingClientRect();
      const x = Math.max(14, Math.min(p.x, c.width - 190));
      const y = Math.max(52, Math.min(p.y, c.height - 16));
      setPos({ x, y });
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

  if (!pos || !origin) return null;

  const conf = Math.round((origin.confidence?.score ?? 0) * 100);
  const start = new Date(origin.release_window.start).toISOString().slice(5, 16).replace("T", " ");
  const end = new Date(origin.release_window.end).toISOString().slice(11, 16);

  return (
    <div
      className="pointer-events-none absolute z-[9] -translate-y-full"
      style={{ left: pos.x + 10, top: pos.y - 8 }}
    >
      {/* leader from the chip down toward the dot */}
      <span
        aria-hidden
        className="absolute left-0 top-full block h-2 w-px bg-[rgb(var(--warning))]/70"
      />
      <div className="whitespace-nowrap rounded-[6px] border border-[rgb(var(--warning)/0.4)] bg-[rgb(var(--navy-950)/0.85)] px-2 py-1 shadow-[0_2px_10px_rgb(0_0_0/0.4)] backdrop-blur-[3px]">
        <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--warning))]">
          <span className="inline-block h-2 w-2 rounded-full border border-[rgb(var(--warning))] bg-[rgb(var(--warning)/0.35)]" />
          Likely spill source
        </div>
        <div className="tnum mt-0.5 text-[0.58rem] text-text-subtle">
          traced back from the slick · released {start} to {end}Z · {conf}% confidence
        </div>
      </div>
    </div>
  );
}
