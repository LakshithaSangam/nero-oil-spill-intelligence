"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  Droplets,
  MapPin,
  Search,
  Ship,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { InvestigationSnapshot } from "@/components/panels/InvestigationSnapshot";
import { ResponsiblePartySnapshot } from "@/components/panels/ResponsiblePartySnapshot";
import { Badge } from "@/components/ui/Badge";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";
import { useDetectionStore } from "@/store/detection";
import { useInvestigationStore } from "@/store/investigation";
import { useUiStore } from "@/store/ui";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import type { Incident } from "@/types/api";

const SEV_TONE = {
  minor: "outline",
  moderate: "warning",
  major: "danger",
  catastrophic: "danger",
  unknown: "neutral",
} as const;

const THUMBS = [
  "linear-gradient(135deg,#123c52,#0b2234 55%,#164b5c)",
  "linear-gradient(135deg,#1a545c,#0b2234 60%,#0f343e)",
  "linear-gradient(135deg,#0f343e,#123c52 50%,#0b2234)",
];

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const flyTo = useMapStore((s) => s.flyTo);
  const { scenarios, activeId, setActive } = useScenarioStore();
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const ranking = useInvestigationStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const sampleDataVisible = useUiStore((s) => s.sampleDataVisible);
  const sampleInvestigations = sampleDataVisible ? SEED_INVESTIGATIONS : [];

  useEffect(() => {
    api<Incident[]>("/incidents")
      .then(setIncidents)
      .catch(() => setIncidents([]));
  }, []);

  const alert = incidents?.[0];

  return (
    <div>
      <PanelHeader
        eyebrow="Live Monitoring"
        title="Marine Observation"
        subtitle="Satellite data, AIS tracking and environmental models working together to detect and analyse oil spills."
        actions={<SatelliteMark />}
      />

      <div className="card-cascade space-y-6 p-5">
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Module
            icon={<Droplets size={14} />}
            value={incidents ? String(incidents.length) : "—"}
            label={["Oil spill", "detected"]}
          />
          <Module
            icon={<Ship size={14} />}
            value={ranking ? String(ranking.cards.length) : "—"}
            label={["Vessels", "in area"]}
          />
          <Module
            icon={<Search size={14} />}
            value={String(sampleInvestigations.length)}
            label={["Investigations", "ongoing"]}
          />
          <Module
            icon={<ShieldCheck size={14} />}
            value="4"
            label={["Providers", "active"]}
          />
        </section>

        {alert && (
          <button
            onClick={() => flyTo({ center: [alert.location.lon, alert.location.lat], zoom: 8 })}
            className="flex w-full items-center gap-3 overflow-hidden rounded-[12px] border-l-2 border-danger/70 bg-[linear-gradient(100deg,rgb(var(--danger)/0.14),rgb(var(--danger)/0.04)_60%,transparent)] px-3.5 py-3 text-left transition-colors hover:bg-[linear-gradient(100deg,rgb(var(--danger)/0.2),rgb(var(--danger)/0.06)_60%,transparent)]"
          >
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-danger">
                Recent Alert
              </span>
              <span className="mt-0.5 block truncate text-[0.74rem] text-text-muted">
                Oil spill detected in the Arabian Sea (lat {alert.location.lat.toFixed(1)}
                {"°"}N, lon {alert.location.lon.toFixed(1)}
                {"°"}E)
              </span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-text-subtle" />
          </button>
        )}

        {scenarios.length > 0 && (
          <section>
            <SectionLabel>Try a worked example</SectionLabel>
            <div className="mt-3 space-y-1.5">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full rounded-[10px] border px-3 py-2.5 text-left transition-all duration-200 ${
                    s.id === activeId
                      ? "border-accent/45 bg-accent/[0.07]"
                      : "border-border/60 hover:-translate-y-px hover:border-border-strong/70 hover:bg-surface-3/30"
                  }`}
                >
                  <div className="text-[0.8rem] text-text">{s.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[0.72rem] leading-snug text-text-muted">
                    {s.summary}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <InvestigationSnapshot />

        <ResponsiblePartySnapshot />

        <section>
          <div className="flex items-center justify-between">
            <SectionLabel>Recent Investigations</SectionLabel>
            <Link
              href="/investigations"
              className="inline-flex items-center gap-1 text-[0.62rem] text-text-muted hover:text-accent"
            >
              View all <ArrowUpRight size={10} />
            </Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {sampleInvestigations.map((inv, i) => (
              <Link
                key={inv.id}
                href={`/investigations/${inv.id}`}
                className="flex items-center gap-3 rounded-[10px] border border-border/50 p-2 pr-3 transition-all duration-200 hover:-translate-y-px hover:border-border-strong/70 hover:bg-surface-3/30"
              >
                <span
                  className="h-10 w-14 shrink-0 rounded-[8px] border border-border/50"
                  style={{ background: THUMBS[i % THUMBS.length] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.76rem] text-text">{inv.title}</span>
                  <span className="tnum mt-0.5 block text-[0.62rem] text-text-subtle">
                    {inv.id} · {inv.region}
                  </span>
                </span>
                <ChevronRight size={13} className="shrink-0 text-text-subtle" />
              </Link>
            ))}
            {sampleInvestigations.length === 0 && (
              <p className="py-3 text-[0.72rem] text-text-subtle">
                Sample investigations are turned off in Settings.
              </p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Real reported spills</SectionLabel>
          <div className="mt-3 space-y-1.5">
            {(incidents ?? []).slice(0, 4).map((i) => (
              <button
                key={i.id}
                onClick={() => flyTo({ center: [i.location.lon, i.location.lat], zoom: 8 })}
                className="flex w-full items-start gap-2.5 rounded-[10px] border border-border/50 px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-border-strong/70 hover:bg-surface-3/30"
              >
                <MapPin size={12} className="mt-1 shrink-0 text-accent/70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8rem] text-text">{i.name}</span>
                  <span className="tnum mt-0.5 block text-[0.7rem] text-text-muted">
                    {new Date(i.reported_at).toISOString().slice(0, 10)} · {i.source}
                  </span>
                </span>
                <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
              </button>
            ))}
            {incidents?.length === 0 && (
              <p className="py-3 text-[0.72rem] text-text-subtle">
                Backend offline. Start it to load the spill records.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.3em] text-text-subtle">
      <span className="h-px w-5 bg-accent/50" />
      {children}
    </h2>
  );
}

/** intelligence module: big metric, framed icon top-right, thin cyan border */
function Module({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: [string, string];
}) {
  return (
    <div className="group relative overflow-hidden rounded-[12px] border border-accent/18 bg-[linear-gradient(160deg,rgb(var(--surface-1)/0.6),rgb(var(--navy-950)/0.5))] p-3 transition-all duration-200 hover:border-accent/40 hover:shadow-[0_0_22px_-8px_rgb(var(--accent)/0.4)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-7 -top-7 h-16 w-16 rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, transparent 44%, rgb(var(--accent) / 0.12) 46%, transparent 48%)," +
            "radial-gradient(circle, transparent 66%, rgb(var(--accent) / 0.08) 68%, transparent 70%)",
        }}
      />
      <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-[7px] border border-accent/25 text-accent/80">
        {icon}
      </span>
      <div className="metric text-[1.5rem] leading-none text-text">{value}</div>
      <div className="mt-2 text-[0.5rem] font-semibold uppercase leading-[1.5] tracking-[0.14em] text-text-subtle">
        {label[0]}
        <br />
        {label[1]}
      </div>
    </div>
  );
}

function SatelliteMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden className="text-accent/70">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="13" y="13" width="6" height="6" rx="1" />
        <path d="M13 13 L8 8 M19 13 L24 8 M13 19 L8 24 M19 19 L24 24" />
        <rect x="4" y="4" width="5" height="5" rx="1" />
        <rect x="23" y="4" width="5" height="5" rx="1" />
        <rect x="4" y="23" width="5" height="5" rx="1" />
        <rect x="23" y="23" width="5" height="5" rx="1" />
      </g>
      <circle cx="16" cy="16" r="1.4" fill="currentColor" />
    </svg>
  );
}
