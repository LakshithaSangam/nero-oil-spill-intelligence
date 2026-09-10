"use client";

import { useEffect, useRef } from "react";

/**
 * A calm deep-ocean field for the pages that have no map. Slow swell bands and a
 * few soft light reflections drifting on a long period — something noticed
 * subconsciously, never demanding attention. ~30 fps, DPR-capped, pauses when
 * hidden, and holds a single still frame under reduced-motion.
 *
 * Never rendered behind the live map (that canvas IS the ocean there).
 */

const FPS = 30;

export function OceanAtmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    const V = (name: string, fb: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      const navy = V("--navy-900", "10 24 38");
      const abyss = V("--navy-950", "6 17 28");
      const teal = V("--teal-700", "24 90 84");
      const light = V("--accent-strong", "122 196 184");

      // depth gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `rgb(${navy})`);
      bg.addColorStop(0.55, `rgb(${abyss})`);
      bg.addColorStop(1, `rgb(${abyss})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // slow swell bands — long sine, gentle vertical bob
      for (let i = 0; i < 3; i++) {
        const phase = t * 0.00003 * (1 + i * 0.35) + i * 2.1;
        const yBase = h * (0.28 + i * 0.24) + Math.sin(phase) * 26;
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 28) {
          const y =
            yBase +
            Math.sin(x * 0.0016 + phase * 3) * 14 +
            Math.sin(x * 0.0041 + phase * 5) * 6;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - 60, 0, yBase + 120);
        g.addColorStop(0, `rgb(${teal} / ${0.05 - i * 0.012})`);
        g.addColorStop(1, `rgb(${teal} / 0)`);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // drifting surface reflections — soft, irregular, low contrast
      for (let i = 0; i < 4; i++) {
        const dx = ((t * 0.006 * (0.4 + i * 0.2) + i * 620) % (w + 400)) - 200;
        const dy = h * (0.15 + i * 0.2) + Math.sin(t * 0.00004 + i) * 18;
        const r = 150 + i * 60;
        const rg = ctx.createRadialGradient(dx, dy, 0, dx, dy, r);
        const a = (0.04 - i * 0.006) * (0.7 + 0.3 * Math.sin(t * 0.00012 + i * 1.7));
        rg.addColorStop(0, `rgb(${light} / ${Math.max(a, 0)})`);
        rg.addColorStop(1, `rgb(${light} / 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(dx, dy, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduce) {
      draw(0);
      return () => window.removeEventListener("resize", resize);
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      if (!document.hidden) draw(now);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="fixed inset-0 -z-10" />;
}
