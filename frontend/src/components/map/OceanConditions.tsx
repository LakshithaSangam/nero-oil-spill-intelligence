"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation2, Waves, Wind } from "lucide-react";
import { api } from "@/lib/api/client";
import { useMapStore } from "@/store/map";
import type { CurrentFieldResponse, WindFieldResponse } from "@/types/api";

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Ambient ocean-condition tiles + the map legend along the base of the console.
 * Wind / current values are the mean of the real lattice the map already
 * fetches for the current view. Read-only, refreshes lazily on map settle.
 */
export function OceanConditions() {
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);

  const [wind, setWind] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map || !ready) return;
    const load = () => {
      const b = map.getBounds();
      const p = {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
        cols: 5,
        rows: 4,
      };
      api<WindFieldResponse>("/environment/windfield", { params: p })
        .then((f) => setWind(mean(f.points.map((x) => x.speed_ms))))
        .catch(() => {});
      api<CurrentFieldResponse>("/environment/currentfield", { params: p })
        .then((f) => setCurrent(mean(f.points.map((x) => x.speed_ms))))
        .catch(() => {});
    };
    const debounced = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 700);
    };
    load();
    map.on("moveend", debounced);
    return () => {
      map.off("moveend", debounced);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [map, ready]);

  return (
    <div className="panel flex items-center gap-3 px-3 py-2 text-[11px] text-text-muted">
      <Tile
        icon={<Wind size={12} />}
        label="Wind"
        value={wind != null ? `${wind.toFixed(0)} m/s` : "—"}
      />
      <Divider />
      <Tile
        icon={<Navigation2 size={12} />}
        label="Currents"
        value={current != null ? `${current.toFixed(1)} m/s` : "—"}
      />
      <Divider />
      <Tile icon={<Waves size={12} />} label="Waves" value="1.5 m" />

      <div className="ml-auto flex items-center gap-3.5 text-[0.6rem]">
        <Legend swatch="bg-danger" label="Oil Spill" />
        <Legend swatch="border border-dashed border-accent" label="Spill Prediction" hollow />
        <Legend swatch="border border-dashed border-text-muted" label="Vessel Track" hollow />
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="text-accent/75">{icon}</span>
      <span className="leading-tight">
        <span className="block text-[0.52rem] uppercase tracking-[0.14em] text-text-subtle">
          {label}
        </span>
        <span className="tnum block text-[0.72rem] text-text">{value}</span>
      </span>
    </span>
  );
}

function Legend({ swatch, label, hollow }: { swatch: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-text-subtle">
      <span className={`inline-block h-2 w-3 rounded-[2px] ${hollow ? "" : swatch} ${hollow ? swatch : ""}`} />
      {label}
    </span>
  );
}

function Divider() {
  return <span className="h-3 w-px bg-border" />;
}
