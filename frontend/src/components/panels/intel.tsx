"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TONE_STROKE = {
  accent: "rgb(var(--accent))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  danger: "rgb(var(--danger))",
} as const;

type Tone = keyof typeof TONE_STROKE;

/** a horizontal intelligence bar that counts up from 0 to `pct` on mount */
export function IntelBar({
  label,
  pct,
  valueText,
  tone = "accent",
}: {
  label: string;
  pct: number;
  valueText?: string;
  tone?: Tone;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(Math.max(0, Math.min(100, pct))), 60);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.62rem] uppercase tracking-[0.12em] text-text-subtle">{label}</span>
        <span className="tnum text-[0.64rem] text-text">{valueText ?? `${Math.round(pct)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--surface-inset)/0.9)]">
        <span
          className="iv-bar block"
          style={
            {
              "--v": `${v}%`,
              background:
                tone === "accent"
                  ? undefined
                  : `linear-gradient(90deg, ${TONE_STROKE[tone]}66, ${TONE_STROKE[tone]})`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}

/** circular cleanup-urgency gauge; the arc sweeps to its value on mount */
export function CleanupGauge({
  score,
  label,
  tone = "danger",
  centerText,
}: {
  score: number;
  label: string;
  tone?: Tone;
  centerText?: string;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(Math.max(0, Math.min(100, score))), 80);
    return () => clearTimeout(t);
  }, [score]);

  const R = 26;
  const C = 2 * Math.PI * R;
  const gap = C * 0.28; // open bottom
  const arc = C - gap;
  const offset = arc * (1 - v / 100);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-[126deg]">
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="rgb(var(--border)/0.9)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${C}`}
          />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={TONE_STROKE[tone]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${C}`}
            strokeDashoffset={offset}
            className="iv-gauge-arc"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerText ? (
            <span
              className={cn(
                "text-[0.82rem] font-semibold uppercase tracking-[0.06em]",
                tone === "danger"
                  ? "text-danger"
                  : tone === "warning"
                    ? "text-warning"
                    : tone === "success"
                      ? "text-success"
                      : "text-accent",
              )}
            >
              {centerText}
            </span>
          ) : (
            <>
              <span className="metric text-[1.05rem] leading-none text-text">{Math.round(v)}</span>
              <span className="text-[0.44rem] uppercase tracking-[0.14em] text-text-subtle">/ 100</span>
            </>
          )}
        </div>
      </div>
      <span
        className={cn(
          "mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : tone === "success"
                ? "text-success"
                : "text-accent",
        )}
      >
        {label}
      </span>
    </div>
  );
}
