"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Droplets,
  RefreshCw,
  Ship,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useRiskStore } from "@/store/risk";
import { useDossierStore } from "@/store/dossier";
import { useEnvironmentalStore } from "@/store/environmental";
import type {
  EnvironmentalImpact,
  RiskTier,
  VesselRiskProfile,
  VesselRiskScore,
} from "@/types/api";

const HUMAN_RECEPTOR = new Set(["fishery", "coastline", "desalination-intake"]);
const DENSITY_RANK: Record<string, number> = { Dense: 3, Moderate: 2, Sparse: 1 };

const TIER_TONE: Record<RiskTier, "outline" | "warning" | "danger"> = {
  low: "outline",
  elevated: "warning",
  high: "danger",
  critical: "danger",
};
const TIER_BAR: Record<RiskTier, string> = {
  low: "bg-text-subtle",
  elevated: "bg-warning",
  high: "bg-danger",
  critical: "bg-danger",
};

export default function VesselsPage() {
  const { index, loading, error, loadIndex } = useRiskStore();

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  return (
    <div>
      <PanelHeader
        eyebrow="Fleet"
        title="Pollution Risk Index"
        subtitle="Every known vessel, ranked by a live pollution risk score built from prior spills, recurring micro leaks, investigation exposure, cargo and routing."
        actions={
          <button
            onClick={() => loadIndex(true)}
            aria-label="Recompute"
            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-text-subtle hover:text-text"
          >
            <RefreshCw size={13} />
          </button>
        }
      />

      <div className="p-3">
        {error ? (
          <p className="text-xs text-text-muted">Backend offline. Start it to load the index.</p>
        ) : !index ? (
          <p className="flex items-center gap-2 text-xs text-text-subtle">
            <Spinner /> computing risk scores…
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              <span>Rank · Vessel</span>
              <span>Risk</span>
            </div>
            {index.vessels.map((v, i) => (
              <RiskRow key={v.mmsi} score={v} rank={i + 1} />
            ))}
            <p className="tnum pt-1 text-center text-[10px] text-text-subtle">
              updated {new Date(index.generated_at).toISOString().slice(11, 19)}Z
              {loading ? " · recomputing…" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RiskRow({ score, rank }: { score: VesselRiskScore; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  const loadProfile = useRiskStore((s) => s.loadProfile);
  const profile = useRiskStore((s) => s.profiles[score.mmsi]);
  const pct = Math.round(score.risk_score * 100);

  useEffect(() => {
    if (open) void loadProfile(score.mmsi);
  }, [open, score.mmsi, loadProfile]);

  return (
    <div
      className={cn(
        "rounded-sm border transition-colors",
        score.tier === "critical" ? "border-danger/40" : "border-border",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "tnum grid h-8 w-8 shrink-0 place-items-center rounded-full text-[16px] font-bold leading-none",
            rank <= 3
              ? "bg-accent/20 text-accent ring-1 ring-accent/30"
              : "bg-surface-3 text-text-muted",
          )}
        >
          {rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Ship size={12} className="shrink-0 text-text-subtle" />
            <span className="truncate text-[13px] font-semibold text-text">
              {score.name ?? `MMSI ${score.mmsi}`}
            </span>
            {score.recurring_pollution && (
              <TriangleAlert size={11} className="shrink-0 text-danger" />
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="font-medium capitalize text-text-muted">{score.vessel_type}</span>
            <span className="tnum rounded-[3px] bg-surface-3 px-1.5 py-px text-[10px] font-semibold tracking-wide text-text-subtle">
              {score.flag_state ?? "n/a"}
            </span>
          </span>
        </span>
        <span className="tnum text-[15px] font-bold text-text">{pct}%</span>
        <Badge tone={TIER_TONE[score.tier]}>{score.tier}</Badge>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-text-subtle transition-transform", open ? "" : "-rotate-90")}
        />
      </button>

      {open && (
        <div className="space-y-3.5 border-t border-border px-3 py-3">
          {/* overall score */}
          <div>
            <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wide text-text-subtle">
              <span>Overall pollution risk</span>
              <span className="tnum text-text-muted">{pct}% · {score.tier}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", TIER_BAR[score.tier])} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* micro-leak vs major-spill split */}
          <LeakSplit
            micro={score.micro_leak_share}
            major={score.major_leak_share}
            note={score.leak_split_note}
          />

          {/* what the AI is seeing */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              What the pattern shows
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{score.headline}</p>
          </div>

          {/* at-a-glance facts, one per line instead of chip soup */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-text-subtle">Repeating pattern</dt>
            <dd className={score.recurring_pollution ? "text-danger" : "text-text"}>
              {score.recurring_pollution ? "Yes, recurring small leaks" : "Not established"}
            </dd>
            <dt className="text-text-subtle">Small leaks on record</dt>
            <dd className="tnum text-text">{score.micro_leak_count}</dd>
            <dt className="text-text-subtle">Past pollution violations</dt>
            <dd className={cn("tnum", score.prior_violations > 0 ? "text-danger" : "text-text")}>
              {score.prior_violations}
            </dd>
          </dl>

          <EcologicalExposure mmsi={score.mmsi} open={open} />

          {profile ? <ProfileDetail profile={profile} /> : (
            <p className="flex items-center gap-1.5 text-[11px] text-text-subtle">
              <Spinner /> loading factors…
            </p>
          )}
          <Dossier mmsi={score.mmsi} open={open} />
        </div>
      )}
    </div>
  );
}

/**
 * Marine-life / community exposure for a vessel, derived from the environmental
 * impact of the spill(s) it has been linked to. Read-only: reads whatever the
 * environmental store already holds and fills gaps with a one-off GET. No
 * location-specific spill → nothing to score.
 */
function EcologicalExposure({ mmsi, open }: { mmsi: string; open: boolean }) {
  const appearances = useDossierStore((s) => s.byMmsi[mmsi]?.appearances);
  const loaded = useEnvironmentalStore((s) => s.byDetection);
  const [extra, setExtra] = useState<Record<string, EnvironmentalImpact>>({});

  useEffect(() => {
    if (!open || !appearances?.length) return;
    for (const a of appearances) {
      if (loaded[a.detection_id] || extra[a.detection_id]) continue;
      api<EnvironmentalImpact>(`/environment/${a.detection_id}`)
        .then((imp) => setExtra((e) => ({ ...e, [a.detection_id]: imp })))
        .catch(() => {
          /* not assessed yet — the "—" state below is correct */
        });
    }
  }, [open, appearances, loaded, extra]);

  if (appearances && appearances.length === 0) {
    return (
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Marine life &amp; community exposure
        </h4>
        <p className="mt-1 text-[11px] leading-snug text-text-muted">
          Assessed per spill. This vessel has no linked investigation, so there is no
          affected area to score.
        </p>
      </div>
    );
  }

  const impacts = (appearances ?? [])
    .map((a) => loaded[a.detection_id] ?? extra[a.detection_id])
    .filter((x): x is EnvironmentalImpact => Boolean(x));

  let density = "—";
  let atRiskPct = 0;
  let community = 0;
  for (const imp of impacts) {
    const d = imp.marine_biodiversity ?? "";
    if ((DENSITY_RANK[d] ?? 0) > (DENSITY_RANK[density] ?? 0)) density = d;
    atRiskPct = Math.max(atRiskPct, imp.marine_life_affected_pct ?? 0);
    community += imp.receptors.filter(
      (r) => HUMAN_RECEPTOR.has(r.kind) && (r.likelihood ?? 0) > 0.15,
    ).length;
  }

  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
        Marine life &amp; community exposure
      </h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-text-subtle">Marine life density</dt>
        <dd className={cn(density === "Dense" ? "text-warning" : "text-text")}>{density}</dd>
        <dt className="text-text-subtle">Local marine life at risk</dt>
        <dd className="tnum text-text">{atRiskPct ? `~${Math.round(atRiskPct)}%` : "—"}</dd>
        <dt className="text-text-subtle">Coastal communities in path</dt>
        <dd className="tnum text-text">{impacts.length ? community || "None" : "—"}</dd>
      </dl>
      <p className="mt-1 text-[10px] leading-snug text-text-subtle">
        {impacts.length
          ? `From the spill${impacts.length > 1 ? "s" : ""} this vessel is linked to.`
          : "Awaiting the environmental assessment for this vessel's linked spill."}
      </p>
    </div>
  );
}

function Dossier({ mmsi, open }: { mmsi: string; open: boolean }) {
  const loadFor = useDossierStore((s) => s.loadFor);
  const dossier = useDossierStore((s) => s.byMmsi[mmsi]);

  useEffect(() => {
    if (open) void loadFor(mmsi);
  }, [open, mmsi, loadFor]);

  if (!dossier) return null;
  const v = dossier.vessel;

  return (
    <>
      <div className="border-t border-border pt-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Vessel &amp; company
        </h4>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          {[
            ["IMO", v.imo],
            ["Owner", v.owner],
            ["Operator", v.operator_company],
            ["Home port", v.home_port],
            ["Cargo", v.cargo_declared],
            ["Length", v.length_m ? `${v.length_m} m` : null],
          ].map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-text-subtle">{k}</dt>
              <dd className="tnum truncate text-text">{val ?? "n/a"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {dossier.appearances.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            Investigation appearances
          </h4>
          <ul className="mt-1 space-y-1.5">
            {dossier.appearances.map((a) => (
              <li key={a.detection_id} className="rounded-sm border border-border px-2.5 py-1.5 text-[11px]">
                <div className="tnum flex items-center justify-between">
                  <span className="truncate text-text-subtle">{a.detection_id}</span>
                  <span className="text-text">
                    #{a.rank} · {Math.round(a.suspicion_score * 100)}%
                  </span>
                </div>
                <p className="mt-0.5 leading-snug text-text-muted">{a.narrative}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-sm border border-border bg-surface-2/50 px-3 py-2 text-[11px] leading-relaxed">
        <span className="text-text-muted">{dossier.behaviour_summary}</span>
        <p className="mt-1.5 text-text">
          {dossier.assessment.split("**").map((p, i) =>
            i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>,
          )}
        </p>
      </div>
    </>
  );
}

function LeakSplit({ micro, major, note }: { micro: number; major: number; note: string }) {
  const microPct = Math.round(micro * 100);
  const majorPct = 100 - microPct;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
        Micro leak vs major spill
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
        <div className="bg-warning/70" style={{ width: `${microPct}%` }} />
        <div className="bg-danger" style={{ width: `${majorPct}%` }} />
      </div>
      <div className="tnum mt-1 flex justify-between text-[10px] text-text-subtle">
        <span>{microPct}% small recurring leaks</span>
        <span>{majorPct}% major spill risk</span>
      </div>
      {note && <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">{note}</p>}
    </div>
  );
}

function ProfileDetail({ profile }: { profile: VesselRiskProfile }) {
  return (
    <>
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Why the score is this high
        </h4>
        <ul className="mt-1.5 space-y-2">
          {profile.factors.map((f, i) => (
            <li key={`${f.key}-${i}`}>
              <div className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-[11px] text-text">{f.label}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      f.direction === "raises" ? "bg-danger/70" : "bg-success/60",
                    )}
                    style={{ width: `${Math.round(f.weight * 100)}%` }}
                  />
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{f.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      {profile.micro_leaks.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            <Droplets size={11} /> Small leak history
          </h4>
          <ul className="mt-1.5 space-y-1">
            {profile.micro_leaks.map((m, i) => (
              <li key={i} className="tnum flex items-baseline gap-2 text-[11px] text-text-muted">
                <span className="shrink-0 text-text-subtle">{m.date.slice(0, 10)}</span>
                <span>
                  {m.area_km2 != null ? `${m.area_km2} km²` : "n/a"} ·{" "}
                  {Math.round(m.confidence * 100)}% conf
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.linked_event_notes.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            Record
          </h4>
          <ul className="mt-1 space-y-0.5 text-[11px] text-text-subtle">
            {profile.linked_event_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
