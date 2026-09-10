"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Pause, Play, RotateCcw } from "lucide-react";
import { formatArea } from "@/lib/geo/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useTimelineStore } from "@/store/timeline";

export default function TimelineTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const ocean = useOceanStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const forecast = ocean?.forecast;
  const hindcast = ocean?.hindcast;
  const { hour, startHour, horizon, mode, playing, setHour, setStartHour, setHorizon, setMode, setPlaying } =
    useTimelineStore();

  const t0 = detection ? new Date(detection.detected_at).getTime() : 0;
  const reconStart = hindcast
    ? Math.max(
        -20,
        Math.round((new Date(hindcast.origin.release_window.start).getTime() - t0) / 3.6e6) - 2,
      )
    : -12;
  const rwStartH = hindcast
    ? (new Date(hindcast.origin.release_window.start).getTime() - t0) / 3.6e6
    : 0;
  const rwEndH = hindcast
    ? (new Date(hindcast.origin.release_window.end).getTime() - t0) / 3.6e6
    : 0;

  useEffect(() => {
    if (forecast) setHorizon(forecast.horizon_hours);
  }, [forecast, setHorizon]);
  useEffect(() => {
    setStartHour(mode === "reconstruction" ? reconStart : 0);
    if (mode === "forecast" && useTimelineStore.getState().hour < 0) setHour(0);
  }, [mode, reconStart, setStartHour, setHour]);

  // playback loop lives in <TimelineBar> (always mounted) so it runs on every route

  if (!scenarioId || !detection || !forecast) {
    return (
      <div className="p-4">
        <EmptyState
          title="Forecast required"
          milestone="M5"
          description="The timeline plays back the drift forecast. Run detection, then the hindcast, then the forecast first."
        >
          {scenarioId && (
            <Link
              href={`/investigations/${params.id}/${detection ? "ocean" : "detection"}`}
              className="text-xs text-accent hover:underline"
            >
              Continue the pipeline →
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  const at = new Date(t0 + hour * 3.6e6);
  const area = interpArea(forecast.expected_area_km2_by_hour, Math.max(hour, 0));
  const reached = forecast.affected_coasts.filter(
    (c) => c.eta && new Date(c.eta).getTime() <= at.getTime(),
  );
  const pending = forecast.affected_coasts.filter(
    (c) => c.eta && new Date(c.eta).getTime() > at.getTime(),
  );

  const phase =
    mode === "reconstruction" && hour < rwStartH
      ? { label: "Transit before release", tone: "text-text-muted" }
      : hour >= rwStartH && hour <= rwEndH
        ? { label: "⚠ Discharge in progress", tone: "text-danger" }
        : hour < 1
          ? { label: "Slick detected by Sentinel 1", tone: "text-accent" }
          : { label: "Drifting (forecast)", tone: "text-text-muted" };

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-1">
        {(
          [
            ["reconstruction", "Rewind", "what already happened"],
            ["forecast", "Fast-forward", "what happens next"],
          ] as const
        ).map(([m, label, caption]) => (
          <button
            key={m}
            onClick={() => {
              setPlaying(false);
              setMode(m);
              setHour(m === "reconstruction" ? reconStart : 0);
            }}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-left transition-colors ${
              mode === m
                ? "border-accent/45 bg-accent/10 text-accent"
                : "border-border text-text-muted hover:border-border-strong"
            }`}
            disabled={m === "reconstruction" && !hindcast}
          >
            <span className="block text-[11px] font-medium">{label}</span>
            <span className="block text-[10px] leading-tight text-text-subtle">{caption}</span>
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-text-muted">
        {mode === "reconstruction"
          ? "Rewind the event. Watch the suspect sail in, go dark and discharge the oil, then the slick start to drift, right up to the moment the satellite photographed it. The moving marker is where MV Horizon was at each point in time."
          : "Fast-forward from the detection. Watch the oil keep drifting and spreading over the next few days, and see roughly when it could reach the coast. The dark shape is the projected oil body; the three markers are the drift model's spread of outcomes."}
      </p>

      <div className="rounded-sm border border-border bg-surface-2/60 p-3">
        <div className="tnum flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">
            {hour >= 0 ? "+" : ""}
            {Math.round(hour)} h
          </span>
          <span className="text-[11px] text-text-muted">
            {at.toISOString().replace("T", " ").slice(0, 16)}Z
          </span>
        </div>
        <div className={`mt-0.5 text-[11px] font-medium ${phase.tone}`}>{phase.label}</div>
        <input
          type="range"
          min={startHour}
          max={horizon}
          step={1}
          value={hour}
          onChange={(e) => {
            setPlaying(false);
            setHour(Number(e.target.value));
          }}
          className="mt-2 w-full accent-[rgb(var(--accent))]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setPlaying(!playing)}
            className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setHour(startHour);
            }}
            className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted hover:border-border-strong"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Projected extent" value={formatArea(area)} />
        <Metric label="Coasts reached" value={`${reached.length} / ${forecast.affected_coasts.length}`} />
      </div>

      {reached.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-danger">
            Landfall by now
          </h3>
          <ul className="mt-1 space-y-0.5 text-[11px] text-text-muted">
            {reached.map((c) => (
              <li key={c.name}>
                {c.name}: {c.eta && new Date(c.eta).toISOString().slice(5, 16).replace("T", " ")}Z
              </li>
            ))}
          </ul>
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
            Still approaching
          </h3>
          <ul className="mt-1 space-y-0.5 text-[11px] text-text-subtle">
            {pending.map((c) => (
              <li key={c.name}>
                {c.name}: ETA {c.eta && new Date(c.eta).toISOString().slice(5, 16).replace("T", " ")}Z
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

function interpArea(map: Record<string, number>, hour: number): number {
  const pts = Object.entries(map)
    .map(([h, v]) => [Number(h), v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  if (hour <= pts[0]![0]) return pts[0]![1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [h0, v0] = pts[i]!;
    const [h1, v1] = pts[i + 1]!;
    if (hour >= h0 && hour <= h1) {
      const t = (hour - h0) / (h1 - h0 || 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return pts[pts.length - 1]![1];
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
      <div className="tnum mt-0.5 text-xs font-semibold text-text">{value}</div>
    </div>
  );
}
