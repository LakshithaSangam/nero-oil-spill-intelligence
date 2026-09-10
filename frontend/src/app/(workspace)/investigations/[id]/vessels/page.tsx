"use client";

import Link from "next/link";
import { Check, Loader2, RefreshCw, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvidenceCard } from "@/components/panels/EvidenceCard";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useMapStore } from "@/store/map";
import { useOceanStore } from "@/store/ocean";
import {
  INVESTIGATION_PHASES,
  useInvestigationStore,
} from "@/store/investigation";
import { classifyOperator } from "@/lib/assess";
import type { EvidenceCard as EvidenceCardT } from "@/types/api";

export default function VesselsTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const hindcast = useOceanStore((s) =>
    detection ? s.byDetection[detection.id]?.hindcast : undefined,
  );
  const { byDetection, running, phase, error, run, focusMmsi, setFocus } =
    useInvestigationStore();
  const ranking = detection ? byDetection[detection.id] : undefined;
  const flyTo = useMapStore((s) => s.flyTo);

  if (!scenarioId || !detection || !hindcast) {
    return (
      <div className="p-4">
        <EmptyState
          title={detection ? "Hindcast required" : "Detection required"}
          milestone="M4"
          description="The investigation engine reconstructs AIS around the hindcast origin. Run detection, then the hindcast, first."
        >
          {scenarioId && (
            <Link
              href={`/investigations/${params.id}/${detection ? "ocean" : "detection"}`}
              className="text-xs text-accent hover:underline"
            >
              {detection ? "Go to ocean intelligence →" : "Go to detection →"}
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  const isRunning = running === detection.id;

  const focus = (mmsi: string) => {
    setFocus(mmsi);
    const card = ranking?.cards.find((c) => c.vessel.mmsi === mmsi);
    const pt = card?.track.features.find(
      (f) => (f.properties as { role?: string }).role === "closest",
    );
    const coords = pt?.geometry.coordinates as number[] | undefined;
    if (coords) flyTo({ center: [coords[0]!, coords[1]!], zoom: 10.5 });
  };

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Historical AIS around the estimated origin, scored on proximity, AIS gaps,
        speed &amp; course anomalies, cargo, prior history and time correlation.
      </p>

      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {isRunning ? (
        <ol className="space-y-1.5">
          {INVESTIGATION_PHASES.map((p, i) => {
            const idx = phase ? INVESTIGATION_PHASES.indexOf(phase as (typeof INVESTIGATION_PHASES)[number]) : -1;
            const done = idx > i;
            const active = idx === i;
            return (
              <li
                key={p}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs",
                  active ? "border-accent/45 bg-accent/10 text-text" : "border-border text-text-subtle",
                )}
              >
                <span className="grid h-4 w-4 place-items-center">
                  {done ? (
                    <Check size={13} className="text-success" />
                  ) : active ? (
                    <Loader2 size={13} className="animate-spin text-accent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
                  )}
                </span>
                {p}
              </li>
            );
          })}
        </ol>
      ) : ranking ? (
        <>
          {ranking.cards[0] && (
            <AttributionBanner top={ranking.cards[0]} />
          )}
          <div className="tnum flex items-center justify-between text-[11px] text-text-subtle">
            <span>{ranking.candidates_considered} vessels considered</span>
            <button
              onClick={() => run(detection.id)}
              className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-text-muted hover:border-accent/60 hover:text-accent"
            >
              <RefreshCw size={11} /> Re-run
            </button>
          </div>
          <div className="space-y-2">
            {ranking.cards.map((c) => (
              <EvidenceCard
                key={c.vessel.mmsi}
                card={c}
                focused={focusMmsi === c.vessel.mmsi}
                onFocus={() => focus(c.vessel.mmsi)}
              />
            ))}
          </div>
        </>
      ) : (
        <button
          onClick={() => run(detection.id)}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          <Ship size={14} /> Run investigation
        </button>
      )}
    </div>
  );
}

function AttributionBanner({ top }: { top: EvidenceCardT }) {
  const suspicion = Math.round(top.suspicion_score * 100);
  const conf = Math.round(top.confidence.score * 100);
  const lead = top.factors.find((f) => f.polarity === "incriminating");
  const owner = classifyOperator(top.vessel);
  const tone =
    top.suspicion_score >= 0.75
      ? "text-danger"
      : top.suspicion_score >= 0.45
        ? "text-warning"
        : "text-text";

  return (
    <div className="rounded-sm border border-border bg-surface-2/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
        Most likely source
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-text">
          {top.vessel.name ?? `MMSI ${top.vessel.mmsi}`}
        </span>
        <span className={cn("tnum text-2xl font-bold leading-none", tone)}>{suspicion}%</span>
      </div>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-text-subtle">
        likelihood this vessel is the source
      </p>

      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-border/60 pt-2 text-[11px]">
        <span className="text-text-subtle">Operator</span>
        <span className="text-right text-text">
          {top.vessel.operator_company ?? top.vessel.owner ?? "not on record"}
          <span className="ml-1.5 rounded-[3px] border border-border px-1 py-px text-[9px] uppercase tracking-wide text-text-muted">
            {owner.label}
          </span>
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-text-subtle">
          <span>Confidence in this attribution</span>
          <span className="tnum text-text">{conf}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent" style={{ width: `${conf}%` }} />
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-text-muted">
        {top.confidence.rationale}
      </p>
      {lead && (
        <p className="mt-1.5 text-[10px] leading-snug text-text-subtle">
          Strongest link: <span className="text-text-muted">{lead.summary}</span>
        </p>
      )}
    </div>
  );
}
