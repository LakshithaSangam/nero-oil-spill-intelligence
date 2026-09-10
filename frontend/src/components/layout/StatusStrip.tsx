"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { cleanupPriority, ecologicalSensitivity } from "@/lib/assess";
import { cn } from "@/lib/utils";
import { formatLatLon, niceScale } from "@/lib/geo/format";
import { useDetectionStore } from "@/store/detection";
import { useEnvironmentalStore } from "@/store/environmental";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";
import type { ProviderRegistrySnapshot } from "@/types/api";

const PRIO_DOT = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" } as const;

export function StatusStrip() {
  const cursor = useMapStore((s) => s.cursor);
  const view = useMapStore((s) => s.view);
  const ready = useMapStore((s) => s.ready);
  const active = useScenarioStore((s) => s.active());
  const activeId = useScenarioStore((s) => s.activeId);
  const impact = useEnvironmentalStore((s) => {
    const det = activeId ? useDetectionStore.getState().byScenario[activeId] : undefined;
    return det ? s.byDetection[det.id] : undefined;
  });
  const prio = impact
    ? cleanupPriority(impact.priority_score, {
        areaKm2: impact.affected_area_km2_estimate,
        sensitivity: ecologicalSensitivity(impact).label,
        receptorCount: impact.receptors.filter((r) => r.likelihood > 0.15).length,
      })
    : null;
  const [snap, setSnap] = useState<ProviderRegistrySnapshot | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api<ProviderRegistrySnapshot>("/providers");
        setSnap(s);
        setOnline(true);
      } catch {
        setOnline(false);
      }
    })();
  }, []);

  const scale = niceScale(view.center[1], view.zoom);
  const activeProviders = snap ? Object.values(snap.selection) : [];

  return (
    <div className="panel flex h-8 items-center gap-4 px-3 text-[11px] text-text-muted">
      <span className="tnum inline-flex min-w-[15rem] items-center gap-1.5">
        <span className="text-text-subtle">POS</span>
        {cursor ? formatLatLon(cursor.lng, cursor.lat) : ready ? "n/a" : "initialising"}
      </span>

      <Divider />
      <span className="tnum inline-flex items-center gap-1.5">
        <span className="text-text-subtle">Z</span>
        {view.zoom.toFixed(1)}
      </span>

      <Divider />
      <span className="inline-flex items-center gap-2" title="map scale">
        <span
          className="h-[3px] rounded-full bg-text-muted"
          style={{ width: `${Math.round(scale.px)}px` }}
        />
        <span className="tnum">{scale.label}</span>
      </span>

      <div className="ml-auto flex items-center gap-4">
        {prio && (
          <>
            <span className="inline-flex items-center gap-1.5" title={prio.why}>
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIO_DOT[prio.tone])} />
              <span className="text-text-subtle">PRIORITY</span>
              <span className="font-medium text-text">{prio.label}</span>
            </span>
            <Divider />
          </>
        )}
        {active && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-text-subtle">SCENARIO</span>
              <span className="text-text">{active.name}</span>
            </span>
            <Divider />
          </>
        )}
        <span className="inline-flex items-center gap-1.5" title="active data providers">
          <span className="text-text-subtle">PROVIDERS</span>
          {activeProviders.length
            ? activeProviders.join(" · ")
            : "n/a"}
        </span>
        <Divider />
        <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.12em]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              online == null
                ? "bg-warning animate-pulse-soft"
                : online
                  ? "bg-accent"
                  : "bg-danger"
            }`}
          />
          {online == null ? "Linking…" : online ? "Satellite Feed Live" : "Feed Down"}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="h-3 w-px bg-border" />;
}
