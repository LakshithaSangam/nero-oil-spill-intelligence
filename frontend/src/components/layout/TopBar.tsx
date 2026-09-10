"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, HelpCircle, Layers, Moon, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandBar } from "@/components/layout/CommandBar";
import { useUiStore } from "@/store/ui";

function stamp() {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

export function TopBar() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleLayers = useUiStore((s) => s.toggleLayers);
  const layersOpen = useUiStore((s) => s.layersOpen);
  const openSettings = useUiStore((s) => s.setSettings);
  const setHowItWorks = useUiStore((s) => s.setHowItWorks);
  const [{ date, time }, setNow] = useState(stamp);

  useEffect(() => {
    const t = setInterval(() => setNow(stamp()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="z-40 flex h-[54px] shrink-0 items-center gap-4 border-b border-border/70 bg-[rgb(var(--navy-950)/0.72)] px-4 backdrop-blur-[8px]">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <WaveMark />
        <span className="leading-none">
          <span className="block font-display text-[0.98rem] tracking-[0.2em] text-text">NERO</span>
          <span className="mt-1 block whitespace-nowrap text-[0.46rem] font-semibold uppercase tracking-[0.24em] text-text-subtle">
            Cleaner seas · Safer tomorrows
          </span>
        </span>
      </Link>

      <div className="mx-auto w-full max-w-[34rem] px-4">
        <CommandBar />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <IconBtn label="How it works" onClick={() => setHowItWorks(true)}>
          <HelpCircle size={15} />
        </IconBtn>
        <IconBtn label="Map layers" active={layersOpen} onClick={toggleLayers}>
          <Layers size={15} />
        </IconBtn>
        <IconBtn label="Notifications" onClick={() => {}}>
          <span className="relative">
            <Bell size={15} />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </IconBtn>
        <IconBtn label="Account" onClick={() => openSettings(true)}>
          <UserRound size={15} />
        </IconBtn>

        <span className="mx-2 hidden text-right leading-tight sm:block">
          <span suppressHydrationWarning className="block text-[0.62rem] text-text-muted">
            {date}
          </span>
          <span suppressHydrationWarning className="tnum block text-[0.62rem] text-text">
            {time} UTC
          </span>
        </span>

        <IconBtn label="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </IconBtn>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[8px] border transition-colors",
        active
          ? "border-accent/45 bg-accent/[0.12] text-accent"
          : "border-border/60 text-text-subtle hover:border-border-strong/70 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function WaveMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
      <path
        d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="12" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
