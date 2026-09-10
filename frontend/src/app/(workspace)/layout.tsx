"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AppRail } from "@/components/layout/AppRail";
import { TopBar } from "@/components/layout/TopBar";
import { useUiStore } from "@/store/ui";
import { TimelineBar } from "@/components/layout/TimelineBar";
import { PresenterMode } from "@/components/layout/PresenterMode";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { IntelPanel } from "@/components/panels/IntelPanel";
import { MapCanvas } from "@/components/map/MapCanvas";
import { AcquisitionZone } from "@/components/map/AcquisitionZone";
import { AmbientScan } from "@/components/map/AmbientScan";
import { OriginLabel } from "@/components/map/OriginLabel";
import { CurrentField } from "@/components/map/CurrentField";
import { WindField } from "@/components/map/WindField";
import { TempField } from "@/components/map/TempField";
import { SarQuicklook } from "@/components/map/SarQuicklook";
import { LayerPanel } from "@/components/map/LayerPanel";
import { MapControls } from "@/components/map/MapControls";
import { useScenarioStore } from "@/store/scenario";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useInvestigationStore } from "@/store/investigation";
import { useInvestigationRunStore } from "@/store/investigationRun";
import { useEnvironmentalStore } from "@/store/environmental";
import { useReportStore } from "@/store/report";
import { useRiskStore } from "@/store/risk";
import { useSimilarityStore } from "@/store/similarity";
import { useGraphStore } from "@/store/graph";
import { useDossierStore } from "@/store/dossier";
import { useTimelineStore } from "@/store/timeline";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";

// Scenarios we have already auto-started a demo run for this session, so a
// route change never kicks a second one.
const demoStarted = new Set<string>();

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const load = useScenarioStore((s) => s.load);
  const activeScenarioId = useScenarioStore((s) => s.activeId);
  const rehydrate = useInvestigationRunStore((s) => s.rehydrateForScenario);

  // Demo mode: every workspace route (dashboard, vessels, responsible party, and
  // each investigation tab) should show real content without the visitor having
  // to run anything. First replay the newest finished run for the active
  // scenario into the module stores; if there is none, start one automatically
  // (it finishes in ~1 to 2 s and hydrates every store, including the
  // responsible-party step). Existing/running runs are left alone.
  useEffect(() => {
    if (!activeScenarioId) return;
    let cancelled = false;
    void (async () => {
      await rehydrate(activeScenarioId);
      if (cancelled) return;
      const runs = useInvestigationRunStore.getState();
      const hasRun = runs.list.some(
        (r) =>
          r.scenario_id === activeScenarioId &&
          (r.status === "complete" || r.status === "running"),
      );
      if (hasRun || demoStarted.has(activeScenarioId)) return;
      demoStarted.add(activeScenarioId);
      const id = await runs.create({ scenario_id: activeScenarioId });
      // create() serializes behind any in-flight run; only a genuine failure
      // returns null — clear the guard so a later visit to this scenario retries
      // rather than being left with no drift forecast / replay timeline.
      if (!id) demoStarted.delete(activeScenarioId);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeScenarioId, rehydrate]);

  useEffect(() => {
    void load();
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window as unknown as Record<string, unknown>, {
        __oe: {
          scenario: useScenarioStore,
          detection: useDetectionStore,
          ocean: useOceanStore,
          investigation: useInvestigationStore,
          investigationRun: useInvestigationRunStore,
          environmental: useEnvironmentalStore,
          report: useReportStore,
          risk: useRiskStore,
          similarity: useSimilarityStore,
          graph: useGraphStore,
          dossier: useDossierStore,
          timeline: useTimelineStore,
          layers: useLayersStore,
          map: useMapStore,
        },
      });
    }
  }, [load]);

  const layersOpen = useUiStore((s) => s.layersOpen);
  const setLayersOpen = useUiStore((s) => s.setLayersOpen);

  // "P" anywhere in the workspace launches the hands-free presenter brief
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const ui = useUiStore.getState();
      ui.setPresenter(!ui.presenterOn);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <AppRail />

        <div className="relative flex-1">
          <MapCanvas />
          <SarQuicklook />
          <TempField />
          <CurrentField />
          <WindField />
          <AmbientScan />
          <AcquisitionZone />
          <OriginLabel />

          {/* chrome overlay */}
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-3">
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="pointer-events-auto flex">
                <WorkspacePanel>{children}</WorkspacePanel>
              </div>

              <div className="flex-1" />

              <div className="pointer-events-auto flex shrink-0 items-start gap-3">
                <div className="flex flex-col items-end gap-3 self-end">
                  <MapControls />
                </div>
                <IntelPanel />
              </div>
            </div>

            <div className="pointer-events-auto flex flex-col gap-2">
              <TimelineBar />
            </div>
          </div>

          <PresenterMode />

          {/* layers / legend — opened from the top bar */}
          {layersOpen && (
            <div className="pointer-events-auto absolute right-3 top-3 z-20 flex items-start gap-2">
              <LayerPanel />
              <button
                onClick={() => setLayersOpen(false)}
                aria-label="Close layers"
                className="panel grid h-8 w-8 shrink-0 place-items-center text-text-subtle hover:text-text"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
