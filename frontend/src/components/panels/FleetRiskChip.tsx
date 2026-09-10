"use client";

import { useEffect } from "react";
import { useRiskStore } from "@/store/risk";
import type { RiskTier } from "@/types/api";

const TONE: Record<RiskTier, string> = {
  low: "border-border text-text-subtle",
  elevated: "border-warning/30 text-warning",
  high: "border-danger/30 text-danger",
  critical: "border-danger/40 text-danger",
};

/** Cross-links a suspect to its standing Pollution Risk Index tier. */
export function FleetRiskChip({ mmsi }: { mmsi: string }) {
  const loadProfile = useRiskStore((s) => s.loadProfile);
  const profile = useRiskStore((s) => s.profiles[mmsi]);
  const fromIndex = useRiskStore((s) =>
    s.index?.vessels.find((v) => v.mmsi === mmsi),
  );
  const entry = profile ?? fromIndex;

  useEffect(() => {
    void loadProfile(mmsi);
  }, [mmsi, loadProfile]);

  if (!entry) return null;
  return (
    <span
      className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONE[entry.tier]}`}
      title={`Fleet pollution risk: ${Math.round(entry.risk_score * 100)}%`}
    >
      risk {entry.tier}
    </span>
  );
}
