"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Markdown } from "@/components/ui/Markdown";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useInvestigationStore } from "@/store/investigation";
import { useInvestigationRunStore } from "@/store/investigationRun";
import { useOceanStore } from "@/store/ocean";
import { useReportStore } from "@/store/report";
import type { AgentEvent, InvestigationReport, ReportSection } from "@/types/api";

const PHASE_LABEL: Record<string, string> = {
  satellite: "Satellite acquisition & detection",
  ocean: "Origin reconstruction & drift forecast",
  vessel: "AIS retrieval around the origin",
  investigation: "Suspect scoring & ranking",
  environmental: "Environmental impact & priority",
  report: "Report assembly",
};

/** open the server-rendered report HTML in a new window and fire print (→ Save as PDF) */
async function downloadReportPdf(href: string) {
  try {
    const res = await fetch(href);
    const html = await res.text();
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) {
      window.open(href, "_blank", "noopener");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  } catch {
    window.open(href, "_blank", "noopener");
  }
}

function InvestigationTimeline({ events }: { events: AgentEvent[] }) {
  const done = events.filter((e) => e.status === "done");
  if (done.length === 0) return null;
  const t0 = new Date(done[0]!.at).getTime();
  const spansTime =
    new Date(done[done.length - 1]!.at).getTime() - t0 >= 6e4;
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
        Investigation timeline
      </h3>
      <ol className="mt-2 border-l border-border/70 pl-3">
        {done.map((e, i) => {
          const mins = Math.max(0, Math.round((new Date(e.at).getTime() - t0) / 6e4));
          const stamp = spansTime
            ? mins === 0
              ? "start"
              : `+${mins}m`
            : `${new Date(e.at).toISOString().slice(11, 19)}Z`;
          return (
            <li key={`${e.phase}-${i}`} className="relative pb-2.5 last:pb-0">
              <span className="absolute -left-[1.03rem] top-1 h-2 w-2 rounded-full border border-accent bg-surface-1" />
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-text">{PHASE_LABEL[e.phase] ?? e.phase}</span>
                <span className="tnum shrink-0 text-[10px] text-text-subtle">{stamp}</span>
              </div>
              {e.message && (
                <p className="mt-0.5 text-[10px] leading-snug text-text-subtle">{e.message}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function ReportTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const ocean = useOceanStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const suspects = useInvestigationStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const { byDetection, running, phase, phases, error, run, printUrl } = useReportStore();
  const report = detection ? byDetection[detection.id] : undefined;
  const agentRun = useInvestigationRunStore((s) =>
    scenarioId ? s.runForScenario(scenarioId) : null,
  );

  const missing = [
    !detection && "detection",
    !ocean?.hindcast && "hindcast",
    !ocean?.forecast && "forecast",
    !suspects && "investigation",
  ].filter(Boolean) as string[];

  if (missing.length) {
    return (
      <div className="p-4">
        <EmptyState
          title="Pipeline incomplete"
          milestone="M5"
          description={`The report assembles every module's output. Still to run: ${missing.join(", ")}.`}
        >
          {scenarioId && (
            <Link
              href={`/investigations/${params.id}/${detection ? (ocean?.hindcast ? "vessels" : "ocean") : "detection"}`}
              className="text-xs text-accent hover:underline"
            >
              Continue the pipeline →
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  const isRunning = running === detection!.id;

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {isRunning ? (
        <ol className="space-y-1.5">
          {phases.map((p, i) => {
            const idx = phase ? phases.indexOf(phase) : -1;
            const done = idx > i;
            const active = idx === i;
            return (
              <li
                key={p}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs",
                  active ? "border-accent/45 bg-accent/10 text-text" : "border-border text-text-subtle",
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
      ) : report ? (
        <ReportView
          report={report}
          printHref={printUrl(report.id)}
          events={agentRun?.events ?? []}
          onRegenerate={() => run(detection!.id, params.id)}
        />
      ) : (
        <button
          onClick={() => run(detection!.id, params.id)}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          <FileText size={14} /> Generate investigation report
        </button>
      )}
    </div>
  );
}

function ReportView({
  report,
  printHref,
  events,
  onRegenerate,
}: {
  report: InvestigationReport;
  printHref: string;
  events: AgentEvent[];
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          {report.id} · {new Date(report.generated_at).toISOString().slice(0, 16).replace("T", " ")}Z
        </div>
        <h2 className="mt-1 text-sm font-semibold leading-snug text-text">{report.title}</h2>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => downloadReportPdf(printHref)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-accent/45 bg-accent/95 py-1.5 text-[11px] font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          <Download size={12} /> Download PDF
        </button>
        <a
          href={printHref}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:border-accent/60 hover:text-accent"
        >
          <ExternalLink size={12} />
        </a>
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <InvestigationTimeline events={events} />

      <CauseCard report={report} />

      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Executive summary
        </h3>
        <Markdown source={report.executive_summary} className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed" />
      </section>

      <div className="space-y-1.5">
        {report.sections.map((s, i) => (
          <Section key={s.key} section={s} defaultOpen={i === 0} />
        ))}
      </div>

      <p className="border-t border-border pt-3 text-[10px] leading-relaxed text-text-subtle">
        {report.disclaimer}
      </p>
    </div>
  );
}

function CauseCard({ report }: { report: InvestigationReport }) {
  const c = report.cause;
  return (
    <div className="rounded-sm border border-border bg-surface-2/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-text-subtle">Most probable cause</span>
        <Badge tone={c.probability >= 0.6 ? "warning" : "outline"}>
          {Math.round(c.probability * 100)}%
        </Badge>
      </div>
      <div className="mt-0.5 text-sm font-semibold capitalize text-text">
        {c.cause.replace(/-/g, " ")}
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px] text-text-muted">
        {c.supporting_evidence.map((e, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-text-subtle" />
            {e}
          </li>
        ))}
      </ul>

      {c.category_confidence && Object.keys(c.category_confidence).length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-text-subtle">
            How it happened — confidence by category
          </div>
          <div className="mt-1.5 space-y-1">
            {Object.entries(c.category_confidence)
              .sort((a, b) => b[1] - a[1])
              .filter(([, v]) => v >= 0.02)
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-44 shrink-0 text-text-muted">{k}</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-8 shrink-0 text-right text-text-subtle">
                    {Math.round(v * 100)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {Object.keys(c.alternatives).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(c.alternatives).map(([k, v]) => (
            <span key={k} className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] capitalize text-text-subtle">
              {k.replace(/-/g, " ")} {Math.round(v * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ section, defaultOpen }: { section: ReportSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-sm border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-text"
      >
        {section.title}
        <span className="text-text-subtle">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5">
          <Markdown source={section.body_markdown} />
        </div>
      )}
    </div>
  );
}
