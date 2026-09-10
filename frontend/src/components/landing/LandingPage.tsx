"use client";

import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Crosshair,
  FileText,
  Radar,
  Ship,
  Waves,
} from "lucide-react";
import { SiteNav } from "@/components/layout/SiteNav";
import { TourAutoStart } from "@/components/layout/TourAutoStart";

// aerial photograph of crude oil on the sea surface — the sheen is the identity
const HERO_IMG = "/hero-ocean.webp";

const PIPELINE = [
  { icon: Radar, label: "Observe", note: "Satellite & AIS data" },
  { icon: Crosshair, label: "Detect", note: "Spot anomalies" },
  { icon: Waves, label: "Backtrack", note: "Reconstruct movement" },
  { icon: Ship, label: "Identify Vessel", note: "Match with AIS & records" },
  { icon: BrainCircuit, label: "AI Investigation", note: "Analyse & find source" },
  { icon: FileText, label: "Generate Report", note: "Evidence & recommendations" },
];

export function LandingPage() {
  return (
    <div className="landing">
      <TourAutoStart />
      <SiteNav />

      <main className="landing-hero relative">
        {/* the oil sheen photograph is the visual identity */}
        <div aria-hidden className="landing-ocean">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_IMG} alt="" className="landing-ocean-img" />
          <span className="ocean-shimmer" />
        </div>

        {/* one screen: headline block, then the pipeline pinned to the base */}
        <div className="hero-frame relative z-10 mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-[1240px] flex-col px-8">
          <div className="flex flex-1 flex-col justify-center pt-4">
            <p className="text-[0.63rem] font-semibold uppercase tracking-[0.34em] text-[var(--l-cyan)]">
              Ocean Intelligence
            </p>

            <h1 className="hero-h1 mt-5 font-display text-[clamp(2.4rem,4.9vw,3.85rem)] leading-[1.07] text-[var(--l-ivory)]">
              <span className="oil-cap">
                E<i className="drip drip-1" />
                <i className="drip drip-2" />
              </span>
              very Oil Spill
              <br />
              Leaves Evidence.
              <br />
              <span className="hero-accent text-[var(--l-cyan)]">We Find It.</span>
            </h1>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="cta-primary group inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[0.82rem] font-semibold tracking-[0.01em]"
              >
                Launch Investigation
                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>

          {/* ---- the intelligence pipeline, along the base of the hero --- */}
          <div className="pipeline-strip pb-7 pt-5">
            <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-6">
              <ol className="flex flex-wrap items-start gap-x-1 gap-y-5">
                {PIPELINE.map(({ icon: Icon, label, note }, i) => (
                  <li key={label} className="flex items-start">
                    <div className="flex w-[7.4rem] flex-col items-center text-center">
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(244,239,232,0.28)] text-[var(--l-ivory)]">
                        <Icon size={15} strokeWidth={1.5} />
                      </span>
                      <span className="mt-2.5 text-[0.78rem] font-medium leading-tight text-[rgba(244,239,232,0.94)]">
                        {label}
                      </span>
                      <span className="mt-1 text-[0.62rem] leading-tight text-[rgba(244,239,232,0.44)]">
                        {note}
                      </span>
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <ArrowRight
                        size={13}
                        className="mt-[14px] shrink-0 text-[rgba(244,239,232,0.3)]"
                      />
                    )}
                  </li>
                ))}
              </ol>

              <div className="pb-1 text-right">
                <span className="block h-px w-10 bg-[rgba(114,214,214,0.55)]" />
                <p className="mt-2 text-[0.6rem] font-medium uppercase leading-[1.7] tracking-[0.24em] text-[rgba(244,239,232,0.5)]">
                  Cleaner oceans.
                  <br />
                  Safer tomorrows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
