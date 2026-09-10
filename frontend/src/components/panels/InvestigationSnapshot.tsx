"use client";

import Link from "next/link";
import { ArrowUpRight, Crosshair, Landmark, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classifyOperator,
  cleanupPriority,
  ecologicalSensitivity,
  vesselTimeline,
} from "@/lib/assess";
import { CleanupGauge, IntelBar } from "@/components/panels/intel";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useEnvironmentalStore } from "@/store/environmental";
import { useInvestigationStore } from "@/store/investigation";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";

const DOT = { muted: "bg-text-subtle", accent: "bg-accent", danger: "bg-danger" } as const;

function hhmm(iso: string | null): string {
  if (!iso) return "n/a";
  return `${new Date(iso).toISOString().slice(5, 16).replace("T", " ")}Z`;
}

/**
 * Dashboard add-on (does not replace anything): when an investigation has been
 * run for the active scenario, surface the suspected vessel, its owner, a
 * "highlight route on map" action, its movement timeline around the spill, and
 * the environmental / marine-life / cleanup-urgency indicators.
 */
export function InvestigationSnapshot() {
  const activeId = useScenarioStore((s) => s.activeId);
  const aoi = useScenarioStore((s) => s.active()?.aoi);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const ranking = useInvestigationStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const impact = useEnvironmentalStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const flyTo = useMapStore((s) => s.flyTo);

  if (!ranking && !impact) return null;

  const invId = SEED_INVESTIGATIONS.find((i) => i.scenarioId === activeId)?.id;
  const lead = ranking?.cards[0];

  const highlightRoute = () => {
    if (!lead) return;
    useInvestigationStore.getState().setFocus(lead.vessel.mmsi);
    useLayersStore.getState().setVisible("ais", true);
    useLayersStore.getState().setVisible("suspects", true);
    const track = lead.track.features.find((f) => f.geometry?.type === "LineString");
    const coords = (track?.geometry as { coordinates?: number[][] } | undefined)?.coordinates;
    const mid = coords?.[Math.floor(coords.length / 2)];
    if (mid) flyTo({ center: [mid[0]!, mid[1]!], zoom: 9 });
  };

  return (
    <section className="space-y-3">
      <h2 className="eyebrow text-[0.6rem]">Vessel investigation</h2>

      {lead && (
        <div className="rounded-sm border border-border bg-surface-2/50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Ship size={12} className="shrink-0 text-text-subtle" />
                <span className="truncate text-[0.82rem] font-semibold text-text">
                  {lead.vessel.name ?? `MMSI ${lead.vessel.mmsi}`}
                </span>
              </div>
              <div className="tnum mt-0.5 text-[0.68rem] text-text-muted">
                <span className="capitalize">{lead.vessel.vessel_type}</span> ·{" "}
                {lead.vessel.flag_state ?? "n/a"} · MMSI {lead.vessel.mmsi}
                {lead.vessel.imo ? ` · IMO ${lead.vessel.imo}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={cn(
                  "tnum text-lg font-bold leading-none",
                  lead.suspicion_score >= 0.75
                    ? "text-danger"
                    : lead.suspicion_score >= 0.45
                      ? "text-warning"
                      : "text-text",
                )}
              >
                {Math.round(lead.suspicion_score * 100)}%
              </div>
              <div className="eyebrow mt-0.5 text-[0.5rem]">suspicion</div>
            </div>
          </div>

          {/* ownership */}
          {(() => {
            const owner = classifyOperator(lead.vessel);
            return (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[0.68rem]">
                <span className="inline-flex items-center gap-1 rounded-[3px] border border-border px-1.5 py-0.5 font-medium uppercase tracking-wide text-text-muted">
                  <Landmark size={9} /> {owner.label}
                </span>
                <span className="truncate text-text-subtle">
                  {lead.vessel.operator_company ?? lead.vessel.owner ?? "operator not on record"}
                </span>
              </div>
            );
          })()}

          {/* confidence + why ranked */}
          <div className="mt-2 text-[0.68rem] leading-relaxed text-text-muted">
            <span className="font-medium text-text">
              Confidence {Math.round(lead.confidence.score * 100)}%.
            </span>{" "}
            {lead.confidence.rationale}. Ranked on{" "}
            {lead.factors
              .filter((f) => f.polarity === "incriminating")
              .slice(0, 3)
              .map((f) => f.summary.toLowerCase())
              .join("; ") || "proximity and time overlap"}
            .
          </div>

          <div className="mt-2.5 flex gap-2">
            <button
              onClick={highlightRoute}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-accent/45 bg-accent/10 py-1.5 text-[0.7rem] font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              <Crosshair size={11} /> Highlight route on map
            </button>
            {invId && (
              <Link
                href={`/investigations/${invId}/vessels`}
                className="flex items-center gap-1 rounded-sm border border-border px-2.5 py-1.5 text-[0.7rem] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
              >
                Investigate <ArrowUpRight size={11} />
              </Link>
            )}
          </div>

          {/* movement timeline */}
          {(() => {
            const evs = vesselTimeline(lead, aoi);
            if (!evs.length) return null;
            return (
              <ol className="mt-3 border-l border-border/70 pl-3">
                {evs.map((e) => (
                  <li key={e.key} className="relative pb-2 last:pb-0">
                    <span
                      className={cn(
                        "absolute -left-[1.03rem] top-1 h-1.5 w-1.5 rounded-full",
                        DOT[e.tone],
                      )}
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.68rem] text-text">{e.label}</span>
                      <span className="tnum shrink-0 text-[0.62rem] text-text-subtle">{hhmm(e.at)}</span>
                    </div>
                    {e.note && (
                      <p className="mt-0.5 text-[0.6rem] leading-snug text-text-subtle">{e.note}</p>
                    )}
                  </li>
                ))}
              </ol>
            );
          })()}
        </div>
      )}

      {impact && (
        <div className="space-y-2">
          {(() => {
            const sens = ecologicalSensitivity(impact);
            const reached = impact.receptors.filter((r) => r.likelihood > 0.15);
            const prio = cleanupPriority(impact.priority_score, {
              areaKm2: impact.affected_area_km2_estimate,
              sensitivity: sens.label,
              receptorCount: reached.length,
            });
            const density =
              reached.length >= 3 || sens.label === "Critical"
                ? "High"
                : reached.length >= 1 || sens.label === "High"
                  ? "Moderate"
                  : "Low";
            const SENS_PCT: Record<string, number> = {
              Critical: 92, High: 68, Moderate: 42, Low: 18,
            };
            const affected =
              (impact as { marine_life_affected_pct?: number }).marine_life_affected_pct ??
              (density === "High" ? 72 : density === "Moderate" ? 44 : 18);
            return (
              <>
                <div className="rounded-[12px] border border-border bg-[linear-gradient(160deg,rgb(var(--surface-1)/0.55),rgb(var(--navy-950)/0.45))] p-3">
                  <div className="flex items-start gap-3.5">
                    <CleanupGauge score={prio.score} label={prio.label} tone={prio.tone} />
                    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                      <IntelBar
                        label="Environmental priority"
                        pct={impact.priority_score * 100}
                        tone={prio.tone}
                      />
                      <IntelBar
                        label="Ecological sensitivity"
                        pct={SENS_PCT[sens.label] ?? 30}
                        valueText={sens.label}
                        tone={sens.tone}
                      />
                      <IntelBar
                        label="Marine life affected"
                        pct={affected}
                        tone={affected >= 60 ? "danger" : affected >= 35 ? "warning" : "success"}
                      />
                    </div>
                  </div>
                  <p className="mt-2.5 text-[0.62rem] leading-snug text-text-muted">{prio.why}</p>
                  <div className="mt-1.5 text-[0.58rem] text-text-subtle">
                    {reached.length} sensitive receptor{reached.length === 1 ? "" : "s"} in the drift path
                  </div>
                </div>
                {invId && (
                  <Link
                    href={`/investigations/${invId}/environment`}
                    className="inline-flex items-center gap-1 text-[0.68rem] text-text-muted hover:text-accent"
                  >
                    Full environmental impact <ArrowUpRight size={11} />
                  </Link>
                )}
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
