"use client";

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { api } from "@/lib/api/client";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import type { TempFieldResponse } from "@/types/api";

const clampLon = (v: number) => Math.max(-179, Math.min(179, v));
const clampLat = (v: number) => Math.max(-85, Math.min(85, v));

const SRC_ID = "oe-temp";
const LAYER_ID = "oe-temp-heat";
// the heat-map slots in just under the detection / drift / vessel layers, so oil
// spills and tracks always draw on top of it
const BELOW_CANDIDATES = ["oe-spill-feather", "oe-spill-fill", "oe-hindcast-line", "oe-forecast-line"];

const CW = 340;
const CH = 210;

// meteorological blue-to-red ramp (deg C) — a standard weather-map palette
const RAMP: [number, [number, number, number]][] = [
  [-35, [124, 58, 237]],
  [-20, [59, 130, 246]],
  [-8, [34, 211, 238]],
  [3, [94, 234, 212]],
  [12, [74, 222, 128]],
  [19, [253, 224, 71]],
  [26, [251, 146, 60]],
  [33, [239, 68, 68]],
  [42, [136, 19, 19]],
];

function tempColor(c: number): [number, number, number] {
  if (c <= RAMP[0]![0]) return RAMP[0]![1];
  if (c >= RAMP[RAMP.length - 1]![0]) return RAMP[RAMP.length - 1]![1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [t0, a] = RAMP[i]!;
    const [t1, b] = RAMP[i + 1]!;
    if (c >= t0 && c <= t1) {
      const f = (c - t0) / (t1 - t0 || 1);
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    }
  }
  return RAMP[RAMP.length - 1]![1];
}

/**
 * Optional temperature heat-map (styled after a weather map / zoom.earth): a
 * smooth blue-to-red wash of real 2 m air temperature.
 *
 * It is rendered as a genuine MapLibre `canvas` raster **source inserted beneath
 * the detection / drift / vessel layers**, so it warps with the map like a real
 * weather layer and never hides the oil spills drawn on top of it.
 */
export function TempField() {
  const on = useLayersStore((s) => s.layers.find((l) => l.id === "temperature")?.visible ?? false);
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const fieldRef = useRef<TempFieldResponse | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastView = useRef<{ cx: number; cy: number; z: number } | null>(null);
  const renderRef = useRef<() => void>(() => {});

  // ---- fetch the lattice when the view moves somewhere new --------------
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
      const prev = lastView.current;
      if (!force && prev) {
        const moved = Math.hypot((c.lng - prev.cx) / spanX, (c.lat - prev.cy) / spanY);
        if (moved < 0.25 && Math.abs(z - prev.z) < 0.4) return;
      }
      lastView.current = { cx: c.lng, cy: c.lat, z };
      const padX = spanX * 0.35;
      const padY = spanY * 0.35;
      abort?.abort();
      abort = new AbortController();
      api<TempFieldResponse>("/environment/tempfield", {
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
          renderRef.current();
        })
        .catch(() => {
          /* aborted or transient — keep the previous field */
        });
    };

    const debounced = () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(() => load(), 400);
    };

    load(true);
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
  }, [on, map, ready]);

  // ---- add / remove the MapLibre canvas layer + keep it in sync --------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!on || !map || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    // paint the canvas for a flat lon/lat rectangle covering the padded view
    const paint = (): [number, number, number, number] | null => {
      const b = map.getBounds();
      const W = b.getWest();
      const S = b.getSouth();
      const E = b.getEast();
      const N = b.getNorth();
      if (!(E > W && N > S)) return null;
      const spanX = E - W;
      const spanY = N - S;
      const pW = W - spanX * 0.15;
      const pE = E + spanX * 0.15;
      const pN = N + spanY * 0.15;
      const pS = S - spanY * 0.15;

      const field = fieldRef.current;
      if (!field || field.points.length === 0) {
        ctx.clearRect(0, 0, CW, CH);
        return [clampLon(pW), clampLat(pS), clampLon(pE), clampLat(pN)];
      }
      const { cols, rows, bbox } = field;
      const cellLon = (bbox.east - bbox.west) / cols;
      const cellLat = (bbox.north - bbox.south) / rows;
      const at = (xi: number, yi: number) => {
        const cx = Math.min(Math.max(xi, 0), cols - 1);
        const cy = Math.min(Math.max(yi, 0), rows - 1);
        return field.points[cy * cols + cx]!.temp_c;
      };
      const img = ctx.createImageData(CW, CH);
      const d = img.data;
      for (let py = 0; py < CH; py++) {
        const lat = pN - ((py + 0.5) / CH) * (pN - pS);
        const fy = (lat - bbox.south) / cellLat - 0.5;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        for (let px = 0; px < CW; px++) {
          const lon = pW + ((px + 0.5) / CW) * (pE - pW);
          const fx = (lon - bbox.west) / cellLon - 0.5;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const t =
            at(x0, y0) * (1 - tx) * (1 - ty) +
            at(x0 + 1, y0) * tx * (1 - ty) +
            at(x0, y0 + 1) * (1 - tx) * ty +
            at(x0 + 1, y0 + 1) * tx * ty;
          const [rr, gg, bb] = tempColor(t);
          const i = (py * CW + px) * 4;
          d[i] = rr;
          d[i + 1] = gg;
          d[i + 2] = bb;
          d[i + 3] = 190;
        }
      }
      ctx.putImageData(img, 0, 0);
      return [clampLon(pW), clampLat(pS), clampLon(pE), clampLat(pN)];
    };

    const sync = () => {
      const box = paint();
      const src = map.getSource(SRC_ID) as maplibregl.CanvasSource | undefined;
      if (src && box) {
        const [w, s, e, n] = box;
        src.setCoordinates([
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ]);
      }
    };
    renderRef.current = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    const install = () => {
      if (map.getLayer(LAYER_ID)) return;
      const box = paint();
      if (!box) return;
      const [w, s, e, n] = box;
      if (!map.getSource(SRC_ID)) {
        map.addSource(SRC_ID, {
          type: "canvas",
          canvas,
          animate: true,
          coordinates: [
            [w, n],
            [e, n],
            [e, s],
            [w, s],
          ],
        });
      }
      const beforeId = BELOW_CANDIDATES.find((id) => map.getLayer(id));
      map.addLayer(
        {
          id: LAYER_ID,
          type: "raster",
          source: SRC_ID,
          paint: {
            "raster-opacity": 0.55,
            "raster-resampling": "linear",
            "raster-fade-duration": 0,
          },
        },
        beforeId,
      );
    };

    // keep trying until the style is loaded and the viewport has a real size —
    // during workspace init the map can sit un-styled / zero-sized for a while
    let installTimer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const tryInstall = () => {
      installTimer = null;
      if (map.getLayer(LAYER_ID)) return;
      if (map.isStyleLoaded()) {
        try {
          install();
        } catch {
          /* transient — retry below */
        }
      }
      if (!map.getLayer(LAYER_ID) && tries++ < 40) {
        installTimer = setTimeout(tryInstall, 300);
      }
    };
    tryInstall();

    map.on("move", renderRef.current);
    map.on("zoom", renderRef.current);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (installTimer) clearTimeout(installTimer);
      map.off("move", renderRef.current);
      map.off("zoom", renderRef.current);
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
      } catch {
        /* style torn down */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, on]);

  if (!on) return null;
  return (
    <>
      {/* source canvas for the MapLibre raster layer — parked off-screen */}
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        aria-hidden
        className="pointer-events-none absolute left-[-99999px] top-0 opacity-0"
      />
      <Legend />
    </>
  );
}

function Legend() {
  const stops = [-20, -8, 3, 12, 19, 26, 33];
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-[9] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-[rgb(var(--navy-950)/0.78)] px-3 py-1.5 backdrop-blur-[4px]">
        <span className="text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Temp °C
        </span>
        <span
          className="h-2 w-40 rounded-full"
          style={{
            background:
              "linear-gradient(90deg," +
              RAMP.map(
                ([, [r, g, b]], i) => `rgb(${r} ${g} ${b}) ${(i / (RAMP.length - 1)) * 100}%`,
              ).join(",") +
              ")",
          }}
        />
        <span className="flex w-40 justify-between text-[0.5rem] tabular-nums text-text-subtle">
          {stops.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      </div>
    </div>
  );
}
