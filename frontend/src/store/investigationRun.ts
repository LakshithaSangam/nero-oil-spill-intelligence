"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import { hydrateFromRun } from "@/lib/hydrate";
import type {
  AgentEvent,
  CreateInvestigationRequest,
  InvestigationRun,
  InvestigationRunSummary,
} from "@/types/api";

interface RunState {
  runs: Record<string, InvestigationRun>;
  events: Record<string, AgentEvent[]>;
  list: InvestigationRunSummary[];
  activeRunId: string | null;
  creating: boolean;
  error: string | null;
  create: (req: CreateInvestigationRequest) => Promise<string | null>;
  subscribe: (runId: string) => void;
  loadList: () => Promise<void>;
  rehydrateForScenario: (scenarioId: string) => Promise<void>;
  runForScenario: (scenarioId: string) => InvestigationRun | null;
}

const polling = new Set<string>();
const hydrated = new Set<string>();
const finished = new Set<string>();

type SetFn = (fn: (s: RunState) => Partial<RunState>) => void;

function finalise(runId: string, set: SetFn, finalRun: InvestigationRun) {
  if (finished.has(runId)) return;
  finished.add(runId);
  set((s) => ({ runs: { ...s.runs, [runId]: finalRun } }));
  if (finalRun.status === "complete" && !hydrated.has(runId)) {
    hydrated.add(runId);
    void hydrateFromRun(finalRun);
  }
}

export const useInvestigationRunStore = create<RunState>((set, get) => ({
  runs: {},
  events: {},
  list: [],
  activeRunId: null,
  creating: false,
  error: null,

  create: async (req) => {
    // Serialize concurrent creates instead of dropping them: the workspace
    // auto-starts a demo run per scenario and a visitor can switch scenarios
    // faster than a ~1–2 s run finishes. Without the queue, every scenario
    // after the first silently gets no run — and therefore no drift forecast,
    // so its replay timeline never appears.
    for (let waited = 0; get().creating && waited < 60; waited++) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (get().creating) return null; // something is genuinely stuck
    set({ creating: true, error: null });
    try {
      const run = await api<InvestigationRun>("/investigations", {
        method: "POST",
        body: JSON.stringify(req),
      });
      set((s) => ({
        runs: { ...s.runs, [run.id]: run },
        events: { ...s.events, [run.id]: [] },
        activeRunId: run.id,
        creating: false,
      }));
      get().subscribe(run.id);
      void get().loadList();
      return run.id;
    } catch (e) {
      set({
        creating: false,
        error: e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "failed to start",
      });
      return null;
    }
  },

  // The agent workflow finishes server-side in ~1–2 s. Rather than an SSE stream
  // (which quick-tunnel / proxy layers love to buffer, making it feel frozen),
  // poll the run every 400 ms and push the growing `events[]` straight through —
  // robust over a flaky connection, and fast because the run is already quick.
  subscribe: (runId) => {
    if (polling.has(runId) || finished.has(runId)) return;
    polling.add(runId);

    let tries = 0;
    const tick = async () => {
      if (finished.has(runId)) return;
      tries += 1;
      try {
        const r = await api<InvestigationRun>(`/investigations/${runId}`);
        set((s) => ({ events: { ...s.events, [runId]: r.events } }));
        if (r.status !== "running") {
          polling.delete(runId);
          finalise(runId, set, r);
          void get().loadList();
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (tries > 150) {
        polling.delete(runId);
        return; // give up after ~60 s
      }
      window.setTimeout(tick, 400);
    };
    void tick();
  },

  loadList: async () => {
    try {
      set({ list: await api<InvestigationRunSummary[]>("/investigations") });
    } catch {
      /* keep previous list */
    }
  },

  // On a fresh load / deep link the module stores are empty. Pull the newest
  // finished run for this scenario and replay it into the stores so the map and
  // every tab reflect it — without this you'd have to re-run after every refresh.
  rehydrateForScenario: async (scenarioId) => {
    const active = get().activeRunId;
    if (active && get().runs[active]?.status === "running") return;

    let list: InvestigationRunSummary[];
    try {
      list = await api<InvestigationRunSummary[]>("/investigations");
    } catch {
      return;
    }
    set({ list });

    const latest = list
      .filter((r) => r.scenario_id === scenarioId && r.status === "complete")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest || hydrated.has(latest.id)) return;

    try {
      const full = await api<InvestigationRun>(`/investigations/${latest.id}`);
      hydrated.add(full.id);
      finished.add(full.id);
      set((s) => ({
        runs: { ...s.runs, [full.id]: full },
        activeRunId: s.activeRunId ?? full.id,
      }));
      await hydrateFromRun(full);
    } catch {
      /* ignore — the tabs still work once a run is started manually */
    }
  },

  runForScenario: (scenarioId) => {
    const runs = Object.values(get().runs).filter((r) => r.scenario_id === scenarioId);
    return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  },
}));
