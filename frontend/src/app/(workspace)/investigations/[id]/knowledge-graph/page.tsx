"use client";

import Link from "next/link";
import { RefreshCw, Share2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GraphCanvas } from "@/components/panels/GraphCanvas";
import { getInvestigation } from "@/lib/mock/investigations";
import { useDetectionStore } from "@/store/detection";
import { useGraphStore } from "@/store/graph";
import { useInvestigationStore } from "@/store/investigation";
import { useOceanStore } from "@/store/ocean";

export default function KnowledgeGraphTab({ params }: { params: { id: string } }) {
  const inv = getInvestigation(params.id);
  const scenarioId = inv?.scenarioId ?? null;
  const detection = useDetectionStore((s) =>
    scenarioId ? s.byScenario[scenarioId] : undefined,
  );
  const hindcast = useOceanStore((s) =>
    detection ? s.byDetection[detection.id]?.hindcast : undefined,
  );
  const ranking = useInvestigationStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const { byDetection, loading, error, selectedNodeId, loadFor, select } = useGraphStore();
  const graph = detection ? byDetection[detection.id] : undefined;
  const selected = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const ready = detection && hindcast && ranking;

  if (!scenarioId || !ready) {
    return (
      <div className="p-4">
        <EmptyState
          title="Investigation incomplete"
          milestone="M7b"
          description="The graph links the spill to its origin, the vessels nearby, the evidence and the likely cause. Run detection, then the hindcast, then the investigation first."
        >
          {scenarioId && (
            <Link
              href={`/investigations/${params.id}/${detection ? "vessels" : "detection"}`}
              className="text-xs text-accent hover:underline"
            >
              Continue the pipeline →
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Every finding and its supporting context in one graph. Click a node for detail;
        hover to trace its links. Scroll to zoom, drag to pan.
      </p>

      {error && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {!graph ? (
        <button
          onClick={() => loadFor(detection.id)}
          disabled={loading === detection.id}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          <Share2 size={14} /> {loading === detection.id ? "Building graph…" : "Build knowledge graph"}
        </button>
      ) : (
        <>
          <GraphCanvas graph={graph} selectedId={selectedNodeId} onSelect={select} />

          <div className="flex items-center justify-between text-[11px] text-text-subtle">
            <span className="tnum">
              {graph.nodes.length} nodes · {graph.edges.length} links
            </span>
            <button
              onClick={() => loadFor(detection.id, true)}
              className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-text-muted hover:border-accent/60 hover:text-accent"
            >
              <RefreshCw size={11} /> Rebuild
            </button>
          </div>

          {selected ? (
            <div className="rounded-sm border border-accent/40 bg-accent/[0.05] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-text-subtle">
                  {selected.kind}
                </span>
                {selected.score != null && (
                  <span className="tnum text-[11px] text-accent">
                    {Math.round(selected.score * 100)}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-text">{selected.label}</div>
              {selected.sublabel && (
                <div className="text-[11px] text-text-muted">{selected.sublabel}</div>
              )}
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {Object.entries(selected.detail).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-text-subtle">{k}</dt>
                    <dd className="tnum text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 border-t border-border pt-2 text-[10px] text-text-subtle">
                {graph.edges
                  .filter((e) => e.source === selected.id || e.target === selected.id)
                  .map((e) => {
                    const other =
                      e.source === selected.id
                        ? graph.nodes.find((n) => n.id === e.target)
                        : graph.nodes.find((n) => n.id === e.source);
                    return (
                      <button
                        key={e.id}
                        onClick={() => select(other?.id ?? null)}
                        className="mr-2 inline-block hover:text-accent"
                      >
                        {e.source === selected.id ? "→" : "←"} {e.label || e.kind} · {other?.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed border-border px-3 py-2 text-center text-[11px] text-text-subtle">
              Select a node to inspect it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
