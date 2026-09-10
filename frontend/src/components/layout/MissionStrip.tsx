"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Radio, Satellite, Waves, Wind, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useInvestigationRunStore } from "@/store/investigationRun";

/**
 * Live operations-centre status strip along the very top of the workspace.
 * Purely presentational: it reports feed / model state and a running UTC clock.
 * Nothing here drives the app — it just makes the surface read as an ops centre.
 */
export function MissionStrip() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [utc, setUtc] = useState("--:--:--");

  const creating = useInvestigationRunStore((s) => s.creating);
  const running = useInvestigationRunStore((s) =>
    Object.values(s.runs).some((r) => r.status === "running"),
  );
  const aiBusy = creating || running;

  useEffect(() => {
    api("/providers").then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const feedOk = online !== false;

  return (
    <div className="panel flex h-9 items-center gap-1 overflow-x-auto px-3 text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[rgb(var(--text-subtle))]">
      <Feed icon={<Satellite size={11} />} label="Satellite Connected" ok={feedOk} />
      <Dot />
      <Feed icon={<Radio size={11} />} label="AIS Live" ok={feedOk} />
      <Dot />
      <Feed icon={<Waves size={11} />} label="Ocean Model Active" ok={feedOk} />
      <Dot />
      <Feed icon={<Wind size={11} />} label="Weather Model" ok={feedOk} />
      <Dot />
      <Feed
        icon={<BrainCircuit size={11} />}
        label={aiBusy ? "AI Investigation · Processing" : "AI Investigation Ready"}
        ok
        pulse={aiBusy}
      />

      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[rgb(var(--text-muted))]">
        <Zap size={11} className="text-[rgb(var(--accent))]" />
        Last update
        <span className="tnum tracking-normal text-[rgb(var(--text))]">{utc} UTC</span>
      </span>
    </div>
  );
}

function Feed({
  icon,
  label,
  ok,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          ok ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--danger))]",
          pulse && "animate-pulse-soft",
        )}
      />
      <span className="text-[rgb(var(--accent)/0.75)]">{icon}</span>
      {label}
    </span>
  );
}

function Dot() {
  return <span className="shrink-0 text-[rgb(var(--border-strong))]">·</span>;
}
