"use client";

import Link from "next/link";
import { Crosshair, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanupPriority, ecologicalSensitivity } from "@/lib/assess";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useEnvironmentalStore } from "@/store/environmental";
import { useMapStore } from "@/store/map";
import { useOceanStore } from "@/store/ocean";
import type { ReceptorThreat } from "@/types/api";

const TONE_CLASS = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/45 bg-danger/10 text-danger",
} as const;

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n / 1e3)}k`;
}

export default function EnvironmentTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const forecast = useOceanStore((s) =>
    detection ? s.byDetection[detection.id]?.forecast : undefined,
  );
  const { byDetection, running, error, run } = useEnvironmentalStore();
  const impact = detection ? byDetection[detection.id] : undefined;
  const flyTo = useMapStore((s) => s.flyTo);

  if (!scenarioId || !detection || !forecast) {
    return (
      <div className="p-4">
        <EmptyState
          title={detection ? "Forecast required" : "Detection required"}
          milestone="M5"
          description="The environmental rollup joins the drift forecast with coastal & ecological receptors. Run the forecast first."
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

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs leading-relaxed text-text-muted">
        What the drift puts at risk: an environmental priority score, the receptors in
        the oil&apos;s path, and rough cleanup cost and liability ranges. All money
        figures are in US dollars.
      </p>

      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {!impact ? (
        <button
          onClick={() => run(detection.id)}
          disabled={running === detection.id}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          <Leaf size={14} /> {running === detection.id ? "Assessing…" : "Run assessment"}
        </button>
      ) : (
        (() => {
          const sens = ecologicalSensitivity(impact);
          const areaGrowth =
            forecast.expected_area_km2_by_hour?.["24"] && forecast.expected_area_km2_by_hour?.["0"]
              ? ((forecast.expected_area_km2_by_hour["24"] - forecast.expected_area_km2_by_hour["0"]) /
                  (forecast.expected_area_km2_by_hour["0"] || 1)) *
                100
              : null;
          const nearestCoast = Math.min(
            Infinity,
            ...impact.receptors.filter((r) => r.kind === "coastline").map((r) => r.distance_km),
          );
          const prio = cleanupPriority(impact.priority_score, {
            areaKm2: impact.affected_area_km2_estimate,
            growthPctPerDay: areaGrowth,
            distanceToCoastKm: Number.isFinite(nearestCoast) ? nearestCoast : null,
            sensitivity: sens.label,
            receptorCount: impact.receptors.filter((r) => r.likelihood > 0.15).length,
          });
          return (
        <>
          {/* cleanup priority — named level */}
          <div className={cn("rounded-sm border p-3", TONE_CLASS[prio.tone])}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
                Cleanup priority
              </span>
              <span className="tnum text-[11px] opacity-80">{prio.score} / 100</span>
            </div>
            <div className="mt-1 text-[1.05rem] font-semibold leading-tight">{prio.label}</div>
            <p className="mt-1 text-[11px] leading-relaxed opacity-90">{prio.why}</p>
          </div>

          {/* ecological sensitivity — named band */}
          <div className={cn("rounded-sm border p-3", TONE_CLASS[sens.tone])}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
              Ecological sensitivity
            </div>
            <div className="mt-1 text-[1.05rem] font-semibold leading-tight">{sens.label}</div>
            <p className="mt-1 text-[11px] leading-relaxed opacity-90">{sens.why}</p>
          </div>

          {/* marine life in the spill area + estimated % affected */}
          {impact.marine_biodiversity && (
            <div className="rounded-sm border border-border bg-surface-2/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                  Marine life in the spill area
                </span>
                <span className="tnum text-[11px] text-text-muted">
                  {Math.round(impact.marine_life_affected_pct ?? 0)}% affected
                </span>
              </div>
              <div className="mt-1 text-[1.05rem] font-semibold leading-tight text-text">
                {impact.marine_biodiversity} biodiversity
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-danger/80"
                  style={{ width: `${Math.min(100, impact.marine_life_affected_pct ?? 0)}%` }}
                />
              </div>
              {impact.marine_life_note && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
                  {impact.marine_life_note}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Affected area" value={`${impact.affected_area_km2_estimate} km²`} />
            <Metric
              label="Cleanup cost (USD)"
              value={`${usd(impact.estimated_cleanup_cost_usd_low)} to ${usd(impact.estimated_cleanup_cost_usd_high)}`}
            />
            <Metric
              label="Liability (USD)"
              value={`${usd(impact.estimated_liability_usd_low)} to ${usd(impact.estimated_liability_usd_high)}`}
              wide
            />
          </div>

          <div>
            <h3 className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
              Receptors
              <span className="normal-case tracking-normal text-text-subtle">
                {Object.entries(impact.receptor_summary)
                  .map(([k, n]) => `${n} ${k.replace(/-/g, " ")}`)
                  .join(" · ") || "none reached"}
              </span>
            </h3>
            <div className="mt-1.5 space-y-1.5">
              {impact.receptors.map((r) => (
                <ReceptorRow key={r.receptor_id} r={r} onFocus={() => focusReceptor(r, flyTo)} />
              ))}
            </div>
          </div>

          {impact.response_guidance.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                Response guidance
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {impact.response_guidance.map((g, i) => (
                  <li
                    key={i}
                    className="rounded-sm border border-border bg-surface-2/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-text-muted"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-sm border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-text-muted">
            {impact.notes}
          </p>
        </>
          );
        })()
      )}
    </div>
  );
}

function focusReceptor(r: ReceptorThreat, flyTo: (o: { center: [number, number]; zoom: number }) => void) {
  const line = r.geometry.features[0]?.geometry.coordinates as number[][] | undefined;
  const mid = line?.[Math.floor((line.length - 1) / 2)];
  if (mid) flyTo({ center: [mid[0]!, mid[1]!], zoom: 8 });
}

function ReceptorRow({ r, onFocus }: { r: ReceptorThreat; onFocus: () => void }) {
  const reached = r.eta != null && r.likelihood > 0;
  return (
    <button
      onClick={onFocus}
      className="flex w-full items-center gap-2 rounded-sm border border-border px-2.5 py-2 text-left transition-colors hover:border-border-strong"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11px] text-text">{r.name}</span>
          {(r.kind === "coral-reef" || r.kind === "mangrove" || r.kind === "seagrass") && (
            <span className="shrink-0 rounded-sm border border-danger/30 px-1 text-[9px] uppercase text-danger">
              no recovery
            </span>
          )}
        </span>
        <span className="tnum block text-[10px] text-text-subtle">
          {r.kind} · {r.distance_km} km · exposure {Math.round(r.exposure * 100)}%
        </span>
        <span className="tnum block text-[10px] text-text-subtle">
          {reached
            ? `ETA ${new Date(r.eta!).toISOString().replace("T", " ").slice(5, 16)}Z`
            : "no projected contact"}
        </span>
        {reached && r.response_note && (
          <span className="mt-0.5 block text-[10px] leading-snug text-text-muted">
            {r.response_note}
          </span>
        )}
      </span>
      <span
        className={`tnum shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${
          r.likelihood >= 0.5
            ? "border-danger/30 text-danger"
            : r.likelihood > 0
              ? "border-warning/30 text-warning"
              : "border-border text-text-subtle"
        }`}
      >
        {Math.round(r.likelihood * 100)}%
      </span>
      <Crosshair size={12} className="shrink-0 text-text-subtle" />
    </button>
  );
}

function Metric({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-sm border border-border bg-surface-2/60 px-2.5 py-2 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
      <div className="tnum mt-0.5 text-xs font-semibold text-text">{value}</div>
    </div>
  );
}
