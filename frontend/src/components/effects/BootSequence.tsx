"use client";

import { useEffect, useState } from "react";

/**
 * Opening sequence: a deep-ocean hold with an illustrated oil drum that tilts and
 * leaks, then the spill floods outward and resolves into the interface. Dark by
 * design — it reads as the system coming online, never a white takeover.
 *
 * Ocean → oil → flood → monitoring.  Shown once per tab.
 */

type Phase = "field" | "flood" | "done";

export function BootSequence() {
  // Start in "field" on both server and client so hydration matches; the effect
  // (client only) decides whether to skip straight past it.
  const [phase, setPhase] = useState<Phase>("field");

  useEffect(() => {
    let alreadyBooted = false;
    try {
      alreadyBooted = !!sessionStorage.getItem("neuro:booted");
    } catch {
      /* private mode / storage blocked — just play it */
    }
    if (alreadyBooted) {
      setPhase("done");
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const holdField = reduce ? 500 : 2400;
    const floodMs = reduce ? 260 : 780;

    const t1 = setTimeout(() => setPhase("flood"), holdField);
    const t2 = setTimeout(() => {
      try {
        sessionStorage.setItem("neuro:booted", "1");
      } catch {
        /* ignore */
      }
      setPhase("done");
    }, holdField + floodMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden
      data-phase={phase}
      className="boot fixed inset-0 z-[999] grid place-items-center overflow-hidden"
    >
      <div className="boot-ground absolute inset-0" />

      <figure className="boot-stage relative flex flex-col items-center gap-7">
        <Drum />
        <figcaption className="boot-caption text-center">
          <span className="block text-[0.68rem] uppercase tracking-[0.32em] text-text-subtle">
            Nero · Marine Intelligence
          </span>
          <span className="mt-2 block font-serif text-[0.98rem] italic text-text-muted">
            Preparing ocean observations
          </span>
        </figcaption>
      </figure>

      {/* the spill that floods the screen and becomes the ocean */}
      <div className="boot-flood absolute left-1/2 top-[46%]" />
    </div>
  );
}

function Drum() {
  return (
    <svg
      className="boot-drum"
      width="132"
      height="150"
      viewBox="0 0 132 150"
      role="img"
      aria-label="Illustrated oil drum leaking"
    >
      <defs>
        <pattern id="boot-dither" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="transparent" />
          <rect width="1" height="1" fill="rgb(255 255 255 / 0.05)" />
        </pattern>
      </defs>

      {/* cast shadow */}
      <ellipse cx="66" cy="132" rx="42" ry="7" fill="rgb(0 0 0 / 0.35)" />

      <g className="boot-drum-body">
        {/* body */}
        <path d="M28 34 h76 v84 h-76 z" fill="rgb(var(--rust))" />
        {/* right-side shade — flat step */}
        <path d="M78 34 h26 v84 h-26 z" fill="rgb(var(--rust-dark))" />
        {/* left highlight strip */}
        <path d="M28 34 h9 v84 h-9 z" fill="rgb(255 255 255 / 0.10)" />
        {/* rib bands */}
        <rect x="28" y="54" width="76" height="5" fill="rgb(var(--rust-dark))" />
        <rect x="28" y="92" width="76" height="5" fill="rgb(var(--rust-dark))" />
        {/* dither for the restrained illustrated grain */}
        <path d="M28 34 h76 v84 h-76 z" fill="url(#boot-dither)" />
        {/* top ellipse + bung */}
        <ellipse cx="66" cy="34" rx="38" ry="9" fill="rgb(var(--rust))" stroke="rgb(var(--rust-dark))" strokeWidth="2" />
        <ellipse cx="52" cy="33" rx="5" ry="2.4" fill="rgb(var(--rust-dark))" />
        {/* blocky outline — warm chalk line, reads on the dark ground */}
        <path
          d="M28 34 h76 v84 h-76 z"
          fill="none"
          stroke="rgb(var(--sand-200) / 0.45)"
          strokeWidth="2.5"
          strokeLinejoin="miter"
        />
      </g>

      {/* leaking oil — grows from the base */}
      <path
        className="boot-drum-oil"
        d="M40 118 q4 8 14 9 q12 1 18 -3 q10 -5 20 -1 q10 4 6 12 q-6 10 -28 11 q-30 1 -40 -13 q-6 -9 10 -13 z"
        fill="rgb(var(--oil))"
      />
    </svg>
  );
}
