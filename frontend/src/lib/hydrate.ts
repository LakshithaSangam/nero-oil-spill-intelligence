/**
 * Hydrate the client module stores from a finished agent run, so the map and every
 * tab reflect a workflow that ran server-side — as if you'd stepped through it.
 */

import { api } from "@/lib/api/client";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useInvestigationStore } from "@/store/investigation";
import { useEnvironmentalStore } from "@/store/environmental";
import { useReportStore } from "@/store/report";
import { useSimilarityStore } from "@/store/similarity";
import { useLayersStore } from "@/store/layers";
import type {
  EnvironmentalImpact,
  ForecastResult,
  HindcastResult,
  InvestigationReport,
  InvestigationRun,
  SimilaritySearchResult,
  SpillDetection,
  SuspectRanking,
} from "@/types/api";

export async function hydrateFromRun(run: InvestigationRun): Promise<void> {
  const did = run.detection_id;
  if (!did) return;

  const [detection, hindcast, forecast, ranking, impact, report, similar] =
    await Promise.all([
      api<SpillDetection>(`/detection/${did}`).catch(() => null),
      api<HindcastResult>(`/ocean/hindcast/${did}`).catch(() => null),
      api<ForecastResult>(`/ocean/forecast/${did}`).catch(() => null),
      api<SuspectRanking>(`/investigation/${did}`).catch(() => null),
      api<EnvironmentalImpact>(`/environment/${did}`).catch(() => null),
      run.report_id
        ? api<InvestigationReport>(`/reports/${run.report_id}`).catch(() => null)
        : Promise.resolve(null),
      api<SimilaritySearchResult>(`/similarity/${did}`).catch(() => null),
    ]);

  const layers = useLayersStore.getState();

  if (detection) {
    useDetectionStore.setState((s) => ({
      byScenario: { ...s.byScenario, [run.scenario_id]: detection },
    }));
    layers.markLive(["spill", "spill-edge"]);
    layers.setVisible("spill", true);
    layers.setVisible("spill-edge", true);
  }
  if (hindcast || forecast) {
    useOceanStore.setState((s) => ({
      byDetection: {
        ...s.byDetection,
        [did]: {
          ...s.byDetection[did],
          ...(hindcast ? { hindcast } : {}),
          ...(forecast ? { forecast } : {}),
        },
      },
    }));
    layers.markLive(["hindcast", "origin", "forecast"]);
    for (const id of ["hindcast", "origin", "forecast"]) layers.setVisible(id, true);
  }
  if (ranking) {
    useInvestigationStore.setState((s) => ({
      byDetection: { ...s.byDetection, [did]: ranking },
      focusMmsi: ranking.cards[0]?.vessel.mmsi ?? null,
    }));
    layers.markLive(["ais", "suspects"]);
    layers.setVisible("ais", true);
    layers.setVisible("suspects", true);
  }
  if (impact) {
    useEnvironmentalStore.setState((s) => ({
      byDetection: { ...s.byDetection, [did]: impact },
    }));
    layers.markLive(["protected"]);
    layers.setVisible("protected", true);
  }
  if (report) {
    useReportStore.setState((s) => ({
      byDetection: { ...s.byDetection, [did]: report },
    }));
  }
  if (similar) {
    useSimilarityStore.setState((s) => ({
      byDetection: { ...s.byDetection, [did]: similar },
    }));
  }
}
