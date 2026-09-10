"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type { ForecastResult, HindcastResult } from "@/types/api";
import { useLayersStore } from "./layers";

export const HINDCAST_PHASES = [
  "Ocean field retrieval",
  "Age-grading the slick",
  "Reverse advection",
  "Origin surface",
] as const;

export const FORECAST_PHASES = [
  "Ocean field retrieval",
  "Forcing ensemble",
  "Forward advection",
  "Landfall analysis",
] as const;

interface OceanEntry {
  hindcast?: HindcastResult;
  forecast?: ForecastResult;
}

interface OceanState {
  byDetection: Record<string, OceanEntry>;
  running: "hindcast" | "forecast" | null;
  phase: string | null;
  error: string | null;
  runHindcast: (detectionId: string) => Promise<void>;
  runForecast: (detectionId: string, horizonHours?: number) => Promise<void>;
  entry: (detectionId: string) => OceanEntry;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function staged<T>(
  phases: readonly string[],
  set: (p: string) => void,
  work: () => Promise<T>,
): Promise<T> {
  set(phases[0]!);
  await wait(80);
  set(phases[1]!);
  await wait(80);
  set(phases[2]!);
  const result = await work();
  set(phases[3]!);
  await wait(80);
  return result;
}

export const useOceanStore = create<OceanState>((set, get) => ({
  byDetection: {},
  running: null,
  phase: null,
  error: null,

  runHindcast: async (detectionId) => {
    if (get().running) return;
    set({ running: "hindcast", error: null });
    try {
      const hc = await staged(HINDCAST_PHASES, (p) => set({ phase: p }), () =>
        api<HindcastResult>("/ocean/hindcast", {
          method: "POST",
          body: JSON.stringify({ detection_id: detectionId }),
        }),
      );
      set((s) => ({
        byDetection: {
          ...s.byDetection,
          [detectionId]: { ...s.byDetection[detectionId], hindcast: hc },
        },
        running: null,
        phase: null,
      }));
      useLayersStore.getState().markLive(["hindcast", "origin"]);
      useLayersStore.getState().setVisible("hindcast", true);
      useLayersStore.getState().setVisible("origin", true);
    } catch (e) {
      set({ running: null, phase: null, error: msg(e) });
    }
  },

  runForecast: async (detectionId, horizonHours = 72) => {
    if (get().running) return;
    set({ running: "forecast", error: null });
    try {
      const fc = await staged(FORECAST_PHASES, (p) => set({ phase: p }), () =>
        api<ForecastResult>("/ocean/forecast", {
          method: "POST",
          body: JSON.stringify({ detection_id: detectionId, horizon_hours: horizonHours }),
        }),
      );
      set((s) => ({
        byDetection: {
          ...s.byDetection,
          [detectionId]: { ...s.byDetection[detectionId], forecast: fc },
        },
        running: null,
        phase: null,
      }));
      useLayersStore.getState().markLive(["forecast"]);
      useLayersStore.getState().setVisible("forecast", true);
    } catch (e) {
      set({ running: null, phase: null, error: msg(e) });
    }
  },

  entry: (detectionId) => get().byDetection[detectionId] ?? {},
}));

function msg(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "ocean analysis failed";
}
