"use client";

import { create } from "zustand";
import { api, ApiError, API_BASE_URL } from "@/lib/api/client";
import type { InvestigationReport } from "@/types/api";

const PHASES = [
  "Collating module outputs",
  "Classifying cause",
  "Drafting sections",
  "Rendering report",
] as const;

interface ReportState {
  byDetection: Record<string, InvestigationReport>;
  running: string | null;
  phase: string | null;
  error: string | null;
  phases: readonly string[];
  run: (detectionId: string, investigationId?: string) => Promise<void>;
  forDetection: (detectionId: string) => InvestigationReport | null;
  printUrl: (reportId: string) => string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useReportStore = create<ReportState>((set, get) => ({
  byDetection: {},
  running: null,
  phase: null,
  error: null,
  phases: PHASES,

  run: async (detectionId, investigationId) => {
    if (get().running) return;
    set({ running: detectionId, error: null, phase: PHASES[0] });
    try {
      await wait(80);
      set({ phase: PHASES[1] });
      await wait(80);
      set({ phase: PHASES[2] });
      const report = await api<InvestigationReport>("/reports", {
        method: "POST",
        body: JSON.stringify({
          detection_id: detectionId,
          investigation_id: investigationId ?? null,
        }),
      });
      set({ phase: PHASES[3] });
      await wait(80);
      set((s) => ({
        byDetection: { ...s.byDetection, [detectionId]: report },
        running: null,
        phase: null,
      }));
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "report failed";
      set({ running: null, phase: null, error: msg });
    }
  },

  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,
  printUrl: (reportId) => `${API_BASE_URL}/v1/reports/${reportId}/render.html`,
}));
