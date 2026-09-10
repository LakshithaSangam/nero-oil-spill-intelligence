"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ActivityFeed } from "@/components/panels/ActivityFeed";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useInvestigationStore } from "@/store/investigation";
import { useInvestigationRunStore } from "@/store/investigationRun";
import { useEnvironmentalStore } from "@/store/environmental";
import { useReportStore } from "@/store/report";
import { useScenarioStore } from "@/store/scenario";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/types/api";

const NO_EVENTS: AgentEvent[] = [];

const STAGE_LABEL: Record<string, string> = {
  detection: "Spill detection & characterisation",
  ocean: "Ocean intelligence: hindcast and forecast",
  vessels: "AIS reconstruction & suspect ranking",
  environment: "Environmental impact assessment",
  report: "Investigation report",
};

export default function InvestigationOverview({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenario = useScenarioStore((s) =>
    inv?.scenarioId ? s.scenarios.find((x) => x.id === inv.scenarioId) : undefined,
  );

  const detectionRunning = useDetectionStore((s) => s.running);
  const detection = useDetectionStore((s) =>
    inv?.scenarioId ? s.byScenario[inv.scenarioId] : undefined,
  );
  const oceanRunning = useOceanStore((s) => s.running);
  const oceanEntry = useOceanStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const investigationRunning = useInvestigationStore((s) => s.running);
  const ranking = useInvestigationStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const envRunning = useEnvironmentalStore((s) => s.running);
  const impact = useEnvironmentalStore((s) => (detection ? s.byDetection[detection.id] : undefined));
  const reportRunning = useReportStore((s) => s.running);
  const report = useReportStore((s) => (detection ? s.byDetection[detection.id] : undefined));

  const [fullStep, setFullStep] = useState<string | null>(null);

  const createRun = useInvestigationRunStore((s) => s.create);
  const creatingRun = useInvestigationRunStore((s) => s.creating);
  const loadRunList = useInvestigationRunStore((s) => s.loadList);
  const runsMap = useInvestigationRunStore((s) => s.runs);
  const eventsMap = useInvestigationRunStore((s) => s.events);
  const run = useMemo(() => {
    if (!inv?.scenarioId) return null;
    return (
      Object.values(runsMap)
        .filter((r) => r.scenario_id === inv.scenarioId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }, [runsMap, inv?.scenarioId]);
  const runEvents = (run ? eventsMap[run.id] : undefined) ?? NO_EVENTS;

  useEffect(() => {
    void loadRunList();
  }, [loadRunList]);

  if (!inv) return null;

  const liveStatus = (key: string): string => {
    if (key === "detection") {
      if (detection) return "complete";
      if (detectionRunning === inv.scenarioId || fullStep === "detection") return "running";
    }
    if (key === "ocean") {
      if (oceanEntry?.hindcast && oceanEntry?.forecast) return "complete";
      if (oceanEntry?.hindcast || oceanRunning || fullStep === "ocean") return "running";
    }
    if (key === "vessels") {
      if (ranking) return "complete";
      if (investigationRunning === detection?.id || fullStep === "vessels") return "running";
    }
    if (key === "environment") {
      if (impact) return "complete";
      if (envRunning === detection?.id || fullStep === "environment") return "running";
    }
    if (key === "report") {
      if (report) return "complete";
      if (reportRunning === detection?.id || fullStep === "report") return "running";
    }
    return "pending";
  };

  const anyRunning =
    Boolean(fullStep) ||
    Boolean(detectionRunning || oceanRunning || investigationRunning || envRunning || reportRunning);

  const runFull = async () => {
    if (!inv.scenarioId || !scenario || anyRunning) return;
    setFullStep("detection");
    const segModel = useUiStore.getState().segModel;
    await useDetectionStore.getState().run(inv.scenarioId, {
      bbox: scenario.aoi,
      scenario: inv.scenarioId,
      ...(segModel !== "mock" ? { segmentation_model: segModel } : {}),
    });
    const det = useDetectionStore.getState().byScenario[inv.scenarioId];
    if (!det) return setFullStep(null);

    setFullStep("ocean");
    await useOceanStore.getState().runHindcast(det.id);
    await useOceanStore.getState().runForecast(det.id);

    setFullStep("vessels");
    await useInvestigationStore.getState().run(det.id);

    setFullStep("environment");
    await useEnvironmentalStore.getState().run(det.id);

    setFullStep("report");
    await useReportStore.getState().run(det.id, inv.id);

    setFullStep(null);
  };

  const allDone = report && impact && ranking && oceanEntry?.forecast && detection;
  const runActive = run?.status === "running" || creatingRun;

  const startAgentRun = () => {
    if (!inv.scenarioId || runActive) return;
    void createRun({ scenario_id: inv.scenarioId, label: inv.title });
  };

  return (
    <div className="space-y-6 p-4">
      <dl className="text-[0.78rem]">
        <Meta label="Opened" value={new Date(inv.openedAt).toISOString().replace("T", " ").slice(0, 16) + "Z"} first />
        <Meta
          label="Priority"
          value={
            <Badge tone={inv.priority === "urgent" ? "danger" : inv.priority === "elevated" ? "warning" : "outline"}>
              {inv.priority}
            </Badge>
          }
        />
        <Meta label="Lead" value={inv.lead} />
        <Meta label="Region" value={inv.region} />
        {inv.incidentId && <Meta label="Ground-truth incident" value={<span className="tnum">{inv.incidentId}</span>} />}
      </dl>

      <section>
        <h2 className="eyebrow text-[0.6rem]">Pipeline</h2>
        <ol className="mt-2.5 border-t border-border/70">
          {inv.stages.map((s, i) => {
            const status = liveStatus(s.key);
            return (
              <li key={s.key} className="flex items-center gap-3 border-b border-border/70 py-2.5">
                <span className="metric text-[0.7rem] text-text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 text-[0.78rem] text-text">{STAGE_LABEL[s.key]}</span>
                <Badge tone={status === "complete" ? "success" : status === "running" ? "accent" : "outline"}>
                  {status}
                </Badge>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="space-y-2.5">
        <button
          onClick={startAgentRun}
          disabled={runActive || !scenario}
          className="flex w-full items-center justify-center gap-2 border border-accent/45 bg-accent/95 py-2 text-[0.76rem] font-medium tracking-wide text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {runActive ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
          {runActive
            ? `Agents working: ${run?.current_phase ?? "starting"}`
            : run
              ? "Re-run with agents"
              : "Run with agents"}
        </button>
        <button
          onClick={runFull}
          disabled={anyRunning || runActive || !scenario}
          className="flex w-full items-center justify-center gap-2 border border-border-strong py-1.5 text-[0.7rem] tracking-wide text-text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-50"
        >
          {anyRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {anyRunning ? `Stepping through: ${fullStep ?? "…"}` : "Step through modules manually"}
        </button>
        <p className="text-[0.7rem] leading-relaxed text-text-subtle">
          Agents run the whole workflow on the server and narrate it below. The map
          and tabs fill in once it finishes.
        </p>
      </div>

      {(runEvents.length > 0 || runActive) && (
        <section>
          <h2 className="eyebrow text-[0.6rem]">Investigation activity</h2>
          <div className="mt-2.5">
            <ActivityFeed events={runEvents} run={run} />
          </div>
        </section>
      )}

      <Link
        href={`/investigations/${inv.id}/${report ? "report" : "detection"}`}
        className="inline-flex text-[0.74rem] tracking-wide text-text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        {report ? "Open report →" : "Start with detection →"}
      </Link>
    </div>
  );
}

function Meta({ label, value, first }: { label: string; value: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-border/70 py-2", first && "border-t")}>
      <dt className="eyebrow text-[0.56rem]">{label}</dt>
      <dd className="text-right text-text">{value}</dd>
    </div>
  );
}
