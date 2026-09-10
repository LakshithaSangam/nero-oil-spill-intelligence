"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

type Step = {
  n: string;
  title: string;
  body: string;
  Visual: () => JSX.Element;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Observe",
    body: "The latest Sentinel-1 radar pass over the area of interest is pulled from the Copernicus catalogue. Radar sees oil day or night, through cloud.",
    Visual: RadarVisual,
  },
  {
    n: "02",
    title: "Detect",
    body: "Dark, low backscatter patches are picked out and measured: extent, fragments, likely oil type and spill age. Wind shadows and natural look alikes are screened out.",
    Visual: SlickVisual,
  },
  {
    n: "03",
    title: "Reconstruct",
    body: "Particles are advected backwards through the ocean current and wind field to a probable release point and a bounded time window.",
    Visual: BacktrackVisual,
  },
  {
    n: "04",
    title: "Investigate",
    body: "Historical AIS around that origin is scored on proximity, timing, tracking gaps and behaviour. Each candidate vessel gets an evidence file.",
    Visual: VesselVisual,
  },
  {
    n: "05",
    title: "Project",
    body: "An ensemble runs the drift forward 72 hours: expected area, when it reaches the coast, and which sensitive habitats are exposed.",
    Visual: DriftVisual,
  },
  {
    n: "06",
    title: "Report",
    body: "Detection, origin, attribution, forecast and impact are assembled into a document an operations centre can act on.",
    Visual: ReportVisual,
  },
];

export function HowItWorks() {
  const open = useUiStore((s) => s.howItWorksOpen);
  const setOpen = useUiStore((s) => s.setHowItWorks);
  const router = useRouter();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    setI(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setI((v) => Math.min(STEPS.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  if (!open) return null;

  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[900] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="How Nero works"
    >
      <button
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[rgb(var(--navy-950)/0.74)] backdrop-blur-[3px]"
      />

      <div className="panel relative flex w-[min(33rem,93vw)] flex-col overflow-hidden">
        {/* real satellite band */}
        <div className="relative h-28 shrink-0 overflow-hidden bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=64,18,73,24&bboxSR=4326&imageSR=4326&size=1100,290&format=jpg&transparent=false&f=image"
            alt="Satellite view of the Arabian Sea coastline"
            className="h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--surface-1))] via-[rgb(var(--surface-1)/0.35)] to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-5 pb-3">
            <div>
              <p className="eyebrow text-[0.54rem]">The investigation</p>
              <h2 className="h-editorial text-[1.15rem] text-text">How Nero works</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="mb-0.5 grid h-7 w-7 place-items-center rounded-[5px] border border-border/80 bg-[rgb(var(--navy-950)/0.5)] text-text-subtle backdrop-blur-[2px] transition-colors hover:text-text"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* step */}
        <div className="px-6 pb-3 pt-5">
          <div className="grid h-32 place-items-center rounded-[6px] border border-border/70 bg-surface-2/50">
            <step.Visual />
          </div>

          <div className="mt-4 flex items-baseline gap-2.5">
            <span className="metric text-[0.72rem] text-accent">{step.n}</span>
            <h3 className="font-serif text-[1.05rem] text-text">{step.title}</h3>
          </div>
          <p className="mt-1.5 min-h-[3.5rem] text-[0.82rem] leading-relaxed text-text-muted">
            {step.body}
          </p>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5">
          <div className="flex gap-1.5">
            {STEPS.map((s, idx) => (
              <button
                key={s.n}
                aria-label={`Step ${idx + 1}`}
                onClick={() => setI(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === i ? "w-5 bg-accent" : "w-1.5 bg-border-strong hover:bg-text-subtle",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => (i === 0 ? setOpen(false) : setI(i - 1))}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-border px-2.5 py-1.5 text-[0.74rem] text-text-muted transition-colors hover:text-text"
            >
              {i === 0 ? "Skip" : <><ArrowLeft size={13} /> Back</>}
            </button>
            <button
              onClick={() => {
                if (!last) return setI(i + 1);
                setOpen(false);
                router.push("/dashboard");
              }}
              className="inline-flex items-center gap-1.5 border border-accent/45 bg-accent/95 px-3 py-1.5 text-[0.74rem] font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
            >
              {last ? "Open live monitoring" : <>Next <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- step visuals — restrained marine-research diagrams ------------------- */

const S = { stroke: "rgb(var(--text-subtle))", accent: "rgb(var(--accent))", oil: "rgb(var(--layer-spill))" };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 200 96" className="h-24 w-auto" role="img">
      {children}
    </svg>
  );
}

function RadarVisual() {
  return (
    <Frame>
      <rect x="40" y="14" width="120" height="68" fill="none" stroke={S.stroke} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="40" y1="30" x2="160" y2="30" stroke={S.accent} strokeWidth="1.5">
        <animate attributeName="y1" values="18;78;18" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="18;78;18" dur="3s" repeatCount="indefinite" />
      </line>
      <path d="M96 46 q10 -6 20 0 q8 8 -2 14 q-16 6 -22 -4 q-4 -8 4 -10z" fill={S.oil} opacity="0.85" />
      <text x="100" y="92" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>SENTINEL-1 · VV</text>
    </Frame>
  );
}

function SlickVisual() {
  return (
    <Frame>
      <path d="M70 50 q14 -14 34 -6 q18 8 24 22 q4 14 -16 18 q-30 4 -44 -12 q-10 -14 2 -22z" fill={S.oil} opacity="0.9" />
      <path d="M70 50 q14 -14 34 -6 q18 8 24 22 q4 14 -16 18 q-30 4 -44 -12 q-10 -14 2 -22z" fill="none" stroke={S.accent} strokeWidth="1.4" strokeDasharray="4 3" />
      {[...Array(4)].map((_, k) => (
        <circle key={k} cx={78 + k * 16} cy={54 + (k % 2) * 8} r="1.6" fill={S.accent} />
      ))}
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>SEGMENTED · CLASS · AGE</text>
    </Frame>
  );
}

function BacktrackVisual() {
  return (
    <Frame>
      <path d="M150 34 C120 30 110 58 84 54 C64 51 58 40 44 44" fill="none" stroke={S.accent} strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points="150,30 156,34 150,38" fill={S.accent} />
      <circle cx="150" cy="34" r="3" fill={S.oil} />
      <circle cx="44" cy="44" r="6" fill="none" stroke={S.accent} strokeWidth="1.2" />
      <circle cx="44" cy="44" r="2" fill={S.accent} />
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>REVERSE ADVECTION → ORIGIN</text>
    </Frame>
  );
}

function VesselVisual() {
  return (
    <Frame>
      <circle cx="60" cy="46" r="16" fill="none" stroke={S.stroke} strokeWidth="1" strokeDasharray="2 3" />
      <path d="M30 60 L150 26" stroke={S.stroke} strokeWidth="1.2" />
      <path d="M78 52 L150 60" stroke={S.stroke} strokeWidth="1.2" strokeDasharray="4 3" />
      <rect x="70" y="45" width="10" height="5" fill={S.accent} transform="rotate(-16 75 47)" />
      <circle cx="60" cy="46" r="2.4" fill={S.oil} />
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>AIS · PROXIMITY · GAP · SCORE</text>
    </Frame>
  );
}

function DriftVisual() {
  return (
    <Frame>
      <circle cx="52" cy="48" r="3" fill={S.oil} />
      {[
        "M52 48 C90 40 120 34 168 30",
        "M52 48 C92 50 126 54 170 52",
        "M52 48 C88 60 120 70 166 74",
      ].map((d, k) => (
        <path key={k} d={d} fill="none" stroke={S.accent} strokeWidth="1.3" opacity={0.8 - k * 0.18} />
      ))}
      <path d="M150 22 q18 4 20 22 q2 18 -18 26 q-30 8 -40 -14" fill={S.accent} opacity="0.08" />
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>72 H ENSEMBLE · LANDFALL ETA</text>
    </Frame>
  );
}

function ReportVisual() {
  return (
    <Frame>
      <rect x="74" y="18" width="52" height="62" rx="2" fill="rgb(var(--surface-3))" stroke={S.stroke} strokeWidth="1" />
      {[26, 34, 42, 50, 58].map((y, k) => (
        <line key={y} x1="82" y1={y} x2={k === 4 ? 104 : 118} y2={y} stroke={S.stroke} strokeWidth="1.6" />
      ))}
      <rect x="82" y="64" width="14" height="9" fill={S.accent} opacity="0.8" />
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill={S.stroke} style={{ fontFamily: "var(--font-mono)" }}>EVIDENCE-BACKED BRIEF</text>
    </Frame>
  );
}
