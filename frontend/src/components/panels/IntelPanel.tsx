"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Landmark,
  Leaf,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyOperator, cleanupPriority, ecologicalSensitivity } from "@/lib/assess";
import { CleanupGauge } from "@/components/panels/intel";
import { ORG_TYPE_LABEL, useResponsiblePartyStore } from "@/store/responsibleParty";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useEnvironmentalStore } from "@/store/environmental";
import { useInvestigationStore } from "@/store/investigation";
import { useScenarioStore } from "@/store/scenario";
import { useUiStore } from "@/store/ui";
import type { VesselStaticInfo } from "@/types/api";

const RICH = new Set(["coral-reef", "mangrove", "seagrass", "marine-protected-area", "turtle-nesting"]);

/**
 * Persistent right-hand intelligence column — suspected vessels, the responsible
 * organisation and the environmental impact for the active scenario. Read-only
 * projection of stores the app already populates.
 */
export function IntelPanel() {
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const ranking = useInvestigationStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const impact = useEnvironmentalStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const rp = useResponsiblePartyStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const invId = SEED_INVESTIGATIONS.find((i) => i.scenarioId === activeId)?.id;
  const collapsed = useUiStore((s) => s.intelCollapsed);
  const toggleIntel = useUiStore((s) => s.toggleIntel);

  if (collapsed) {
    return (
      <aside className="panel flex h-full w-10 flex-col items-center gap-3 py-3">
        <button
          onClick={toggleIntel}
          aria-label="Expand intelligence panel"
          title="Expand intelligence panel"
          className="grid h-7 w-7 place-items-center rounded-[6px] text-text-subtle hover:text-text"
        >
          <PanelRightOpen size={15} />
        </button>
        <span
          className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-text-subtle"
          style={{ writingMode: "vertical-rl" }}
        >
          Intelligence
        </span>
      </aside>
    );
  }

  if (!ranking && !impact) {
    return (
      <aside className="panel flex h-full w-[21rem] flex-col overflow-hidden">
        <p className="p-4 text-[0.72rem] leading-relaxed text-text-subtle">
          Preparing the investigation. Vessel attribution, ownership and impact appear here
          as the pipeline completes.
        </p>
      </aside>
    );
  }

  const cards = ranking?.cards ?? [];
  const lead = cards[0];
  const owner = lead ? classifyOperator(lead.vessel) : null;

  const reached = impact ? impact.receptors.filter((r) => (r.likelihood ?? 0) > 0.15) : [];
  const has = (test: (kind: string) => boolean) => reached.some((r) => test(r.kind));
  const sens = impact ? ecologicalSensitivity(impact) : null;

  // marine-life exposure + a proxy for the coastal population in the drift path
  const HUMAN = new Set(["fishery", "coastline", "desalination-intake"]);
  const humanReceptors = reached.filter((r) => HUMAN.has(r.kind));
  const nearestHumanKm = humanReceptors.length
    ? Math.round(Math.min(...humanReceptors.map((r) => r.distance_km)))
    : null;
  const communityValue = humanReceptors.length
    ? `${humanReceptors.length} in path · ~${nearestHumanKm} km`
    : "None in drift path";
  const density = impact?.marine_biodiversity ?? sens?.label ?? "—";
  const lifeAtRisk =
    impact?.marine_life_affected_pct != null
      ? `~${Math.round(impact.marine_life_affected_pct)}% of local`
      : (sens?.label ?? "—");
  const prio =
    impact && sens
      ? cleanupPriority(impact.priority_score, {
          areaKm2: impact.affected_area_km2_estimate,
          sensitivity: sens.label,
          receptorCount: reached.length,
        })
      : null;
  const impactBand = prio && prio.score >= 75 ? "High" : prio && prio.score >= 45 ? "Elevated" : "Moderate";
  const urgency = prio && prio.score >= 75 ? "High" : prio && prio.score >= 45 ? "Elevated" : "Low";

  return (
    <aside className="panel relative flex h-full w-[21rem] flex-col overflow-hidden">
      <button
        onClick={toggleIntel}
        aria-label="Collapse intelligence panel"
        title="Collapse intelligence panel"
        className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-[5px] bg-[rgb(var(--surface-1)/0.7)] text-text-subtle backdrop-blur-[2px] hover:text-text"
      >
        <PanelRightClose size={13} />
      </button>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 pt-9">
        {/* ---- suspected vessels ---------------------------------------- */}
        {cards.length > 0 && (
          <section>
            <Header
              title="Suspected Vessels"
              action={invId ? { label: "View all", href: `/investigations/${invId}/vessels` } : undefined}
            />

            {lead && (
              <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-accent/25 bg-[linear-gradient(160deg,rgb(var(--surface-1)/0.5),rgb(var(--navy-950)/0.4))] p-2.5">
                <ShipThumb type={lead.vessel.vessel_type} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-[0.82rem] font-medium text-text">
                      {lead.vessel.name ?? `MMSI ${lead.vessel.mmsi}`}
                    </div>
                    <span className="shrink-0 rounded-full border border-coral-300/40 bg-[rgb(var(--coral-400)/0.14)] px-2 py-0.5 text-[0.54rem] font-semibold uppercase tracking-[0.06em] text-[rgb(var(--coral-300))]">
                      Confidence {Math.round(lead.suspicion_score * 100)}%
                    </span>
                  </div>
                  <div className="tnum mt-0.5 text-[0.62rem] capitalize text-text-subtle">
                    {lead.vessel.vessel_type}
                    {lead.vessel.imo ? `  ·  IMO ${lead.vessel.imo}` : ""}
                  </div>
                  {(lead.vessel.operator_company || lead.vessel.owner) && (
                    <div className="mt-1 flex items-center gap-1 text-[0.62rem] text-text-muted">
                      <Landmark size={9} className="shrink-0 text-accent/70" />
                      <span className="truncate">
                        {lead.vessel.operator_company ?? lead.vessel.owner}
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight size={13} className="shrink-0 text-text-subtle" />
              </div>
            )}

            <ol className="mt-2 space-y-1">
              {cards.slice(1, 6).map((c, i) => (
                <li
                  key={c.vessel.mmsi}
                  className="flex items-center gap-2.5 rounded-[9px] border border-border/45 px-2 py-2"
                >
                  <span className="tnum w-3 shrink-0 text-center text-[0.6rem] text-text-subtle">
                    {i + 2}
                  </span>
                  <ShipThumb type={c.vessel.vessel_type} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.72rem] text-text">
                      {c.vessel.name ?? `MMSI ${c.vessel.mmsi}`}
                    </span>
                    <span className="tnum block text-[0.56rem] capitalize text-text-subtle">
                      {c.vessel.vessel_type}
                      {c.vessel.imo ? ` · IMO ${c.vessel.imo}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "tnum shrink-0 text-[0.66rem] font-semibold",
                      c.suspicion_score >= 0.6
                        ? "text-success"
                        : c.suspicion_score >= 0.3
                          ? "text-warning"
                          : "text-[rgb(var(--coral-300))]",
                    )}
                  >
                    {Math.round(c.suspicion_score * 100)}%
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---- vessel ownership --------------------------------------- */}
        {(rp || owner) && (
          <section>
            <Header title="Vessel Ownership" icon={<Landmark size={13} className="text-accent" />} />
            <div className="mt-3 space-y-2.5 rounded-[12px] border border-border/60 bg-surface-2/40 p-3">
              <div className="flex items-center gap-2">
                <span className="truncate text-[0.82rem] font-medium text-text">
                  {rp?.organization ?? lead?.vessel.operator_company ?? lead?.vessel.owner ?? "Not on record"}
                </span>
                <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[0.5rem] font-medium uppercase tracking-[0.08em] text-text-muted">
                  {rp ? (ORG_TYPE_LABEL[rp.org_type] ?? "Operator") : (owner?.label ?? "Operator")}
                </span>
              </div>
              <Row label="Country" value={rp?.country ?? lead?.vessel.flag_state ?? "—"} />
              <Row
                label="Headquarters"
                value={rp?.country ? `${rp.country}` : (lead?.vessel.home_port ?? "—")}
              />
              <Link
                href="/responsible-party"
                className="inline-flex items-center gap-1 pt-0.5 text-[0.64rem] text-accent/90 hover:text-accent"
              >
                View company details <ArrowUpRight size={11} />
              </Link>
            </div>
          </section>
        )}

        {/* ---- environmental impact --------------------------------- */}
        {impact && sens && prio && (
          <section>
            <Header
              title="Environmental Impact"
              icon={<Leaf size={13} className="text-success" />}
              badge={impactBand}
              badgeTone={impactBand === "High" ? "danger" : impactBand === "Elevated" ? "warning" : "success"}
            />
            <div className="mt-3 flex items-start gap-3 rounded-[12px] border border-border/60 bg-surface-2/40 p-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Row label="Marine life density" value={density} valueTone />
                <Row label="Marine life at risk" value={lifeAtRisk} valueTone />
                <Row label="Coastal communities" value={communityValue} valueTone />
                <Row label="Coral reefs nearby" value={has((k) => k.includes("coral")) ? "Yes" : "No"} valueTone />
                <Row
                  label="Fisheries area"
                  value={has((k) => k.includes("fish") || k.includes("seagrass")) ? "High" : "Low"}
                  valueTone
                />
                <Row
                  label="Protected area (MPA)"
                  value={has((k) => k.includes("protected") || RICH.has(k)) ? "Yes" : "No"}
                  valueTone
                />
              </div>
              <div className="shrink-0 text-center">
                <div className="text-[0.5rem] uppercase tracking-[0.1em] text-text-subtle">
                  Cleanup Urgency
                </div>
                <div className="mt-1">
                  <CleanupGauge score={prio.score} label="" tone={prio.tone} centerText={urgency} />
                </div>
                <div className="mt-1 text-[0.52rem] leading-snug text-text-subtle">
                  Action required
                  <br />
                  within 24 to 48 hours
                </div>
              </div>
            </div>
            {impact.marine_life_note && (
              <p className="mt-2 text-[0.56rem] leading-snug text-text-subtle">
                {impact.marine_life_note}
              </p>
            )}
          </section>
        )}
      </div>

      {invId && (
        <div className="border-t border-border/60 p-3">
          <Link
            href={`/investigations/${invId}/report`}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[rgb(var(--amber-300)/0.5)] bg-[rgb(var(--amber-300)/0.16)] px-4 py-2.5 text-[0.78rem] font-semibold text-[rgb(var(--amber-300))] transition-colors hover:bg-[rgb(var(--amber-300)/0.24)]"
          >
            <FileText size={14} />
            Generate Report
          </Link>
        </div>
      )}
    </aside>
  );
}

function ShipThumb({ type, size }: { type: VesselStaticInfo["vessel_type"]; size: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-11 w-14" : "h-8 w-11";
  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[8px] border border-border/60",
        dim,
      )}
      style={{ background: "linear-gradient(150deg,#123c52,#0b2234 60%,#0f343e)" }}
    >
      <svg viewBox="0 0 48 32" className="absolute inset-0 h-full w-full text-[rgb(var(--sand-200))]" aria-hidden>
        <path
          d="M6 20 H40 L36 25 H10 Z M12 20 V13 H30 L34 20 M16 13 V9 H24 V13"
          fill="currentColor"
          fillOpacity="0.85"
        />
        <path d="M4 26 H44" stroke="rgb(var(--accent))" strokeOpacity="0.35" strokeWidth="1.4" />
        <title>{type}</title>
      </svg>
    </span>
  );
}

function Header({
  title,
  action,
  badge,
  badgeTone = "success",
  icon,
}: {
  title: string;
  action?: { label: string; href: string };
  badge?: string;
  badgeTone?: "success" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[0.7rem] font-semibold text-text">
        {icon ?? <span className="h-px w-4 bg-accent/50" />}
        {title}
      </h3>
      <div className="flex items-center gap-2">
        {badge && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.54rem] font-semibold uppercase tracking-[0.08em]",
              badgeTone === "danger"
                ? "bg-danger/15 text-danger"
                : badgeTone === "warning"
                  ? "bg-warning/15 text-warning"
                  : "bg-success/15 text-success",
            )}
          >
            {badge}
          </span>
        )}
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-0.5 text-[0.6rem] text-accent/90 hover:text-accent"
          >
            {action.label} <ArrowUpRight size={10} />
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, valueTone }: { label: string; value: string; valueTone?: boolean }) {
  const tone = valueTone
    ? /high|critical|yes|dense/i.test(value)
      ? "text-[rgb(var(--amber-300))]"
      : /moderate|elevated/i.test(value)
        ? "text-warning"
        : "text-success"
    : "text-text";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[0.6rem] text-text-subtle">{label}</span>
      <span className={cn("text-[0.66rem] font-medium", tone)}>{value}</span>
    </div>
  );
}
