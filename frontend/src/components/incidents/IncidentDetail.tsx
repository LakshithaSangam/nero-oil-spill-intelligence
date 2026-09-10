"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useDetectionStore } from "@/store/detection";
import type { Incident } from "@/types/api";

const SEV_TONE: Record<Incident["severity"], string> = {
  minor: "rgb(var(--kelp))",
  moderate: "rgb(var(--warning))",
  major: "rgb(var(--danger))",
  catastrophic: "rgb(var(--danger))",
  unknown: "rgb(var(--text-subtle))",
};

const VERIFY: Record<Incident["status"], string> = {
  reported: "Awaiting review",
  confirmed: "Verified",
  responding: "Response active",
  recovered: "Closed",
  archived: "Archived",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2">
      <span className="shrink-0 text-[0.62rem] uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </span>
      <span className="text-right text-[0.8rem] text-text">{children}</span>
    </div>
  );
}

export function IncidentDetail({
  incident,
  onBack,
}: {
  incident: Incident;
  onBack: () => void;
}) {
  const lat = incident.location.lat;
  const lon = incident.location.lon;
  const detection = useDetectionStore((s) =>
    Object.values(s.byScenario).find((d) => d.incident_id === incident.id),
  );
  const confPct = detection
    ? Math.round(detection.detection_confidence.score * 100)
    : null;

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-3.5">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-3 py-1.5 text-[0.72rem] font-medium tracking-wide text-text-muted transition-colors hover:border-accent/60 hover:text-accent"
        >
          <ArrowLeft size={13} /> Back to all incidents
        </button>
      </div>

      <div className="px-4 pb-5 pt-3">
        <p className="eyebrow">Field record</p>
        <h2 className="h-editorial mt-2 text-[1.35rem] leading-tight text-text">
          {incident.name}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-text-subtle">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: SEV_TONE[incident.severity] }}
          />
          {incident.severity} · {VERIFY[incident.status] ?? incident.status}
        </div>

        <div className="mt-4">
          <Row label="Detected by">{incident.source.replace(/\s*\(.*\)$/, "")}</Row>
          <Row label="Reported">
            <span className="tnum">
              {new Date(incident.reported_at).toISOString().replace("T", " ").slice(0, 16)}Z
            </span>
          </Row>
          <Row label="Position">
            <span className="tnum">
              {Math.abs(lat).toFixed(4)}°{lat >= 0 ? "N" : "S"}{" "}
              {Math.abs(lon).toFixed(4)}°{lon >= 0 ? "E" : "W"}
            </span>
          </Row>
          {incident.substance && <Row label="Substance">{incident.substance}</Row>}
          {incident.estimated_volume_bbl != null && (
            <Row label="Est. volume">
              <span className="tnum">{incident.estimated_volume_bbl.toLocaleString()} bbl</span>
            </Row>
          )}
          <Row label="Status">{VERIFY[incident.status] ?? incident.status}</Row>
          {confPct != null && (
            <Row label="Detection confidence">
              <span className="tnum">{confPct}%</span>
            </Row>
          )}
        </div>

        {confPct != null && detection && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${confPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[0.7rem] leading-relaxed text-text-subtle">
              {detection.detection_confidence.rationale}
            </p>
          </div>
        )}

        {incident.description && (
          <div className="mt-4">
            <p className="eyebrow">Summary</p>
            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-text-muted">
              {incident.description}
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[0.7rem] leading-relaxed text-text-subtle">
            Trajectory, vessel attribution and habitat exposure for this record are
            produced by running the full pipeline on its area of interest from an
            investigation.
          </p>
        </div>

        {incident.external_url && (
          <a
            href={incident.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[0.72rem] tracking-wide text-accent underline-offset-4 hover:underline"
          >
            Source record <ExternalLink size={12} />
          </a>
        )}

        <button
          onClick={onBack}
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-border bg-surface-2/50 py-2.5 text-[0.74rem] font-medium tracking-wide text-text-muted transition-colors hover:border-accent/60 hover:text-accent"
        >
          <ArrowLeft size={13} /> Choose a different incident
        </button>
      </div>
    </div>
  );
}
