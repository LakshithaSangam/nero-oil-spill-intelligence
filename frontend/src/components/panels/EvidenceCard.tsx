"use client";

import { useState } from "react";
import { ChevronDown, Crosshair, Landmark, Minus, Ship, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { aoiTransit, classifyOperator } from "@/lib/assess";
import { FleetRiskChip } from "@/components/panels/FleetRiskChip";
import { useScenarioStore } from "@/store/scenario";
import type { EvidenceCard as EvidenceCardT, EvidenceKind } from "@/types/api";

const OWNER_TONE = {
  danger: "border-danger/40 text-danger",
  warning: "border-warning/40 text-warning",
  success: "border-success/40 text-success",
  outline: "border-border text-text-muted",
} as const;

const KIND_LABEL: Record<EvidenceKind, string> = {
  proximity: "Proximity",
  ais_gap: "AIS gap",
  drift_alignment: "Drift alignment",
  speed_anomaly: "Speed anomaly",
  course_deviation: "Course deviation",
  cargo_match: "Cargo",
  time_correlation: "Time correlation",
  route_deviation: "Route deviation",
  behavioural_anomaly: "Behaviour",
  prior_history: "Prior history",
};

function scoreBar(s: number) {
  return s >= 0.75 ? "bg-danger" : s >= 0.45 ? "bg-warning" : "bg-text-subtle";
}

// factor kind -> the ranking dimension it speaks to (matches the criteria the
// investigation scores on: distance, time overlap, route, category, history)
const FACTOR_REASON: Partial<Record<EvidenceKind, string>> = {
  proximity: "distance from the spill origin",
  time_correlation: "time overlap with the release window",
  ais_gap: "an AIS gap across the release window",
  route_deviation: "an off-route detour",
  course_deviation: "a course change at the origin",
  drift_alignment: "heading aligned with the slick drift",
  speed_anomaly: "slowing / loitering near the origin",
  cargo_match: "its declared cargo",
  prior_history: "its prior pollution history",
  behavioural_anomaly: "its movement pattern",
};

function whyRanked(card: EvidenceCardT): string {
  const inc = card.factors.filter((f) => f.polarity === "incriminating");
  const mit = card.factors.filter((f) => f.polarity === "mitigating");
  const reasons = [...new Set(inc.map((f) => FACTOR_REASON[f.kind] ?? f.kind.replace(/_/g, " ")))].slice(0, 4);
  const verb = card.rank === 1 ? "leads the ranking" : `sits at #${card.rank}`;
  if (!reasons.length) {
    return `${card.vessel.name ?? "This vessel"} ${verb} on proximity and timing alone. No other anomaly stands out.`;
  }
  let s = `${card.vessel.name ?? "This vessel"} ${verb} on ${reasons.slice(0, -1).join(", ")}${
    reasons.length > 1 ? " and " : ""
  }${reasons[reasons.length - 1]}.`;
  if (mit.length) s += ` Weighed against: ${mit[0]!.summary.toLowerCase()}.`;
  return s;
}

export function EvidenceCard({
  card,
  focused,
  onFocus,
}: {
  card: EvidenceCardT;
  focused: boolean;
  onFocus: () => void;
}) {
  const [open, setOpen] = useState(card.rank === 1);
  const [showVessel, setShowVessel] = useState(false);
  const v = card.vessel;
  const pct = Math.round(card.suspicion_score * 100);
  const inc = card.factors.filter((f) => f.polarity === "incriminating");
  const mit = card.factors.filter((f) => f.polarity === "mitigating");

  const owner = classifyOperator(v);
  const aoi = useScenarioStore((s) => s.active()?.aoi);
  const trackLine = (card.track.features as unknown as GeoJSON.Feature[]).find(
    (f) => f.geometry?.type === "LineString",
  );
  const transit = aoi
    ? aoiTransit(
        (trackLine?.geometry as GeoJSON.LineString | undefined)?.coordinates,
        (trackLine?.properties as { times?: string[] } | undefined)?.times,
        aoi,
      )
    : { entered: null, exited: null, dwellHours: null };

  return (
    <div
      className={cn(
        "rounded-sm border transition-colors",
        focused ? "border-accent/50 bg-accent/[0.04]" : "border-border",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "tnum grid h-8 w-8 shrink-0 place-items-center rounded-full text-[16px] font-bold leading-none",
            card.rank <= 3
              ? "bg-accent/20 text-accent ring-1 ring-accent/30"
              : "bg-surface-3 text-text-muted",
          )}
        >
          {card.rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Ship size={12} className="shrink-0 text-text-subtle" />
            <span className="truncate text-[13px] font-semibold text-text">
              {v.name ?? `MMSI ${v.mmsi}`}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="font-medium capitalize text-text-muted">{v.vessel_type}</span>
            <span className="tnum rounded-[3px] bg-surface-3 px-1.5 py-px text-[10px] font-semibold tracking-wide text-text-subtle">
              {v.flag_state ?? "n/a"}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "tnum text-[15px] font-bold",
            card.suspicion_score >= 0.75
              ? "text-danger"
              : card.suspicion_score >= 0.45
                ? "text-warning"
                : "text-text",
          )}
        >
          {pct}%
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-text-subtle transition-transform", open ? "" : "-rotate-90")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", scoreBar(card.suspicion_score))} style={{ width: `${pct}%` }} />
          </div>

          {/* confidence + plain-language reason for the rank */}
          <div className="rounded-sm border border-border bg-surface-2/50 px-2.5 py-2">
            <div className="flex items-baseline justify-between text-[10px]">
              <span className="uppercase tracking-wide text-text-subtle">
                Why this ranks #{card.rank}
              </span>
              <span className="tnum text-text-muted">
                {Math.round(card.confidence.score * 100)}% confidence
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-text-muted">
              {whyRanked(card)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-text-subtle">
              Suspicion this case
            </span>
            <FleetRiskChip mmsi={v.mmsi} />
          </div>

          {/* operator ownership class */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                OWNER_TONE[owner.tone as keyof typeof OWNER_TONE] ?? OWNER_TONE.outline,
              )}
            >
              <Landmark size={10} /> {owner.label}
            </span>
            <span className="truncate text-[10px] text-text-subtle">{owner.basis}</span>
          </div>

          <div className="tnum flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {card.closest_approach_km != null && (
              <span>closest {card.closest_approach_km.toFixed(1)} km</span>
            )}
            {card.closest_approach_at && (
              <span>at {card.closest_approach_at.slice(11, 16)}Z</span>
            )}
            {transit.entered && (
              <span>
                in {transit.entered.slice(11, 16)}Z
                {transit.exited && ` · out ${transit.exited.slice(11, 16)}Z`}
                {transit.dwellHours != null && ` (${transit.dwellHours.toFixed(1)} h in area)`}
              </span>
            )}
            <span>conf {Math.round(card.confidence.score * 100)}%</span>
          </div>

          <p className="text-[11px] italic leading-relaxed text-text-muted">{card.narrative}</p>

          {inc.length > 0 && (
            <FactorGroup
              title="Incriminating"
              icon={<TriangleAlert size={11} className="text-danger" />}
              factors={inc}
              barClass="bg-danger/70"
            />
          )}
          {mit.length > 0 && (
            <FactorGroup
              title="Mitigating"
              icon={<Minus size={11} className="text-success" />}
              factors={mit}
              barClass="bg-success/60"
            />
          )}

          <div>
            <button
              onClick={() => setShowVessel((s) => !s)}
              className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
            >
              Vessel &amp; company
              <ChevronDown size={12} className={cn("transition-transform", showVessel ? "" : "-rotate-90")} />
            </button>
            {showVessel && (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <Row k="IMO" val={v.imo} />
                <Row k="Owner" val={v.owner} />
                <Row k="Operator" val={v.operator_company} />
                <Row k="Home port" val={v.home_port} />
                <Row k="Cargo" val={v.cargo_declared} />
                <Row k="Dimensions" val={v.length_m ? `${v.length_m} × ${v.beam_m ?? "?"} m` : null} />
                <Row
                  k="Prior violations"
                  val={v.prior_violations != null ? String(v.prior_violations) : null}
                  warn={(v.prior_violations ?? 0) > 0}
                />
              </dl>
            )}
          </div>

          <button
            onClick={onFocus}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-sm border py-1.5 text-[11px] font-medium transition-colors",
              focused
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border text-text-muted hover:border-border-strong",
            )}
          >
            <Crosshair size={12} /> {focused ? "Focused on map" : "Focus on map"}
          </button>
        </div>
      )}
    </div>
  );
}

function FactorGroup({
  title,
  icon,
  factors,
  barClass,
}: {
  title: string;
  icon: React.ReactNode;
  factors: EvidenceCardT["factors"];
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
        {icon} {title}
      </div>
      <ul className="mt-1.5 space-y-2">
        {factors.map((f, i) => (
          <li key={`${f.kind}-${i}`}>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-text">{KIND_LABEL[f.kind]}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className={cn("block h-full rounded-full", barClass)} style={{ width: `${Math.round(f.weight * 100)}%` }} />
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{f.summary}</p>
            {f.detail && <p className="mt-0.5 text-[10px] leading-snug text-text-subtle">{f.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, val, warn }: { k: string; val?: string | number | null; warn?: boolean }) {
  return (
    <>
      <dt className="text-text-subtle">{k}</dt>
      <dd className={cn("tnum truncate", warn ? "text-danger" : "text-text")}>{val ?? "n/a"}</dd>
    </>
  );
}
