"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import type { WindFieldResponse } from "@/types/api";

const LIGHT_BASEMAPS = new Set(["natural", "atlas", "light"]);

/** speed (m/s) → arrow colour; a simple Beaufort-ish ramp that reads on any basemap */
function speedColour(ms: number, light: boolean): string {
  if (ms >= 14) return light ? "rgba(178,40,30,0.92)" : "rgba(255,150,120,0.95)";
  if (ms >= 10) return light ? "rgba(190,90,40,0.9)" : "rgba(255,190,120,0.92)";
  if (ms >= 6) return light ? "rgba(30,90,110,0.9)" : "rgba(150,210,225,0.9)";
  return light ? "rgba(60,110,120,0.75)" : "rgba(170,200,205,0.8)";
}

const clampLon = (v: number) => Math.max(-179, Math.min(179, v));
const clampLat = (v: number) => Math.max(-85, Math.min(85, v));

/**
 * Real surface-wind overlay. Fetches a coarse lattice of 10 m wind vectors from
 * the backend for the current map bounds + time and draws one arrow per lattice
 * point, direction and length from the data, so each region shows its own wind
 * rather than one global direction. Refetches (debounced) whenever the view
 * centre or zoom moves enough that the visible wind would actually differ.
 */
export function WindField() {
  const on = useLayersStore((s) => s.layers.find((l) => l.id === "wind")?.visible ?? false);
  const map = useMapStore((s) => s.map);
  const basemap = useMapStore((s) => s.basemap);
  const light = LIGHT_BASEMAPS.has(basemap);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [field, setField] = useState<WindFieldResponse | null>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastView = useRef<{ cx: number; cy: number; z: number } | null>(null);

  // blend the arrows into the map instead of stacking them on top as a decal.
  // Set on the element in an effect so SSR and client markup stay identical.
  useEffect(() => {
    const c = canvasRef.current;
    if (c) c.style.mixBlendMode = light ? "multiply" : "screen";
  }, [light]);

  // ---- fetch the lattice when the map moves somewhere new ----------------
  useEffect(() => {
    if (!on || !map) return;
    let abort: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const load = (force = false) => {
      const b = map.getBounds();
      const w = b.getWest();
      const s = b.getSouth();
      const e = b.getEast();
      const n = b.getNorth();
      if (!(e > w && n > s)) {
        if (retry) clearTimeout(retry);
        retry = setTimeout(() => load(true), 400);
        return;
      }
      const c = map.getCenter();
      const z = map.getZoom();
      const spanX = Math.max(e - w, 1e-4);
      const spanY = Math.max(n - s, 1e-4);
      // Refetch once the centre has drifted > ~25% of the view span, or the
      // zoom changed by ~0.4+. Jittery inertial settling stays well under this,
      // so one real pan makes one request; the backend also caches 10 min.
      const prev = lastView.current;
      if (!force && prev) {
        const moved = Math.hypot((c.lng - prev.cx) / spanX, (c.lat - prev.cy) / spanY);
        if (moved < 0.25 && Math.abs(z - prev.z) < 0.4) return;
      }
      lastView.current = { cx: c.lng, cy: c.lat, z };
      // pad the request ~25% past the visible edge so a pan reveals real
      // neighbouring wind instead of a hard uniform edge
      const padX = spanX * 0.25;
      const padY = spanY * 0.25;
      abort?.abort();
      abort = new AbortController();
      api<WindFieldResponse>("/environment/windfield", {
        params: {
          west: clampLon(w - padX),
          south: clampLat(s - padY),
          east: clampLon(e + padX),
          north: clampLat(n + padY),
          cols: 12,
          rows: 9,
        },
        signal: abort.signal,
      })
        .then(setField)
        .catch(() => {
          /* aborted or a transient failure — keep the previous field on screen */
        });
    };

    const debounced = () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(() => load(), 450);
    };

    load(true);
    const kick = setTimeout(() => {
      if (!field) load(true);
    }, 1100);
    map.on("moveend", debounced);
    map.on("zoomend", debounced);
    return () => {
      clearTimeout(kick);
      if (retry) clearTimeout(retry);
      map.off("moveend", debounced);
      map.off("zoomend", debounced);
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      abort?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, map]);

  // ---- draw / redraw on field change or map move ------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !on || !field) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
      const r = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(r.width * dpr)) {
        canvas.width = Math.floor(r.width * dpr);
        canvas.height = Math.floor(r.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);

      const maxSpeed = Math.max(6, ...field.points.map((p) => p.speed_ms));
      for (const p of field.points) {
        const pt = map.project([p.lon, p.lat]);
        if (pt.x < -40 || pt.y < -40 || pt.x > r.width + 40 || pt.y > r.height + 40) continue;
        // going-to bearing, clockwise from north → screen vector
        const rad = (p.direction_deg * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);
        const len = 9 + 20 * Math.min(1, p.speed_ms / maxSpeed);
        const col = speedColour(p.speed_ms, light);
        const bx = pt.x - dx * len * 0.5;
        const by = pt.y - dy * len * 0.5;
        const ex = pt.x + dx * len * 0.5;
        const ey = pt.y + dy * len * 0.5;

        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // arrowhead at the "going-to" end
        const ah = 4.5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - dx * ah - dy * ah * 0.7, ey - dy * ah + dx * ah * 0.7);
        ctx.lineTo(ex - dx * ah + dy * ah * 0.7, ey - dy * ah - dx * ah * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    };

    draw();
    map.on("move", draw);
    map.on("zoom", draw);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      map.off("move", draw);
      map.off("zoom", draw);
      ro.disconnect();
    };
  }, [field, map, on, light]);

  if (!on) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[4] h-full w-full"
    />
  );
}
