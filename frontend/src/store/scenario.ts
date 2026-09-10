"use client";

import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { ScenarioSummary } from "@/types/api";

interface ScenarioState {
  scenarios: ScenarioSummary[];
  activeId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  setActive: (id: string | null) => void;
  active: () => ScenarioSummary | null;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [],
  activeId: null,
  loading: false,
  loaded: false,
  error: null,
  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const scenarios = await api<ScenarioSummary[]>("/scenarios");
      set({
        scenarios,
        loaded: true,
        loading: false,
        activeId: get().activeId ?? scenarios[0]?.id ?? null,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "failed to load scenarios" });
    }
  },
  setActive: (activeId) => set({ activeId }),
  active: () => {
    const { scenarios, activeId } = get();
    return scenarios.find((s) => s.id === activeId) ?? null;
  },
}));
