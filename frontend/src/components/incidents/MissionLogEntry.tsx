"use client";

import { cn } from "@/lib/utils";
import type { Incident } from "@/types/api";

/** Severity → a restrained marker tone (no pills, just a dot + a left accent). */
const SEV = {
  minor: { tone: "rgb(var(--kelp))", label: "Minor" },
  moderate: { tone: "rgb(var(--warning))", label: "Moderate" },
  major: { tone: "rgb(var(--danger))", label: "Major" },
  catastrophic: { tone: "rgb(var(--danger))", label: "Critical" },
  unknown: { tone: "rgb(var(--text-subtle))", label: "Unclassified" },
} as const;

/** Ground-truth status → how far verification has progressed. */
const VERIFY: Record<Incident["status"], string> = {
  reported: "Awaiting review",
  confirmed: "Verified",
  responding: "Response active",
  recovered: "Closed",
  archived: "Archived",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCoord(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns}  ${Math.abs(lon).toFixed(3)}°${ew}`;
}

export function MissionLogEntry({
  incident,
  active,
  onSelect,
}: {
  incident: Incident;
  active?: boolean;
  onSelect: (incident: Incident) => void;
}) {
  const sev = SEV[incident.severity] ?? SEV.unknown;
  const meta: string[] = [];
  if (incident.substance) meta.push(incident.substance);
  if (incident.estimated_volume_bbl != null) {
    meta.push(`${incident.estimated_volume_bbl.toLocaleString()} bbl`);
  }

  return (
    <button
      onClick={() => onSelect(incident)}
      className={cn(
        "group relative w-full py-3.5 pl-4 pr-2 text-left transition-colors",
        active ? "bg-accent/[0.07]" : "hover:bg-surface-3/40",
      )}
    >
      {/* left accent — the only colour, thin */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px] transition-all group-hover:w-[3px]"
        style={{ background: sev.tone, opacity: active ? 1 : 0.5 }}
      />

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.86rem] font-medium leading-snug text-text">
          {incident.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sev.tone }} />
          <span className="text-[0.62rem] uppercase tracking-[0.14em] text-text-subtle">
            {sev.label}
          </span>
        </span>
      </div>

      <div className="tnum mt-1.5 text-[0.68rem] leading-relaxed text-text-muted">
        {fmtDate(incident.reported_at)}
        <span className="mx-1.5 text-text-subtle">·</span>
        {fmtCoord(incident.location.lat, incident.location.lon)}
      </div>

      {meta.length > 0 && (
        <div className="tnum mt-0.5 text-[0.68rem] text-text-subtle">{meta.join("  ·  ")}</div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.13em] text-text-subtle">
        <span className="text-text-muted">{incident.source.replace(/\s*\(.*\)$/, "")}</span>
        <span aria-hidden>·</span>
        <span>{VERIFY[incident.status] ?? incident.status}</span>
      </div>
    </button>
  );
}
