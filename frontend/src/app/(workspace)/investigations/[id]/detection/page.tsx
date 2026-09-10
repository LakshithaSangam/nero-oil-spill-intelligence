"use client";

import { useEffect, useState } from "react";
import { Check, Crosshair, Loader2, Radar, RefreshCw, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatArea } from "@/lib/geo/format";
import { lookupDepth } from "@/lib/geo/depth";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore, DETECTION_PHASES } from "@/store/detection";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";
import { useSimilarityStore } from "@/store/similarity";
import type { SceneRef, SpillDetection } from "@/types/api";

export default function DetectionTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;

  const scenarios = useScenarioStore((s) => s.scenarios);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;

  const { byScenario, scenes, running, phase, error, run, loadScenes } = useDetectionStore();
  const detection = scenarioId ? byScenario[scenarioId] : undefined;
  const isRunning = running === scenarioId;
  const sceneList = scenarioId ? (scenes[scenarioId] ?? []) : [];

  useEffect(() => {
    if (scenarioId) void loadScenes(scenarioId);
  }, [scenarioId, loadScenes]);

  if (!scenarioId) {
    return (
      <div className="p-4">
        <EmptyState
          title="No imagery-backed scenario"
          milestone="M2"
          description="This investigation isn't linked to a replay scenario with Sentinel coverage, so detection can't run yet. Attach one from the incident catalog."
        />
      </div>
    );
  }

  const doRun = () => {
    if (!scenario) return;
    void run(scenarioId, { bbox: scenario.aoi, scenario: scenarioId });
  };

  return (
    <div className="space-y-5 p-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Sentinel-1 SAR segmentation with Sentinel-2 optical validation, then geometry and
        characterisation of the slick.
      </p>

      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {!detection && !isRunning && (
        <button
          onClick={doRun}
          disabled={!scenario}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          <Radar size={14} /> {scenario ? "Run detection" : "loading scenario…"}
        </button>
      )}

      {isRunning && <PhaseStepper current={phase} />}

      {detection && !isRunning && (
        <>
          <ResultView detection={detection} />
          <HistoricalTimeline detectionId={detection.id} />
          <SimilarSpills detectionId={detection.id} />
          <button
            onClick={doRun}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-border-strong py-2 text-xs font-medium text-text-muted transition-colors hover:border-accent/60 hover:text-accent"
          >
            <RefreshCw size={13} /> Re-run detection
          </button>
        </>
      )}

      <ImageryPane scenes={sceneList} />
    </div>
  );
}

const TREND_TONE: Record<string, "outline" | "warning" | "danger" | "success"> = {
  new: "outline",
  expanding: "danger",
  stable: "warning",
  recovering: "success",
  unknown: "outline",
};

function HistoricalTimeline({ detectionId }: { detectionId: string }) {
  const loadTimeline = useDetectionStore((s) => s.loadTimeline);
  const tl = useDetectionStore((s) => s.timelines[detectionId]);

  useEffect(() => {
    void loadTimeline(detectionId);
  }, [detectionId, loadTimeline]);

  if (!tl || tl.entries.length < 2) return null;
  const areas = tl.entries.map((e) => e.area_km2);
  const max = Math.max(...areas, 1);
  const min = Math.min(...areas);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Historical satellite timeline
        </h3>
        <Badge tone={TREND_TONE[tl.trend]}>{tl.trend}</Badge>
      </div>

      <svg viewBox="0 0 240 56" className="mt-2 w-full" preserveAspectRatio="none">
        <polyline
          points={tl.entries
            .map((e, i) => {
              const x = (i / (tl.entries.length - 1)) * 232 + 4;
              const y = 50 - ((e.area_km2 - min) / (max - min || 1)) * 42;
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgb(var(--layer-spill))"
          strokeWidth="1.5"
        />
        {tl.entries.map((e, i) => {
          const x = (i / (tl.entries.length - 1)) * 232 + 4;
          const y = 50 - ((e.area_km2 - min) / (max - min || 1)) * 42;
          return <circle key={e.scene_id} cx={x} cy={y} r="2.5" fill="rgb(var(--layer-spill-edge))" />;
        })}
      </svg>

      <ul className="mt-1 space-y-0.5">
        {tl.entries.map((e) => (
          <li key={e.scene_id} className="tnum flex items-baseline justify-between text-[11px] text-text-muted">
            <span className="text-text-subtle">{e.acquired_at.slice(0, 10)}</span>
            <span>
              {e.area_km2.toFixed(1)} km²
              {e.area_delta_pct != null && (
                <span className={e.area_delta_pct >= 0 ? "text-danger" : "text-success"}>
                  {" "}
                  {e.area_delta_pct >= 0 ? "+" : ""}
                  {e.area_delta_pct}%
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{tl.trend_rationale}</p>

      {tl.recovery && (
        <div className="mt-2 rounded-sm border border-border bg-surface-2/50 px-3 py-2 text-[11px]">
          <div className="font-medium text-text">Recovery</div>
          <div className="tnum mt-0.5 text-text-muted">
            peak {tl.recovery.peak_area_km2} km², now {tl.recovery.latest_area_km2} km² ·{" "}
            {tl.recovery.reduction_from_peak_pct}% cleared
          </div>
          <p className="mt-0.5 text-text-subtle">{tl.recovery.assessment}</p>
        </div>
      )}
    </section>
  );
}

function SimilarSpills({ detectionId }: { detectionId: string }) {
  const loadFor = useSimilarityStore((s) => s.loadFor);
  const result = useSimilarityStore((s) => s.byDetection[detectionId]);
  const loading = useSimilarityStore((s) => s.loading === detectionId);

  useEffect(() => {
    void loadFor(detectionId);
  }, [detectionId, loadFor]);

  if (loading && !result) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-text-subtle">
        <Loader2 size={12} className="animate-spin" /> searching historical spills…
      </p>
    );
  }
  if (!result) return null;

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
        Similar historical spills
      </h3>
      <div className="mt-1.5 rounded-sm border border-border bg-surface-2/50 px-3 py-2">
        <div className="text-[11px] text-text">
          Precedent points to{" "}
          <span className="font-semibold capitalize text-accent">
            {result.inferred_cause.replace(/-/g, " ")}
          </span>{" "}
          <span className="tnum text-text-subtle">
            ({Math.round(result.inferred_cause_confidence * 100)}%)
          </span>
          {result.inferred_vessel_type && (
            <span className="text-text-muted"> · likely a {result.inferred_vessel_type}</span>
          )}
        </div>
      </div>
      <ul className="mt-1.5 space-y-1">
        {result.cases.map((c) => (
          <li key={c.id} className="rounded-sm border border-border px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-text">{c.name}</span>
              <span className="tnum shrink-0 text-[11px] text-text-muted">
                {Math.round(c.similarity_score * 100)}%
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-text-subtle">
              {c.date.slice(0, 4)} · {c.cause.replace(/-/g, " ")} · {c.matched_features.slice(0, 3).join(", ")}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhaseStepper({ current }: { current: string | null }) {
  const idx = DETECTION_PHASES.findIndex((p) => p.key === current);
  return (
    <ol className="space-y-1.5">
      {DETECTION_PHASES.map((p, i) => {
        const done = idx > i;
        const active = idx === i;
        return (
          <li
            key={p.key}
            className={cn(
              "flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs",
              active
                ? "border-accent/45 bg-accent/10 text-text"
                : done
                  ? "border-border text-text-muted"
                  : "border-border text-text-subtle",
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
            {p.label}
          </li>
        );
      })}
    </ol>
  );
}

const SEV_BAND: { max: number; label: string; tone: "outline" | "warning" | "danger" }[] = [
  { max: 100, label: "minor", tone: "outline" },
  { max: 1000, label: "moderate", tone: "warning" },
  { max: 10000, label: "major", tone: "danger" },
  { max: Infinity, label: "catastrophic", tone: "danger" },
];

function spillSeverity(volumeHighBbl: number, areaKm2: number) {
  let band = SEV_BAND.find((b) => volumeHighBbl < b.max) ?? SEV_BAND[SEV_BAND.length - 1]!;
  // a very large footprint bumps the band up one step
  if (areaKm2 > 60 && band !== SEV_BAND[SEV_BAND.length - 1]) {
    band = SEV_BAND[SEV_BAND.indexOf(band) + 1]!;
  }
  return band;
}

function ResultView({ detection }: { detection: SpillDetection }) {
  const g = detection.geometry;
  const c = detection.characterisation;
  const flyTo = useMapStore((s) => s.flyTo);
  const layers = useLayersStore((s) => s.layers);
  const toggle = useLayersStore((s) => s.toggle);
  const spillOn = layers.find((l) => l.id === "spill")?.visible ?? false;

  const sev = spillSeverity(c.estimated_volume_bbl_high, g.area_km2);
  const [depth, setDepth] = useState<number | null | "loading">("loading");
  useEffect(() => {
    let live = true;
    setDepth("loading");
    void lookupDepth(g.centroid[0], g.centroid[1]).then((d) => {
      if (live) setDepth(d);
    });
    return () => {
      live = false;
    };
  }, [g.centroid]);

  const depthStr =
    depth === "loading" ? "…" : depth == null ? "n/a" : `~${Math.round(depth).toLocaleString()} m`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={sev.tone}>{sev.label} severity</Badge>
        <Badge tone={detection.eo_validated ? "success" : "warning"}>
          {detection.eo_validated ? "EO validated" : "SAR only"}
        </Badge>
        <Badge tone="outline">{c.thickness_class}</Badge>
        <Badge tone="outline">{g.fragment_count} fragment{g.fragment_count > 1 ? "s" : ""}</Badge>
      </div>

      <div className="grid grid-cols-2 border-t border-border/70">
        <Metric label="Area" value={formatArea(g.area_km2)} first />
        <Metric label="Perimeter" value={`${g.perimeter_km.toFixed(1)} km`} />
        <Metric label="Slick length" value={`${(g.slick_length_km ?? 0).toFixed(1)} km`} first />
        <Metric
          label="Est. volume"
          value={`${fmt(c.estimated_volume_bbl_low)} to ${fmt(c.estimated_volume_bbl_high)} bbl`}
        />
        <Metric label="Spill age" value={`${c.spill_age_hours_low} to ${c.spill_age_hours_high} h`} first />
        <Metric label="Oil type" value={c.oil_type} />
        <Metric label="Water depth" value={depthStr} first />
        <Metric label="Fragments" value={String(g.fragment_count)} />
      </div>

      <ConfidenceBar
        score={c.oil_type_confidence.score}
        label="Oil-type confidence"
        rationale={c.oil_type_confidence.rationale}
      />

      <ConfidenceBar
        score={detection.detection_confidence.score}
        label="Detection confidence"
        rationale={detection.detection_confidence.rationale}
      />

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          False-positive screening
        </h3>
        <ul className="mt-1.5 space-y-1">
          {detection.false_positive_checks.map((chk) => (
            <li key={chk} className="flex gap-2 text-[11px] leading-snug text-text-muted">
              <Check size={12} className="mt-0.5 shrink-0 text-success" />
              {chk}
            </li>
          ))}
        </ul>
      </div>

      {detection.segmentation_model_id && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
            Segmentation model
          </h3>
          <p className="mt-1.5 font-mono text-[11px] text-text-muted">
            {detection.segmentation_model_id}
          </p>
          {detection.segmentation_notes && (
            <p className="mt-1 text-[11px] leading-snug text-text-subtle">
              {detection.segmentation_notes}
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-1 text-[11px]">
        <SceneId label="SAR scene" value={detection.sar_scene_id} />
        {detection.eo_scene_id && <SceneId label="EO scene" value={detection.eo_scene_id} />}
      </dl>

      <div className="flex gap-2">
        <button
          onClick={() => toggle("spill")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-sm border py-1.5 text-[11px] font-medium transition-colors",
            spillOn
              ? "border-accent/45 bg-accent/10 text-accent"
              : "border-border text-text-muted hover:border-border-strong",
          )}
        >
          <Satellite size={12} /> {spillOn ? "Layer on" : "Layer off"}
        </button>
        <button
          onClick={() =>
            flyTo({ center: [g.centroid[0], g.centroid[1]], zoom: 10.5 })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-border py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:border-border-strong"
        >
          <Crosshair size={12} /> Fit to spill
        </button>
      </div>
    </div>
  );
}

function ImageryPane({ scenes }: { scenes: SceneRef[] }) {
  if (!scenes.length) return null;
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
        Imagery ({scenes.length})
      </h3>
      <ul className="mt-1.5 space-y-1">
        {scenes.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 text-[11px]"
          >
            <Badge tone={s.sensor.includes("sar") ? "accent" : "outline"}>
              {s.sensor.includes("sar") ? "SAR" : "EO"}
            </Badge>
            <span className="tnum flex-1 truncate text-text-muted">
              {s.acquired_at.slice(0, 10)}
              {s.polarisations.length ? ` · ${s.polarisations.join("/")}` : ""}
              {s.cloud_cover_pct != null ? ` · ${Math.round(s.cloud_cover_pct)}% cloud` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={cn("border-b border-border/70 py-2.5", first ? "pr-3" : "border-l border-border/70 pl-3")}>
      <div className="eyebrow text-[0.54rem]">{label}</div>
      <div className="metric mt-1 text-[0.9rem] capitalize text-text">{value}</div>
    </div>
  );
}

function SceneId({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="tnum truncate text-text-muted">{value}</dd>
    </div>
  );
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}
