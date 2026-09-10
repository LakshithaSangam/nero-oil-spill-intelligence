"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api/client";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import type { CurrentFieldResponse } from "@/types/api";

const LIGHT_BASEMAPS = new Set(["natural", "atlas", "light"]);

const clampLon = (v: number) => Math.max(-179, Math.min(179, v));
const clampLat = (v: number) => Math.max(-85, Math.min(85, v));

/**
 * Real surface-current overlay: a drifting particle flow whose direction and
 * speed at every point come from a coarse lattice of real Open-Meteo Marine
 * current vectors for the current map bounds, not a decorative sine-wave.
 * Particles are unprojected to lon/lat each frame and steered by bilinearly
 * interpolating the u/v components of the four surrounding lattice cells
 * (interpolating the angle directly wraps badly near 0/360, u/v does not).
 *
 * The fetched field lives in a ref so a refetch (on any real pan/zoom) swaps
 * the flow in place without tearing down and restarting the animation.
 */
export function CurrentField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentsOn = useLayersStore((s) => s.layers.find((l) => l.id === "currents")?.visible ?? false);
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const basemap = useMapStore((s) => s.basemap);
  const light = LIGHT_BASEMAPS.has(basemap);

  const fieldRef = useRef<CurrentFieldResponse | null>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastView = useRef<{ cx: number; cy: number; z: number } | null>(null);

  // blend the flow into the water rather than sitting it on top as a decal.
  // Set on the element (not via a render-time style prop) so it never differs
  // between the server and client render.
  useEffect(() => {
    const c = canvasRef.current;
    // on the dark chart the streaks read best at full strength; on a light
    // basemap multiply keeps them from glaring
    if (c) c.style.mixBlendMode = light ? "multiply" : "normal";
  }, [light]);

  // ---- fetch the lattice when the map moves somewhere new ----------------
  useEffect(() => {
    if (!currentsOn || !map) return;
    let abort: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const load = (force = false) => {
      const b = map.getBounds();
      const w = b.getWest();
      const s = b.getSouth();
      const e = b.getEast();
      const n = b.getNorth();
      if (!(e > w && n > s)) {
        // the map viewport is not sized yet — try again shortly
        if (retry) clearTimeout(retry);
        retry = setTimeout(() => load(true), 400);
        return;
      }
      const c = map.getCenter();
      const z = map.getZoom();
      const spanX = Math.max(e - w, 1e-4);
      const spanY = Math.max(n - s, 1e-4);
      const prev = lastView.current;
      if (!force && prev) {
        const moved = Math.hypot((c.lng - prev.cx) / spanX, (c.lat - prev.cy) / spanY);
        if (moved < 0.25 && Math.abs(z - prev.z) < 0.4) return;
      }
      lastView.current = { cx: c.lng, cy: c.lat, z };
      const padX = spanX * 0.25;
      const padY = spanY * 0.25;
      abort?.abort();
      abort = new AbortController();
      api<CurrentFieldResponse>("/environment/currentfield", {
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
        .then((f) => {
          fieldRef.current = f;
        })
        .catch(() => {
          /* aborted or a transient failure — keep the previous field */
        });
    };

    const debounced = () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(() => load(), 450);
    };

    load(true);
    // belt-and-braces: if nothing has loaded a second after mount (degenerate
    // bounds during init), force another attempt
    const kick = setTimeout(() => {
      if (!fieldRef.current) load(true);
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
  }, [currentsOn, map, ready]);

  // ---- draw: particle flow steered by the real lattice -------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !currentsOn) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;

    type P = { x: number; y: number; px: number; py: number; life: number; age: number };
    const spawn = (): P => {
      const x = Math.random() * w;
      const y = Math.random() * h;
      return { x, y, px: x, py: y, life: 60 + Math.random() * 120, age: Math.random() * 180 };
    };
    let parts: P[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // (re)seed the particle field for the real size — the canvas can be 0×0
      // during workspace init, when a fixed count would leave it empty forever
      const target = reduce ? 90 : Math.round(Math.min(560, (w * h) / 2400));
      if (w > 0 && h > 0 && Math.abs(parts.length - target) > target * 0.3) {
        parts = Array.from({ length: target }, spawn);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // --- sampler, rebuilt whenever the fetched field changes identity -----
    let builtFrom: CurrentFieldResponse | null = null;
    let sampleUV = (_lon: number, _lat: number): { u: number; v: number } => ({ u: 0, v: 0 });
    let meanSpeed = 0.2;

    const rebuildSampler = (field: CurrentFieldResponse) => {
      builtFrom = field;
      const { cols, rows, bbox } = field;
      const cellLon = (bbox.east - bbox.west) / cols;
      const cellLat = (bbox.north - bbox.south) / rows;
      const uv = field.points.map((p) => {
        const rad = (p.direction_deg * Math.PI) / 180;
        return { u: p.speed_ms * Math.sin(rad), v: p.speed_ms * Math.cos(rad) };
      });
      meanSpeed =
        uv.reduce((sum, p) => sum + Math.hypot(p.u, p.v), 0) / Math.max(1, uv.length) || 0.2;
      sampleUV = (lon: number, lat: number) => {
        const fx = (lon - bbox.west) / cellLon - 0.5;
        const fy = (lat - bbox.south) / cellLat - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const at = (xi: number, yi: number) => {
          const cx = Math.min(Math.max(xi, 0), cols - 1);
          const cy = Math.min(Math.max(yi, 0), rows - 1);
          return uv[cy * cols + cx]!;
        };
        const a = at(x0, y0);
        const b = at(x0 + 1, y0);
        const c = at(x0, y0 + 1);
        const d = at(x0 + 1, y0 + 1);
        return {
          u: a.u * (1 - tx) * (1 - ty) + b.u * tx * (1 - ty) + c.u * (1 - tx) * ty + d.u * tx * ty,
          v: a.v * (1 - tx) * (1 - ty) + b.v * tx * (1 - ty) + c.v * (1 - tx) * ty + d.v * tx * ty,
        };
      };
    };


    // Real surface currents run a few tenths of a m/s, i.e. a fraction of a
    // screen pixel per frame at true scale. Direction comes straight from the
    // field (that has to be correct); pace is a *relative* pace normalised to
    // the field's own mean so a faster patch still visibly outruns a slower one.
    const BASE_PX = 1.75;

    let raf = 0;
    let last = 0;
    const FRAME = 1000 / 30;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME) return;
      last = now;

      const field = fieldRef.current;
      if (!field || field.points.length === 0) return;
      if (field !== builtFrom) rebuildSampler(field);

      // fade the previous frame rather than clearing → motion trails
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${reduce ? 1 : 0.12})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      ctx.lineWidth = light ? 1.3 : 1.5;
      ctx.strokeStyle = light ? "rgba(16,52,72,0.9)" : "rgba(122,236,226,0.95)";
      for (const p of parts) {
        const ll = map.unproject([p.x, p.y]);
        const { u, v } = sampleUV(ll.lng, ll.lat);
        const mag = Math.hypot(u, v);
        const pace = BASE_PX * Math.min(1.9, Math.max(0.45, mag / meanSpeed));
        const ux = mag > 1e-6 ? u / mag : 0;
        const uy = mag > 1e-6 ? v / mag : 0;
        p.px = p.x;
        p.py = p.y;
        p.x += ux * pace;
        p.y -= uy * pace; // screen y is down; north (+v) moves up
        p.age += 1;
        const fade = Math.min(1, p.age / 20) * Math.max(0, 1 - p.age / p.life);
        ctx.globalAlpha = 0.9 * fade;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (p.age > p.life || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          Object.assign(p, spawn(), { age: 0 });
        }
      }
      ctx.globalAlpha = 1;

      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      ctx.clearRect(0, 0, w, h);
    };
  }, [map, currentsOn, light]);

  if (!currentsOn) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
    />
  );
}
