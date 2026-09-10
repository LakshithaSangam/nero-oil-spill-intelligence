"use client";

import { useEffect } from "react";
import { GitCompareArrows, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatArea } from "@/lib/geo/format";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useScenarioStore } from "@/store/scenario";
import { useTimelineStore, type PlaybackSpeed } from "@/store/timeline";

const SPEEDS: PlaybackSpeed[] = [1, 2, 5];

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

/**
 * Persistent environmental replay scrubber along the bottom of the console.
 * Shown only once a drift forecast exists for the active scenario; shares
 * useTimelineStore with the Timeline tab so the two stay in lock-step.
 */
export function TimelineBar() {
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const forecast = useOceanStore((s) => (detection ? s.byDetection[detection.id]?.forecast : undefined));

  const {
    hour, startHour, horizon, playing, speed, compareHour,
    setHour, setPlaying, setSpeed, setCompareHour,
  } = useTimelineStore();

  // smooth playback: a short delta-timed interval (~33 ms) advances the clock in
  // small steps so the drift time-lapse plays like video rather than lurching.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); // clamp big gaps (tab blur)
      last = now;
      const s = useTimelineStore.getState();
      // ~9 forecast-hours per real second at 1×; the speed control scales it
      const next = s.hour + dt * 9 * s.speed;
      if (next >= s.horizon) {
        useTimelineStore.setState({ hour: s.horizon, playing: false });
        return;
      }
      useTimelineStore.setState({ hour: next });
    }, 33);
    return () => clearInterval(id);
  }, [playing]);

  // pressing play once the clock has run out rewinds to the start first
  const onPlayToggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (hour >= horizon - 0.01) setHour(startHour);
    setPlaying(true);
  };

  useEffect(() => () => setPlaying(false), [setPlaying]);

  if (!detection || !forecast) return null;

  const t0 = new Date(detection.detected_at).getTime();
  const at = new Date(t0 + hour * 3.6e6);
  const span = horizon - startHour || 1;
  const pct = ((hour - startHour) / span) * 100;
  const acqPct = ((0 - startHour) / span) * 100;

  const areaNow = interpArea(forecast.expected_area_km2_by_hour, Math.max(hour, 0));
  const areaCmp =
    compareHour != null
      ? interpArea(forecast.expected_area_km2_by_hour, Math.max(compareHour, 0))
      : null;

  const stage = hour <= 1 ? "at detection" : "projected drift";

  return (
    <div
      className="panel flex items-center gap-3 px-3 py-1.5 text-[11px] text-text-muted"
      title="Drift forecast replay. Drag, or press play, to move the spill, drift vectors and vessel positions forward through the 72 hour forecast."
    >
      <span className="shrink-0 leading-tight">
        <span className="block text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Drift forecast
        </span>
        <span className="block text-[0.56rem] uppercase tracking-[0.16em] text-text-subtle">
          replay
        </span>
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconBtn label="Jump to acquisition" onClick={() => { setPlaying(false); setHour(0); }}>
          <SkipBack size={13} />
        </IconBtn>
        <IconBtn
          label={playing ? "Pause" : "Play"}
          onClick={onPlayToggle}
          className="text-text hover:text-accent"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </IconBtn>
        <IconBtn label="Jump to latest pass" onClick={() => { setPlaying(false); setHour(horizon); }}>
          <SkipForward size={13} />
        </IconBtn>
      </div>

      <button
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
        className="tnum shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent/60 hover:text-accent"
        aria-label="Playback speed"
      >
        {speed}×
      </button>

      {/* track */}
      <div className="relative flex-1">
        <input
          type="range"
          min={startHour}
          max={horizon}
          step={1}
          value={hour}
          onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }}
          aria-label="Replay time"
          className="mission-scrub"
          style={{ "--scrub": `${Math.max(0, Math.min(100, pct))}%` } as React.CSSProperties}
        />
        {/* acquisition tick */}
        {acqPct >= 0 && acqPct <= 100 && (
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-1 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${acqPct}%` }}
          >
            <span className="h-2 w-px bg-accent/70" />
          </span>
        )}
        {/* compare marker */}
        {compareHour != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-sand"
            style={{ left: `${((compareHour - startHour) / span) * 100}%` }}
          />
        )}
        <span className="sr-only">{Math.round(pct)}%</span>
      </div>

      <span className="shrink-0 leading-tight">
        <span className="tnum block tabular-nums text-text">
          {hour >= 0 ? "+" : ""}{Math.round(hour)} h
          <span className="mx-1.5 text-text-subtle">·</span>
          {at.toISOString().replace("T", " ").slice(0, 16)}Z
        </span>
        <span className="block text-[0.56rem] uppercase tracking-[0.14em] text-text-subtle">
          {stage}
        </span>
      </span>

      <button
        onClick={() => setCompareHour(compareHour == null ? hour : null)}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors",
          compareHour != null
            ? "border-sand/50 bg-sand/10 text-sand"
            : "border-border text-text-muted hover:border-accent/60 hover:text-accent",
        )}
      >
        <GitCompareArrows size={11} />
        {compareHour != null
          ? `Δ ${formatArea(Math.abs(areaNow - (areaCmp ?? 0)))} · ${Math.round(hour - compareHour)}h`
          : "Compare"}
      </button>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-sm text-text-muted transition-colors hover:text-text",
        className,
      )}
    >
      {children}
    </button>
  );
}
