"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GraphEdge, GraphNode, KnowledgeGraph } from "@/types/api";

const GROUP_VAR: Record<string, string> = {
  spill: "--layer-spill",
  origin: "--layer-origin",
  environment: "--layer-hindcast",
  cause: "--accent",
  incident: "--text-muted",
  vessel: "--layer-suspect",
  company: "--text-subtle",
  cargo: "--warning",
  flag: "--text-subtle",
  evidence: "--warning",
  risk: "--danger",
  precedent: "--accent-strong",
};

const RING_R = [0, 132, 250, 360];
const VB = 820;

interface Placed extends GraphNode {
  x: number;
  y: number;
}

function layout(nodes: GraphNode[], edges: GraphEdge[]): Placed[] {
  const angle: Record<string, number> = {};
  const parentOf: Record<string, string> = {};
  for (const e of edges) {
    // first incoming edge from a lower ring becomes the "parent"
    if (!(e.target in parentOf)) parentOf[e.target] = e.source;
  }

  const byRing: Record<number, GraphNode[]> = {};
  for (const n of nodes) (byRing[n.ring] ??= []).push(n);

  // ring 1: spread evenly, grouped
  const r1 = (byRing[1] ?? []).slice().sort((a, b) => a.group.localeCompare(b.group));
  r1.forEach((n, i) => {
    angle[n.id] = (i / Math.max(r1.length, 1)) * 2 * Math.PI;
  });

  // rings 2, 3: cluster near parent's angle
  for (const ring of [2, 3]) {
    const items = byRing[ring] ?? [];
    const siblings: Record<string, GraphNode[]> = {};
    for (const n of items) {
      const p = parentOf[n.id] ?? "root";
      (siblings[p] ??= []).push(n);
    }
    for (const [p, group] of Object.entries(siblings)) {
      const base = angle[p] ?? Math.random() * 2 * Math.PI;
      const spread = Math.min(0.9, 0.28 * group.length);
      group.forEach((n, i) => {
        const t = group.length === 1 ? 0 : i / (group.length - 1) - 0.5;
        angle[n.id] = base + t * spread;
      });
    }
  }

  return nodes.map((n) => {
    if (n.ring === 0) return { ...n, x: 0, y: 0 };
    const a = (angle[n.id] ?? 0) - Math.PI / 2;
    const r = RING_R[n.ring] ?? 360;
    return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

export function GraphCanvas({
  graph,
  selectedId,
  onSelect,
}: {
  graph: KnowledgeGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const placed = useMemo(() => layout(graph.nodes, graph.edges), [graph]);
  const pos = useMemo(
    () => Object.fromEntries(placed.map((n) => [n.id, n])),
    [placed],
  );
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const active = hover ?? selectedId;
  const neighbours = useMemo(() => {
    if (!active) return null;
    const s = new Set<string>([active]);
    for (const e of graph.edges) {
      if (e.source === active) s.add(e.target);
      if (e.target === active) s.add(e.source);
    }
    return s;
  }, [active, graph.edges]);

  const onWheel = (e: React.WheelEvent) => {
    setView((v) => ({ ...v, k: Math.min(3, Math.max(0.45, v.k * (e.deltaY < 0 ? 1.12 : 0.9))) }));
  };
  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
  };
  const onMove = (e: React.MouseEvent) => {
    if (drag.current) setView((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }));
  };
  const onUp = () => (drag.current = null);

  return (
    <div
      className="relative h-[360px] w-full cursor-grab overflow-hidden rounded-sm border border-border bg-surface-inset/60 active:cursor-grabbing"
      onWheel={onWheel}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    >
      <svg
        viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
        className="h-full w-full"
        onClick={() => onSelect(null)}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {graph.edges.map((e) => {
            const a = pos[e.source];
            const b = pos[e.target];
            if (!a || !b) return null;
            const lit = neighbours ? neighbours.has(e.source) && neighbours.has(e.target) : true;
            const cx = (a.x + b.x) * 0.35;
            const cy = (a.y + b.y) * 0.35;
            return (
              <path
                key={e.id}
                d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                fill="none"
                stroke={lit ? "rgb(var(--accent))" : "rgb(var(--border-strong))"}
                strokeWidth={lit && active ? 1.6 : 0.8}
                strokeOpacity={neighbours && !lit ? 0.12 : lit && active ? 0.8 : 0.34}
              />
            );
          })}
          {placed.map((n) => {
            const v = GROUP_VAR[n.group] ?? "--text-muted";
            const r = n.ring === 0 ? 13 : n.ring === 1 ? 9 : n.ring === 2 ? 7.5 : 6;
            const dim = neighbours && !neighbours.has(n.id);
            const showLabel = n.ring <= 1 || active === n.id || (neighbours && neighbours.has(n.id));
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(n.id === selectedId ? null : n.id);
                }}
              >
                {selectedId === n.id && (
                  <circle r={r + 5} fill="none" stroke="rgb(var(--accent))" strokeWidth={1.5} />
                )}
                <circle
                  r={r}
                  fill={`rgb(var(${v}) / ${n.score != null ? 0.35 + 0.5 * n.score : 0.7})`}
                  stroke={`rgb(var(${v}))`}
                  strokeWidth={1.2}
                />
                {showLabel && (
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    className="pointer-events-none"
                    style={{ fontSize: n.ring === 0 ? 13 : 10, fill: "rgb(var(--text))" }}
                  >
                    {n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-1.5 right-2 flex flex-wrap justify-end gap-x-2 gap-y-0.5">
        {["spill", "origin", "vessel", "evidence", "cause", "environment", "precedent"].map((g) => (
          <span key={g} className="flex items-center gap-1 text-[9px] text-text-subtle">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `rgb(var(${GROUP_VAR[g]}))` }}
            />
            {g}
          </span>
        ))}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setView({ x: 0, y: 0, k: 1 });
        }}
        className={cn(
          "absolute left-2 top-2 rounded-sm border border-border bg-surface-2/80 px-2 py-0.5 text-[10px] text-text-subtle hover:text-text",
          view.k === 1 && view.x === 0 && view.y === 0 && "opacity-0",
        )}
      >
        reset view
      </button>
    </div>
  );
}
