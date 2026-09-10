/**
 * Client-side investigation index for M1.
 *
 * An investigation binds an incident/scenario to a run of the pipeline. Until the
 * backend owns this (milestone M6, `POST /v1/investigations`), the list is seeded
 * here so the workspace, list and sub-tab routing are navigable.
 */

export type StageKey =
  | "detection"
  | "ocean"
  | "vessels"
  | "environment"
  | "report";

export type StageStatus = "pending" | "queued" | "running" | "complete" | "blocked";

export interface InvestigationStage {
  key: StageKey;
  status: StageStatus;
}

export interface InvestigationSummary {
  id: string;
  title: string;
  scenarioId: string | null;
  incidentId: string | null;
  region: string;
  openedAt: string;
  priority: "routine" | "elevated" | "urgent";
  lead: string;
  stages: InvestigationStage[];
}

const allPending: InvestigationStage[] = [
  { key: "detection", status: "pending" },
  { key: "ocean", status: "pending" },
  { key: "vessels", status: "pending" },
  { key: "environment", status: "pending" },
  { key: "report", status: "pending" },
];

export const SEED_INVESTIGATIONS: InvestigationSummary[] = [
  {
    id: "INV-2026-0428",
    title: "Arabian Sea shipping lane discharge",
    scenarioId: "arabian-sea-discharge",
    incidentId: "noaa-2026-arb-0421",
    region: "Arabian Sea · W of Gujarat",
    openedAt: "2026-08-28T09:40:00Z",
    priority: "elevated",
    lead: "Duty Analyst, MRCC Mumbai",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-0517",
    title: "Bunker overfill off Vadinar, Gulf of Kutch",
    scenarioId: "kutch-bunker-overfill",
    incidentId: "noaa-2026-kutch-0517",
    region: "Gulf of Kutch · Vadinar",
    openedAt: "2026-09-03T08:20:00Z",
    priority: "elevated",
    lead: "Duty Analyst, MRCC Mumbai",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-0604",
    title: "Anchorage bilge discharge, outer Mumbai roads",
    scenarioId: "mumbai-anchorage-bilge",
    incidentId: "noaa-2026-mum-0604",
    region: "Mumbai · outer anchorage",
    openedAt: "2026-09-06T05:05:00Z",
    priority: "routine",
    lead: "Environmental Watch",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-0428B",
    title: "Persistent wellhead sheen, Bombay High",
    scenarioId: "bombay-high-microleak",
    incidentId: "noaa-2026-bh-0428",
    region: "Bombay High field",
    openedAt: "2026-09-01T09:15:00Z",
    priority: "elevated",
    lead: "Offshore Compliance Cell",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-1187",
    title: "HFO band across the Maas approaches TSS",
    scenarioId: "north-sea-bunker-spill",
    incidentId: "cnsn-2026-ns-1187",
    region: "North Sea · Maas approaches",
    openedAt: "2026-09-08T07:30:00Z",
    priority: "elevated",
    lead: "Netherlands Coastguard, Den Helder",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-1402",
    title: "Crude slick over a Delta flowline corridor",
    scenarioId: "gulf-mexico-flowline",
    incidentId: "nrc-2026-1402233",
    region: "Gulf of Mexico · Mississippi Delta",
    openedAt: "2026-09-09T04:05:00Z",
    priority: "urgent",
    lead: "USCG Sector New Orleans",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-0642",
    title: "Linear oily-water trail, Malta–Sicily channel",
    scenarioId: "sicily-strait-bilge",
    incidentId: "rempec-2026-med-0642",
    region: "Mediterranean · Sicily Strait",
    openedAt: "2026-09-07T06:40:00Z",
    priority: "routine",
    lead: "Italian Coast Guard, Rome MRCC",
    stages: allPending.map((s) => ({ ...s })),
  },
  {
    id: "INV-2026-0392",
    title: "Recurrent sheen off the Gulf of Kutch",
    scenarioId: null,
    incidentId: "noaa-2021-arb-0088",
    region: "Gulf of Kutch",
    openedAt: "2026-08-19T05:10:00Z",
    priority: "routine",
    lead: "Environmental Watch",
    stages: allPending.map((s) => ({ ...s })),
  },
];

export function getInvestigation(id: string): InvestigationSummary | undefined {
  return SEED_INVESTIGATIONS.find((i) => i.id === id);
}

export const INVESTIGATION_TABS: { slug: string; label: string; milestone: string }[] = [
  { slug: "", label: "Overview", milestone: "M1" },
  { slug: "detection", label: "Detection", milestone: "M2" },
  { slug: "ocean", label: "Ocean intelligence", milestone: "M3" },
  { slug: "vessels", label: "Vessels", milestone: "M4" },
  { slug: "environment", label: "Environment", milestone: "M7+" },
  { slug: "timeline", label: "Timeline", milestone: "M5" },
  { slug: "knowledge-graph", label: "Knowledge graph", milestone: "M7+" },
  { slug: "report", label: "Report", milestone: "M5" },
];
