"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type {
  DetectionRequest,
  SceneRef,
  SpillDetection,
  SpillTimeline,
} from "@/types/api";
import { useLayersStore } from "./layers";

type Phase =
  | "sar-retrieval"
  | "preprocess"
  | "segmentation"
  | "eo-validation"
  | "geometry"
  | "characterisation";

export const DETECTION_PHASES: { key: Phase; label: string }[] = [
  { key: "sar-retrieval", label: "Sentinel-1 SAR retrieval" },
  { key: "preprocess", label: "SAR preprocessing" },
  { key: "segmentation", label: "AI segmentation" },
  { key: "eo-validation", label: "Sentinel-2 EO validation" },
  { key: "geometry", label: "Boundary vectorisation" },
  { key: "characterisation", label: "Characterisation" },
];

interface DetectionState {
  /** keyed by scenario id (M6 will key by investigation id) */
  byScenario: Record<string, SpillDetection>;
  scenes: Record<string, SceneRef[]>;
  timelines: Record<string, SpillTimeline>;
  running: string | null;
  phase: Phase | null;
  error: string | null;
  run: (scenarioId: string, req: DetectionRequest) => Promise<void>;
  loadScenes: (scenarioId: string) => Promise<void>;
  loadTimeline: (detectionId: string) => Promise<void>;
  forScenario: (scenarioId: string) => SpillDetection | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useDetectionStore = create<DetectionState>((set, get) => ({
  byScenario: {},
  scenes: {},
  timelines: {},
  running: null,
  phase: null,
  error: null,

  run: async (scenarioId, req) => {
    if (get().running) return;
    set({ running: scenarioId, error: null, phase: "sar-retrieval" });
    try {
      // brief staged progress so the operator sees the pipeline work
      for (const p of ["preprocess", "segmentation", "eo-validation"] as Phase[]) {
        await wait(80);
        set({ phase: p });
      }
      const detection = await api<SpillDetection>("/detection/run", {
        method: "POST",
        body: JSON.stringify(req),
      });
      set({ phase: "geometry" });
      await wait(80);
      set({ phase: "characterisation" });
      await wait(80);
      set((s) => ({
        byScenario: { ...s.byScenario, [scenarioId]: detection },
        running: null,
        phase: null,
      }));
      useLayersStore.getState().markLive(["spill", "spill-edge"]);
      useLayersStore.getState().setVisible("spill", true);
      useLayersStore.getState().setVisible("spill-edge", true);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "detection failed";
      set({ running: null, phase: null, error: msg });
    }
  },

  loadScenes: async (scenarioId) => {
    if (get().scenes[scenarioId]) return;
    try {
      const scenes = await api<SceneRef[]>("/detection/scenes", {
        params: { scenario: scenarioId },
      });
      set((s) => ({ scenes: { ...s.scenes, [scenarioId]: scenes } }));
    } catch {
      /* imagery pane simply stays empty */
    }
  },

  loadTimeline: async (detectionId) => {
    if (get().timelines[detectionId]) return;
    try {
      const tl = await api<SpillTimeline>(`/detection/${detectionId}/timeline`);
      set((s) => ({ timelines: { ...s.timelines, [detectionId]: tl } }));
    } catch {
      /* leave unset */
    }
  },

  forScenario: (scenarioId) => get().byScenario[scenarioId] ?? null,
}));
