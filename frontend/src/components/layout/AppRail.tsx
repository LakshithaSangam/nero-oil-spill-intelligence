"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radar, Scale, Ship, SlidersHorizontal, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

// labels are presentation only — the routes are unchanged
const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/investigations", label: "Investigations", icon: Radar },
  { href: "/incidents", label: "Reports", icon: Waves },
  { href: "/vessels", label: "Vessels", icon: Ship },
  { href: "/responsible-party", label: "Response", icon: Scale },
];

export function AppRail() {
  const pathname = usePathname();
  const openSettings = useUiStore((s) => s.setSettings);

  return (
    <nav className="z-30 flex w-[84px] shrink-0 flex-col items-center border-r border-border/70 bg-[rgb(var(--navy-950)/0.6)] py-5 backdrop-blur-[7px]">
      <div className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex w-[64px] flex-col items-center gap-1.5 rounded-[10px] py-2.5 transition-all duration-fast",
                active
                  ? "bg-accent/[0.1] text-accent shadow-[0_0_16px_-6px_rgb(var(--accent)/0.6)]"
                  : "text-text-subtle hover:bg-surface-3/40 hover:text-text-muted",
              )}
            >
              {active && (
                <span className="absolute -left-[10px] top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent)/0.7)]" />
              )}
              <Icon size={17} strokeWidth={1.75} />
              <span className="text-[0.56rem] font-medium tracking-[0.06em]">{label}</span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={() => openSettings(true)}
        aria-label="Settings"
        className="mt-2 flex w-[64px] flex-col items-center gap-1.5 rounded-[10px] py-2.5 text-text-subtle transition-colors duration-fast hover:bg-surface-3/40 hover:text-text"
      >
        <SlidersHorizontal size={17} strokeWidth={1.75} />
        <span className="text-[0.56rem] font-medium tracking-[0.06em]">Settings</span>
      </button>
    </nav>
  );
}
