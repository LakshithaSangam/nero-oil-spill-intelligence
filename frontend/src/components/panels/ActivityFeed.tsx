"use client";

import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentEvent, AgentPhase, InvestigationRun } from "@/types/api";

const PHASE_LABEL: Record<AgentPhase, string> = {
  satellite: "Satellite Agent",
  ocean: "Ocean Agent",
  vessel: "Vessel Agent",
  investigation: "Investigation Agent",
  environmental: "Environmental Agent",
  report: "Report Agent",
};

function inline(text: string): React.ReactNode[] {
  return text.split("**").map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="text-text">{p}</strong> : <span key={i}>{p}</span>,
  );
}

export function ActivityFeed({
  events,
  run,
}: {
  events: AgentEvent[];
  run?: InvestigationRun | null;
}) {
  if (!events.length) {
    return (
      <p className="rounded-sm border border-dashed border-border px-3 py-4 text-center text-[11px] text-text-subtle">
        Waiting for the first agent…
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((e, i) => (
        <Row key={i} event={e} />
      ))}
      {run && run.status !== "running" && (
        <div
          className={cn(
            "mt-2 rounded-sm border px-3 py-2 text-[11px] font-medium",
            run.status === "complete"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {run.status === "complete"
            ? `Workflow complete: ${run.cause?.replace(/-/g, " ") ?? "report ready"}`
            : "Workflow ended with a failure"}
        </div>
      )}
    </div>
  );
}

function Row({ event }: { event: AgentEvent }) {
  const running = event.status === "running";
  const failed = event.status === "failed";
  const skipped = event.status === "skipped";
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-sm border px-2.5 py-2",
        running
          ? "border-accent/40 bg-accent/[0.05]"
          : failed
            ? "border-danger/30"
            : "border-border",
      )}
    >
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
        {running ? (
          <Loader2 size={13} className="animate-spin text-accent" />
        ) : failed ? (
          <X size={13} className="text-danger" />
        ) : skipped ? (
          <CircleDashed size={12} className="text-text-subtle" />
        ) : (
          <Check size={13} className="text-success" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-text">{PHASE_LABEL[event.phase]}</span>
          <span className="tnum shrink-0 text-[10px] text-text-subtle">
            {new Date(event.at).toISOString().slice(11, 19)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{inline(event.message)}</p>
      </div>
    </div>
  );
}
