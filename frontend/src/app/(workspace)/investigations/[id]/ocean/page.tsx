"use client";

import Link from "next/link";
import { Check, Crosshair, Loader2, RefreshCw, Waves, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatArea } from "@/lib/geo/format";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useMapStore } from "@/store/map";
import {
  FORECAST_PHASES,
  HINDCAST_PHASES,
  useOceanStore,
} from "@/store/ocean";
import type { ForecastResult, HindcastResult } from "@/types/api";

const MEMBER_TONE: Record<string, string> = {
  nominal: "layer-forecast",
  "wind-driven": "warning",
  "current-dominated": "layer-hindcast",
};

export default function OceanTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const { byDetection, running, phase, error, runHindcast, runForecast } = useOceanStore();
  const entry = detection ? byDetection[detection.id] : undefined;

  if (!scenarioId || !detection) {
    return (
      <div className="p-4">
        <EmptyState
          title="Detection required"
          milestone="M3"
          description="The ocean intelligence engine reverse-advects the detected slick. Run Module 1 first."
        >
          {scenarioId && (
            <Link
              href={`/investigations/${params.id}/detection`}
              className="text-xs text-accent hover:underline"
            >
              Go to detection →
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Reverse particle advection reconstructs the origin and release window; a forward
        forcing ensemble projects the drift, expansion and coastal exposure.
      </p>

      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* ---- hindcast ---- */}
      <section>
        <SectionTitle icon={<Waves size={13} />} title="Hindcast: origin and release window" />
        {running === "hindcast" ? (
          <PhaseSteps phases={HINDCAST_PHASES} current={phase} />
        ) : entry?.hindcast ? (
          <HindcastView hc={entry.hindcast} onRerun={() => runHindcast(detection.id)} />
        ) : (
          <RunButton label="Run hindcast" disabled={!!running} onClick={() => runHindcast(detection.id)} />
        )}
      </section>

      {/* ---- forecast ---- */}
      <section>
        <SectionTitle icon={<Wind size={13} />} title="Forecast: drift, spread and landfall" />
        {running === "forecast" ? (
          <PhaseSteps phases={FORECAST_PHASES} current={phase} />
        ) : entry?.forecast ? (
          <ForecastView fc={entry.forecast} onRerun={() => runForecast(detection.id)} />
        ) : (
          <RunButton label="Run forecast" disabled={!!running} onClick={() => runForecast(detection.id)} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HindcastView({ hc, onRerun }: { hc: HindcastResult; onRerun: () => void }) {
  const flyTo = useMapStore((s) => s.flyTo);
  const o = hc.origin;
  const start = new Date(o.release_window.start);
  const end = new Date(o.release_window.end);
  const durH = Math.round((end.getTime() - start.getTime()) / 3.6e6);

  return (
    <div className="mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Origin" value={`${o.point.lat.toFixed(3)}, ${o.point.lon.toFixed(3)}`} />
        <Metric label="Release window" value={`${durH} h`} />
      </div>
      <div className="rounded-sm border border-border bg-surface-2/60 px-3 py-2 text-[11px]">
        <div className="tnum text-text">
          {start.toISOString().replace("T", " ").slice(0, 16)}Z
        </div>
        <div className="text-text-subtle">to</div>
        <div className="tnum text-text">
          {end.toISOString().replace("T", " ").slice(0, 16)}Z
        </div>
      </div>
      <ConfidenceBar
        score={o.confidence.score}
        label="Origin confidence"
        rationale={o.confidence.rationale}
      />
      <p className="text-[11px] text-text-subtle">{o.method}</p>
      <div className="flex gap-2">
        <button
          onClick={() => flyTo({ center: [o.point.lon, o.point.lat], zoom: 10 })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-border py-1.5 text-[11px] font-medium text-text-muted hover:border-border-strong"
        >
          <Crosshair size={12} /> Fit to origin
        </button>
        <RerunButton onClick={onRerun} />
      </div>
    </div>
  );
}

function ForecastView({ fc, onRerun }: { fc: ForecastResult; onRerun: () => void }) {
  const flyTo = useMapStore((s) => s.flyTo);
  const areaEntries = Object.entries(fc.expected_area_km2_by_hour).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  const maxArea = Math.max(...areaEntries.map(([, v]) => v), 1);

  return (
    <div className="mt-2 space-y-3">
      <div className="text-[11px] text-text-subtle">Horizon {fc.horizon_hours} h</div>

      <div className="space-y-1.5">
        {fc.scenarios.map((s) => (
          <div key={s.id} className="rounded-sm border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: `rgb(var(--${MEMBER_TONE[s.id] ?? "layer-forecast"}))` }}
              />
              <span className="flex-1 text-xs font-medium text-text">{s.label}</span>
              <span className="tnum text-[11px] text-text-muted">
                {Math.round(s.probability * 100)}%
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-text-subtle">{s.forcing_note}</p>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Expected extent
        </h4>
        <div className="mt-1.5 space-y-1">
          {areaEntries.map(([h, v]) => (
            <div key={h} className="flex items-center gap-2 text-[11px]">
              <span className="tnum w-8 shrink-0 text-text-subtle">{h}h</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full bg-layer-forecast/70"
                  style={{ width: `${(v / maxArea) * 100}%` }}
                />
              </span>
              <span className="tnum w-16 shrink-0 text-right text-text-muted">
                {formatArea(v)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Coastal exposure
        </h4>
        <div className="mt-1.5 space-y-1">
          {fc.affected_coasts.map((c) => {
            const reached = c.eta != null && c.likelihood > 0;
            return (
              <div
                key={c.name}
                className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-text">{c.name}</span>
                  <span className="tnum block text-[10px] text-text-subtle">
                    {reached
                      ? `ETA ${new Date(c.eta!).toISOString().replace("T", " ").slice(5, 16)}Z`
                      : "no landfall within horizon"}
                  </span>
                </span>
                <Badge tone={c.likelihood >= 0.5 ? "danger" : c.likelihood > 0 ? "warning" : "outline"}>
                  {Math.round(c.likelihood * 100)}%
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            const line = fc.scenarios[0]?.track.features.find(
              (f) => f.geometry.type === "LineString",
            );
            const coords = (line?.geometry.coordinates as number[][] | undefined) ?? [];
            const last = coords[coords.length - 1];
            if (last) flyTo({ center: [last[0]!, last[1]!], zoom: 8 });
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-border py-1.5 text-[11px] font-medium text-text-muted hover:border-border-strong"
        >
          <Crosshair size={12} /> Fit to drift
        </button>
        <RerunButton onClick={onRerun} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {icon} {title}
    </h3>
  );
}

function RunButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function RerunButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
    >
      <RefreshCw size={12} />
    </button>
  );
}

function PhaseSteps({
  phases,
  current,
}: {
  phases: readonly string[];
  current: string | null;
}) {
  const idx = current ? phases.indexOf(current) : -1;
  return (
    <ol className="mt-2 space-y-1.5">
      {phases.map((p, i) => {
        const done = idx > i;
        const active = idx === i;
        return (
          <li
            key={p}
            className={cn(
              "flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs",
              active
                ? "border-accent/45 bg-accent/10 text-text"
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
            {p}
          </li>
        );
      })}
    </ol>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
      <div className="tnum mt-0.5 text-xs font-semibold text-text">{value}</div>
    </div>
  );
}
