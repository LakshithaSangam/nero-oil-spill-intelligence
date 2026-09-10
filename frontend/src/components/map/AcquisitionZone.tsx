"use client";

import { useEffect, useRef, useState } from "react";
import { useDetectionStore } from "@/store/detection";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";

type Pt = { x: number; y: number };

const R = 6371; // km
function spanKm(a: number, b: number, lat: number, axis: "lon" | "lat") {
  const d = Math.abs(a - b) * (Math.PI / 180);
  return axis === "lat" ? d * R : d * R * Math.cos((lat * Math.PI) / 180);
}

/**
 * Frames the active AOI as a satellite acquisition zone: animated corner
 * brackets that track the map, a slow scan sweep, and a metadata caption
 * (sensor, footprint span, last acquisition). Pure overlay — no map layers.
 */
export function AcquisitionZone() {
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const scenario = useScenarioStore((s) => s.active());
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const aoiOn = useLayersStore((s) => s.layers.find((l) => l.id === "aoi")?.visible ?? false);

  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !ready || !scenario || !aoiOn) {
      setBox(null);
      return;
    }
    const b = scenario.aoi;
    const update = () => {
      raf.current = null;
      const nw = map.project([b.west, b.north]) as unknown as Pt;
      const se = map.project([b.east, b.south]) as unknown as Pt;
      const x = Math.min(nw.x, se.x);
      const y = Math.min(nw.y, se.y);
      const w = Math.abs(se.x - nw.x);
      const h = Math.abs(se.y - nw.y);
      setBox(w < 8 || h < 8 ? null : { x, y, w, h });
    };
    const schedule = () => {
      if (raf.current == null) raf.current = requestAnimationFrame(update);
    };
    update();
    map.on("move", schedule);
    map.on("zoom", schedule);
    map.on("rotate", schedule);
    map.on("pitch", schedule);
    map.on("resize", schedule);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      map.off("move", schedule);
      map.off("zoom", schedule);
      map.off("rotate", schedule);
      map.off("pitch", schedule);
      map.off("resize", schedule);
    };
  }, [map, ready, scenario, aoiOn]);

  if (!box || !scenario) return null;

  const b = scenario.aoi;
  const midLat = (b.north + b.south) / 2;
  const ew = spanKm(b.east, b.west, midLat, "lon");
  const ns = spanKm(b.north, b.south, midLat, "lat");
  const arm = Math.max(10, Math.min(22, box.w * 0.08));
  const { x, y, w, h } = box;

  const bracket = (cx: number, cy: number, sx: number, sy: number) => (
    <path
      d={`M ${cx + sx * arm} ${cy} L ${cx} ${cy} L ${cx} ${cy + sy * arm}`}
      fill="none"
      stroke="rgb(var(--accent))"
      strokeWidth="1.5"
      strokeLinecap="square"
      opacity="0.85"
    />
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <clipPath id="aoi-clip">
            <rect x={x} y={y} width={w} height={h} />
          </clipPath>
          <linearGradient id="aoi-sweep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(var(--accent))" stopOpacity="0.16" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* hairline frame */}
        <rect
          x={x} y={y} width={w} height={h}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeOpacity="0.28"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* scan sweep, clipped to the zone */}
        <g clipPath="url(#aoi-clip)">
          <rect
            className="aoi-sweep"
            x={x} width={w} height={Math.max(40, h * 0.28)}
            fill="url(#aoi-sweep)"
            style={{ ["--aoi-y0" as string]: `${y}px`, ["--aoi-y1" as string]: `${y + h}px` }}
          />
        </g>

        {/* corner brackets */}
        {bracket(x, y, 1, 1)}
        {bracket(x + w, y, -1, 1)}
        {bracket(x, y + h, 1, -1)}
        {bracket(x + w, y + h, -1, -1)}
      </svg>

      {/* metadata caption */}
      <div
        className="absolute"
        style={{ left: x, top: Math.max(4, y - 30) }}
      >
        <div className="flex items-center gap-2 whitespace-nowrap bg-[rgb(var(--navy-950)/0.7)] px-2 py-1 text-[0.6rem] uppercase tracking-[0.13em] text-text-muted backdrop-blur-[3px]">
          <span className="text-accent">◈ AOI</span>
          <span className="tnum">{Math.round(ew)}×{Math.round(ns)} km</span>
          <span className="text-text-subtle">Sentinel-1 C-SAR</span>
          {detection && (
            <span className="tnum text-text-subtle">
              {new Date(detection.detected_at).toISOString().slice(0, 16).replace("T", " ")}Z
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
