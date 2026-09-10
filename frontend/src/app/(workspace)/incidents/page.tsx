"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Spinner } from "@/components/ui/Spinner";
import { MissionLogEntry } from "@/components/incidents/MissionLogEntry";
import { IncidentDetail } from "@/components/incidents/IncidentDetail";
import { useMapStore } from "@/store/map";
import type { Incident } from "@/types/api";

const SEVERITIES = ["all", "minor", "moderate", "major"] as const;
type Filter = (typeof SEVERITIES)[number];

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const flyTo = useMapStore((s) => s.flyTo);

  useEffect(() => {
    api<Incident[]>("/incidents")
      .then(setIncidents)
      .catch(() => setError(true));
  }, []);

  const shown = useMemo(
    () =>
      (incidents ?? [])
        .filter((i) => filter === "all" || i.severity === filter)
        .sort((a, b) => b.reported_at.localeCompare(a.reported_at)),
    [incidents, filter],
  );

  const selected = incidents?.find((i) => i.id === selectedId) ?? null;

  if (selected) {
    return (
      <div>
        <PanelHeader eyebrow="Incident catalog" title="Incident details" />
        <IncidentDetail incident={selected} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        eyebrow="Reference data"
        title="Incident catalog"
        subtitle="Real oil spills reported to NOAA, plus our own replay set. The AI's detections get checked against these to see how close it actually gets."
      />

      <div className="flex gap-4 px-4 pt-3.5">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "pb-1 text-[0.7rem] capitalize tracking-wide transition-colors",
              filter === s
                ? "border-b border-accent text-text"
                : "border-b border-transparent text-text-subtle hover:text-text-muted",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="pb-4 pt-1">
        {error ? (
          <p className="px-4 py-4 text-[0.78rem] text-text-muted">
            Backend offline. Start it to load the records.
          </p>
        ) : !incidents ? (
          <p className="flex items-center gap-2 px-4 py-4 text-[0.78rem] text-text-subtle">
            <Spinner /> loading…
          </p>
        ) : (
          <div className="mt-1 divide-y divide-border/55 border-y border-border/55">
            {shown.map((i) => (
              <MissionLogEntry
                key={i.id}
                incident={i}
                onSelect={(inc) => {
                  setSelectedId(inc.id);
                  flyTo({ center: [inc.location.lon, inc.location.lat], zoom: 8 });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
