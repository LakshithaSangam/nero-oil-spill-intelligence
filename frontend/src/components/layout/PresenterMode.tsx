"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, SkipForward, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import { useUiStore } from "@/store/ui";
import { useScenarioStore } from "@/store/scenario";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useInvestigationStore } from "@/store/investigation";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useTimelineStore } from "@/store/timeline";

type Stage = {
  key: string;
  n: string;
  title: string;
  /** filled per-run from the live stores */
  sub: () => string;
  /** toggle layers / move the camera / drive the timeline */
  enter: () => void;
  dwellMs: number;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Presenter Mode — a hands-free cinematic brief. One key (`P`) and the app
 * drives itself through a full investigation on the live map: observe → detect →
 * reconstruct → investigate → project → report, narrating each step.
 *
 * It only *reads* the module stores and *toggles layer visibility / moves the
 * camera / drives the drift timeline* — it never mutates detection, ocean or
 * attribution data, so it cannot affect any workspace tab. Layer visibility is
 * snapshotted on start and restored on exit.
 */
export function PresenterMode() {
  const on = useUiStore((s) => s.presenterOn);
  const setPresenter = useUiStore((s) => s.setPresenter);
  const router = useRouter();

  const activeId = useScenarioStore((s) => s.activeId);
  const scenario = useScenarioStore((s) => s.active());
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const oceanEntry = useOceanStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const ranking = useInvestigationStore((s) => (detection ? s.byDetection[detection.id] : undefined));

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const snapshot = useRef<Record<string, boolean> | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hindcast = oceanEntry?.hindcast;
  const forecast = oceanEntry?.forecast;
  const ready = Boolean(detection && forecast && ranking && scenario);

  const invId = useMemo(
    () => SEED_INVESTIGATIONS.find((i) => i.scenarioId === activeId)?.id ?? null,
    [activeId],
  );

  // ---- the script -------------------------------------------------------
  const stages = useMemo<Stage[]>(() => {
    const fly = useMapStore.getState().flyTo;
    const show = (...ids: string[]) => {
      const st = useLayersStore.getState();
      st.markLive(ids);
      ids.forEach((id) => st.setVisible(id, true));
    };
    const b = scenario?.aoi;
    const centroid = detection?.geometry.centroid;
    const origin = hindcast?.origin.point;
    const top = ranking?.cards[0];
    const gapFactor = top?.factors.find((f) => f.kind === "ais_gap");
    const areaByHour = forecast?.expected_area_km2_by_hour ?? {};
    const area72 =
      areaByHour["72"] ?? areaByHour["71"] ?? Object.values(areaByHour).slice(-1)[0];
    const landfall = forecast?.affected_coasts?.find((c) => c.eta);

    return [
      {
        key: "observe",
        n: "01",
        title: "Observe",
        sub: () =>
          scenario
            ? `${scenario.name} — latest Sentinel-1 pass over a ${b ? Math.round((b.east - b.west) * 106) : "—"} km AOI`
            : "Pulling the radar scene…",
        enter: () => {
          show("aoi", "sar-quicklook");
          if (b) fly({ center: [(b.west + b.east) / 2, (b.south + b.north) / 2], zoom: 8.4 });
        },
        dwellMs: 6000,
      },
      {
        key: "detect",
        n: "02",
        title: "Detect",
        sub: () =>
          detection
            ? `${detection.geometry.area_km2.toFixed(1)} km² · ${detection.geometry.fragment_count} fragment(s) · ${detection.characterisation.oil_type}`
            : "Segmenting the slick…",
        enter: () => {
          show("spill", "spill-edge");
          if (centroid) fly({ center: centroid, zoom: 10.4 });
        },
        dwellMs: 6000,
      },
      {
        key: "reconstruct",
        n: "03",
        title: "Reconstruct",
        sub: () =>
          hindcast
            ? `Origin ${origin!.lat.toFixed(3)}, ${origin!.lon.toFixed(3)} · released ${fmtRange(hindcast.origin.release_window)} · ${Math.round(hindcast.origin.confidence.score * 100)}% conf`
            : "Backtracking the drift…",
        enter: () => {
          show("hindcast", "origin");
          if (origin) fly({ center: [origin.lon, origin.lat], zoom: 10 });
        },
        dwellMs: 6500,
      },
      {
        key: "investigate",
        n: "04",
        title: "Investigate",
        sub: () =>
          top
            ? `#1 ${top.vessel.name ?? top.vessel.mmsi} · ${Math.round(top.suspicion_score * 100)}%` +
              (gapFactor ? ` · AIS-dark ${Math.round(Number(gapFactor.value))} min` : "")
            : "Scoring nearby vessels…",
        enter: () => {
          show("ais", "suspects");
          if (top) useInvestigationStore.getState().setFocus(top.vessel.mmsi);
          if (origin) fly({ center: [origin.lon, origin.lat], zoom: 9.4 });
        },
        dwellMs: 7000,
      },
      {
        key: "project",
        n: "05",
        title: "Project",
        sub: () =>
          forecast
            ? `72 h drift · ~${area72 ? Math.round(area72) : "—"} km² expected` +
              (landfall ? ` · landfall ~${new Date(landfall.eta!).toISOString().slice(5, 16).replace("T", " ")}Z` : " · no landfall in 72 h")
            : "Running the ensemble…",
        enter: () => {
          show("forecast");
          const tl = useTimelineStore.getState();
          tl.setMode("forecast");
          tl.setHour(0);
          if (b) fly({ center: [(b.west + b.east) / 2, (b.south + b.north) / 2], zoom: 8.2 });
          setTimeout(() => useTimelineStore.getState().setPlaying(true), 700);
        },
        dwellMs: 9500,
      },
      {
        key: "report",
        n: "06",
        title: "Report",
        sub: () => "Detection, origin, attribution and forecast — assembled into one brief.",
        enter: () => {
          useTimelineStore.getState().setPlaying(false);
        },
        dwellMs: 7000,
      },
    ];
  }, [scenario, detection, hindcast, forecast, ranking]);

  const exit = useCallback(
    (opts?: { toReport?: boolean }) => {
      if (tickRef.current) clearTimeout(tickRef.current);
      useTimelineStore.getState().setPlaying(false);
      useTimelineStore.getState().setHour(0);
      // restore the layer visibility the user had before the brief
      const snap = snapshot.current;
      if (snap) {
        const st = useLayersStore.getState();
        Object.entries(snap).forEach(([id, vis]) => st.setVisible(id, vis));
      }
      snapshot.current = null;
      setIdx(0);
      setPaused(false);
      setPresenter(false);
      if (opts?.toReport && invId) router.push(`/investigations/${invId}/report`);
    },
    [invId, router, setPresenter],
  );

  // snapshot layers + reset when the brief opens
  useEffect(() => {
    if (!on) return;
    snapshot.current = Object.fromEntries(
      useLayersStore.getState().layers.map((l) => [l.id, l.visible]),
    );
    setIdx(0);
    setPaused(false);
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
    };
  }, [on]);

  // run the current stage + schedule the next
  useEffect(() => {
    if (!on || !ready || paused) return;
    const stage = stages[idx];
    if (!stage) return;
    stage.enter();
    if (tickRef.current) clearTimeout(tickRef.current);
    tickRef.current = setTimeout(() => {
      if (idx >= stages.length - 1) exit({ toReport: true });
      else setIdx((v) => v + 1);
    }, stage.dwellMs);
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
    };
  }, [on, ready, paused, idx, stages, exit]);

  // keyboard
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === "ArrowRight") setIdx((v) => clamp(v + 1, 0, stages.length - 1));
      if (e.key === "ArrowLeft") setIdx((v) => clamp(v - 1, 0, stages.length - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, stages.length, exit]);

  if (!on) return null;

  const stage = stages[idx]!;

  return (
    <div className="pointer-events-none fixed inset-0 z-[850] flex flex-col justify-between">
      {/* top rail */}
      <div className="pointer-events-auto flex items-center justify-between gap-4 bg-[linear-gradient(180deg,rgb(var(--navy-950)/0.82),transparent)] px-5 py-3">
        <span className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-accent">
          <span className="grid h-4 w-4 place-items-center rounded-full border border-accent/50">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Presenter mode
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/70 bg-[rgb(var(--navy-950)/0.6)] px-2.5 py-1.5 text-[0.72rem] text-text-muted transition-colors hover:text-text"
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() =>
              idx >= stages.length - 1 ? exit({ toReport: true }) : setIdx((v) => v + 1)
            }
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/70 bg-[rgb(var(--navy-950)/0.6)] px-2.5 py-1.5 text-[0.72rem] text-text-muted transition-colors hover:text-text"
          >
            <SkipForward size={12} /> Skip
          </button>
          <button
            onClick={() => exit()}
            aria-label="Exit presenter mode"
            className="grid h-7 w-7 place-items-center rounded-[6px] border border-border/70 bg-[rgb(var(--navy-950)/0.6)] text-text-subtle transition-colors hover:text-text"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* caption card */}
      <div className="pointer-events-auto mx-auto mb-[92px] w-[min(38rem,92vw)] rounded-[12px] border border-border/70 bg-[rgb(var(--navy-950)/0.9)] px-6 py-5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.6)] backdrop-blur-[6px]">
        {!ready ? (
          <p className="text-[0.86rem] text-text-muted">
            Priming the pipeline for <span className="text-text">{scenario?.name ?? "this scenario"}</span> —
            the brief starts as soon as detection, drift and attribution are in.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="metric text-[0.8rem] text-accent">{stage.n}</span>
              <h3 className="font-serif text-[1.15rem] text-text">{stage.title}</h3>
            </div>
            <p className="mt-1.5 min-h-[2.4rem] text-[0.85rem] leading-relaxed text-text-muted">
              {stage.sub()}
            </p>
            <div className="mt-3 flex gap-1.5">
              {stages.map((s, i) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === idx ? "w-6 bg-accent" : i < idx ? "w-3 bg-accent/40" : "w-3 bg-border-strong",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function fmtRange(r: { start: string; end: string }): string {
  const s = new Date(r.start);
  const e = new Date(r.end);
  const d = (x: Date) => x.toISOString().slice(5, 16).replace("T", " ");
  return `${d(s)}–${e.toISOString().slice(11, 16)}Z`;
}
