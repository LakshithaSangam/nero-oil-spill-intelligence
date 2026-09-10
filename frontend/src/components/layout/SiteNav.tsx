"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud, Clock, HelpCircle, Radio, Satellite, SlidersHorizontal, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

// labels are presentation only — the routes are unchanged
const LINKS = [
  { href: "/", label: "Mission" },
  { href: "/dashboard", label: "Live Intelligence" },
  { href: "/investigations", label: "Investigations" },
  { href: "/incidents", label: "Reports" },
  { href: "/about", label: "About Nero" },
];

function utcNow() {
  return new Date().toISOString().slice(11, 16);
}

const chipCls =
  "hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[0.56rem] uppercase tracking-[0.12em] text-[rgba(244,239,232,0.6)]";

export function SiteNav() {
  const pathname = usePathname();
  const [utc, setUtc] = useState<string>("--:--");
  const openSettings = useUiStore((s) => s.setSettings);
  const openHowItWorks = useUiStore((s) => s.setHowItWorks);

  useEffect(() => {
    setUtc(utcNow());
    const t = setInterval(() => setUtc(utcNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="landing sticky top-0 z-40 w-full border-b border-[rgba(244,239,232,0.1)] bg-[rgba(10,28,38,0.88)]">
      <nav className="mx-auto flex h-[4.25rem] max-w-[1240px] items-center gap-5 px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="leading-none">
            <span className="block font-display text-[1.05rem] tracking-[0.16em] text-[var(--l-ivory)]">
              NERO
            </span>
            <span className="mt-1 hidden whitespace-nowrap text-[0.46rem] font-semibold uppercase tracking-[0.22em] text-[rgba(244,239,232,0.4)] sm:block">
              AI Maritime Intelligence Platform
            </span>
          </span>
        </Link>

        <ul className="hidden shrink-0 items-center gap-5 md:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  data-active={active}
                  className={cn(
                    "landing-nav-link text-[0.83rem] tracking-[0.01em] transition-colors duration-200",
                    active
                      ? "text-[var(--l-ivory)]"
                      : "text-[rgba(244,239,232,0.56)] hover:text-[rgba(244,239,232,0.92)]",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <span className={cn(chipCls, "border-[rgba(244,239,232,0.14)] 2xl:inline-flex")}>
            <Item icon={<Radio size={10} />} label="AIS Live" />
            <span className="h-3 w-px bg-[rgba(244,239,232,0.16)]" />
            <Item icon={<Satellite size={10} />} label="Satellite" />
          </span>

          <span className={cn(chipCls, "border-[rgba(244,239,232,0.14)] xl:inline-flex")}>
            <Clock size={10} className="text-[rgba(114,214,214,0.7)]" />
            <span className="tnum tracking-normal">UTC {utc}</span>
          </span>

          <span className={cn(chipCls, "border-[rgba(244,239,232,0.14)] 2xl:inline-flex")}>
            <Item icon={<Waves size={10} />} label="Currents" />
            <span className="h-3 w-px bg-[rgba(244,239,232,0.16)]" />
            <Item icon={<Cloud size={10} />} label="Weather" />
          </span>

          <button
            onClick={() => openHowItWorks(true)}
            className="hidden items-center gap-1.5 rounded-full border border-[rgba(244,239,232,0.16)] px-3 py-1.5 text-[0.72rem] text-[rgba(244,239,232,0.72)] transition-colors hover:border-[rgba(114,214,214,0.5)] hover:text-[var(--l-ivory)] sm:inline-flex"
          >
            <HelpCircle size={13} />
            How it works
          </button>

          <button
            onClick={() => openSettings(true)}
            aria-label="Settings"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] text-[rgba(244,239,232,0.5)] transition-colors hover:bg-[rgba(244,239,232,0.1)] hover:text-[var(--l-ivory)]"
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </nav>
    </header>
  );
}

function Item({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[rgba(114,214,214,0.7)]">{icon}</span>
      {label}
    </span>
  );
}

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--l-cyan)]">
      <path
        d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.42"
      />
      <circle cx="12" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
