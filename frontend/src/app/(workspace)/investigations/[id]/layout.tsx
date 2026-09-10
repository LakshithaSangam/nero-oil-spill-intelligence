"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { getInvestigation, INVESTIGATION_TABS } from "@/lib/mock/investigations";
import { useScenarioStore } from "@/store/scenario";
import { useInvestigationRunStore } from "@/store/investigationRun";

export default function InvestigationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const inv = getInvestigation(params.id);
  const pathname = usePathname();
  const base = `/investigations/${params.id}`;
  const setActive = useScenarioStore((s) => s.setActive);
  const rehydrate = useInvestigationRunStore((s) => s.rehydrateForScenario);

  useEffect(() => {
    if (!inv?.scenarioId) return;
    setActive(inv.scenarioId);
    void rehydrate(inv.scenarioId);
  }, [inv?.scenarioId, setActive, rehydrate]);

  if (!inv) {
    return (
      <div className="p-4">
        <Link href="/investigations" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent">
          <ArrowLeft size={13} /> Investigations
        </Link>
        <p className="mt-4 text-sm text-text-muted">
          No investigation <span className="tnum text-text">{params.id}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        eyebrow={inv.id}
        title={inv.title}
        subtitle={inv.region}
        actions={
          <Link
            href="/investigations"
            aria-label="Back to investigations"
            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-text-subtle hover:text-text"
          >
            <ArrowLeft size={14} />
          </Link>
        }
      />

      <div className="flex gap-4 overflow-x-auto border-b border-border px-4">
        {INVESTIGATION_TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = t.slug
            ? pathname === href
            : pathname === base || pathname === `${base}/`;
          return (
            <Link
              key={t.slug || "overview"}
              href={href}
              className={cn(
                "shrink-0 border-b py-2 text-[0.74rem] tracking-wide transition-colors",
                active
                  ? "border-accent text-text"
                  : "border-transparent text-text-subtle hover:text-text-muted",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
