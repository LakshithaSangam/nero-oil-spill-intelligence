"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Badge } from "@/components/ui/Badge";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import { useInvestigationRunStore } from "@/store/investigationRun";
import { useUiStore } from "@/store/ui";

const PRIORITY_TONE = {
  routine: "outline",
  elevated: "warning",
  urgent: "danger",
} as const;

const RUN_TONE = {
  running: "accent",
  complete: "success",
  failed: "danger",
} as const;

export default function InvestigationsPage() {
  const runs = useInvestigationRunStore((s) => s.list);
  const loadList = useInvestigationRunStore((s) => s.loadList);
  const sampleDataVisible = useUiStore((s) => s.sampleDataVisible);
  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div>
      <PanelHeader
        eyebrow="Casework"
        title="Investigations"
        subtitle="Each investigation runs one incident through the full pipeline."
      />
      <div className="p-3">
        <div className="space-y-2">
          {!sampleDataVisible && runs.length === 0 && (
            <p className="rounded-sm border border-dashed border-border px-3 py-4 text-center text-[11px] leading-relaxed text-text-subtle">
              Sample investigations are turned off. Turn them back on in Settings, or start
              a real one from the Overview page.
            </p>
          )}
          {sampleDataVisible && SEED_INVESTIGATIONS.map((inv) => {
            const done = inv.stages.filter((s) => s.status === "complete").length;
            return (
              <Link
                key={inv.id}
                href={`/investigations/${inv.id}`}
                className="block rounded-sm border border-border p-3 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tnum text-[11px] text-text-subtle">{inv.id}</span>
                  <Badge tone={PRIORITY_TONE[inv.priority]}>{inv.priority}</Badge>
                </div>
                <div className="mt-1 text-sm font-medium leading-snug text-text">{inv.title}</div>
                <div className="mt-1 text-[11px] text-text-muted">{inv.region}</div>

                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {inv.stages.map((s) => (
                      <span
                        key={s.key}
                        title={`${s.key}: ${s.status}`}
                        className={`h-1 flex-1 rounded-full ${
                          s.status === "complete"
                            ? "bg-success"
                            : s.status === "running"
                              ? "bg-accent"
                              : "bg-border-strong"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="tnum text-[10px] text-text-subtle">
                    {done}/{inv.stages.length}
                  </span>
                  <ChevronRight size={14} className="text-text-subtle" />
                </div>
              </Link>
            );
          })}
        </div>

        {runs.length > 0 && (
          <div className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
              Agent runs
            </h2>
            <div className="mt-2 space-y-1.5">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="rounded-sm border border-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum text-[11px] text-text-subtle">{r.id}</span>
                    <Badge tone={RUN_TONE[r.status]}>
                      {r.status === "running" ? (r.current_phase ?? "running") : r.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text">{r.label}</div>
                  {r.cause && (
                    <div className="mt-0.5 text-[11px] capitalize text-text-muted">
                      {r.cause.replace(/-/g, " ")}
                      {r.lead_suspect_mmsi ? ` · lead ${r.lead_suspect_mmsi}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 rounded-sm border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-text-subtle">
          Start an agent run from an investigation&apos;s Overview
          (<code className="text-text-muted">POST /v1/investigations</code>). Six agents
          run the workflow and stream their progress.
        </p>
      </div>
    </div>
  );
}
