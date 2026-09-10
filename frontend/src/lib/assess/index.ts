/**
 * Derived classifications for the incident report — cleanup-priority level,
 * ecological-sensitivity rating, operator ownership class, and area entry/exit
 * timing. All computed from data the pipeline already produces.
 */
import type { BBox, EnvironmentalImpact, EvidenceCard, VesselStaticInfo } from "@/types/api";

export type Tone = "success" | "warning" | "danger";
export type SensitivityBand = "Low" | "Moderate" | "High" | "Critical";

/* ---------- cleanup priority ------------------------------------------------ */

export interface PriorityAssessment {
  label: "Low Priority" | "Medium Priority" | "High Priority" | "Critical Emergency";
  tone: Tone;
  score: number; // 0 to 100
  why: string;
}

/**
 * @param priorityScore  EnvironmentalImpact.priority_score (0–1)
 * @param drivers        optional context to name in the rationale
 */
export function cleanupPriority(
  priorityScore: number,
  drivers: {
    areaKm2?: number;
    growthPctPerDay?: number | null;
    distanceToCoastKm?: number | null;
    sensitivity?: SensitivityBand;
    receptorCount?: number;
  } = {},
): PriorityAssessment {
  const score = Math.round(Math.max(0, Math.min(1, priorityScore)) * 100);

  let label: PriorityAssessment["label"];
  let tone: Tone;
  if (score >= 80) {
    label = "Critical Emergency";
    tone = "danger";
  } else if (score >= 60) {
    label = "High Priority";
    tone = "danger";
  } else if (score >= 35) {
    label = "Medium Priority";
    tone = "warning";
  } else {
    label = "Low Priority";
    tone = "success";
  }

  const bits: string[] = [];
  if (drivers.sensitivity && drivers.sensitivity !== "Low") {
    bits.push(`${drivers.sensitivity.toLowerCase()} ecological sensitivity`);
  }
  if (drivers.receptorCount) {
    bits.push(`${drivers.receptorCount} sensitive receptor${drivers.receptorCount > 1 ? "s" : ""} exposed`);
  }
  if (drivers.areaKm2 && drivers.areaKm2 >= 10) {
    bits.push(`${Math.round(drivers.areaKm2)} km² slick`);
  }
  if (drivers.growthPctPerDay != null && drivers.growthPctPerDay > 5) {
    bits.push(`expanding ~${Math.round(drivers.growthPctPerDay)}%/day`);
  }
  if (drivers.distanceToCoastKm != null && drivers.distanceToCoastKm < 40) {
    bits.push(`${Math.round(drivers.distanceToCoastKm)} km from shore`);
  }

  const why = bits.length
    ? `${label}: ${bits.join(", ")}.`
    : `${label}, from the combined drift, exposure and coastal proximity score.`;

  return { label, tone, score, why };
}

/* ---------- ecological sensitivity ---------------------------------------- */

const CRITICAL_KINDS = new Set([
  "coral-reef",
  "marine-protected-area",
  "turtle-nesting",
  "mangrove",
  "seagrass",
]);

export interface SensitivityAssessment {
  label: SensitivityBand;
  tone: Tone;
  why: string;
}

export function ecologicalSensitivity(impact: EnvironmentalImpact): SensitivityAssessment {
  const rs = impact.receptors ?? [];
  const reached = rs.filter((r) => (r.likelihood ?? 0) > 0.15);
  const maxSens = Math.max(0, ...reached.map((r) => r.sensitivity ?? 0));
  const maxExp = Math.max(0, ...reached.map((r) => r.exposure ?? 0));
  const criticalHits = reached.filter((r) => CRITICAL_KINDS.has(r.kind)).length;
  const nearest = Math.min(Infinity, ...reached.map((r) => r.distance_km ?? Infinity));

  const s =
    0.45 * maxSens +
    0.3 * maxExp +
    0.15 * Math.min(1, criticalHits / 2) +
    0.1 * (Number.isFinite(nearest) && nearest < 15 ? 1 : 0);

  let label: SensitivityBand;
  let tone: Tone;
  if (s >= 0.75 || criticalHits >= 2) {
    label = "Critical";
    tone = "danger";
  } else if (s >= 0.5 || criticalHits >= 1) {
    label = "High";
    tone = "danger";
  } else if (s >= 0.28 || reached.length > 0) {
    label = "Moderate";
    tone = "warning";
  } else {
    label = "Low";
    tone = "success";
  }

  const kinds = [...new Set(reached.map((r) => r.kind.replace(/-/g, " ")))].slice(0, 3);
  const why = kinds.length
    ? `${kinds.join(", ")}${Number.isFinite(nearest) ? ` within ${Math.round(nearest)} km` : ""}; drift exposure ${Math.round(maxExp * 100)}%.`
    : "No sensitive receptor is projected to be reached by the slick.";

  return { label, tone, why };
}

/* ---------- operator ownership class ------------------------------------- */

export type OwnerClass =
  | "Naval / Coast Guard"
  | "Government"
  | "Private company"
  | "Other operator"
  | "Unknown";

export interface OwnerAssessment {
  label: OwnerClass;
  tone: Tone;
  basis: string;
}

const NAVAL_RE =
  /\b(navy|naval|warship|coast\s?guard|coastguard|hmas|hmcs|hms|uss|ins|pns|frigate|corvette|destroyer|patrol\s+(vessel|boat)|auxiliary fleet)\b/i;
const GOV_RE =
  /\b(ministry|govt|government|national|state|federal|authority|port trust|shipping corporation|maritime board|fisheries department|customs|survey of india|psu)\b/i;
const PRIVATE_RE =
  /\b(ltd|limited|inc\.?|llc|l\.l\.c|gmbh|s\.a\.|pte|plc|bhd|co\.?|corp\.?|company|shipping|maritime|tankers?|carriers?|lines?|marine|holdings?|group|enterprises?|logistics|petroleum|energy|offshore)\b/i;

export function classifyOperator(v: VesselStaticInfo): OwnerAssessment {
  const hay = `${v.owner ?? ""} ${v.operator_company ?? ""} ${v.name ?? ""}`.trim();

  if (v.vessel_type === "military" || NAVAL_RE.test(hay)) {
    return {
      label: "Naval / Coast Guard",
      tone: "danger",
      basis: v.vessel_type === "military" ? "vessel type = military" : `name/operator matches "${hay.match(NAVAL_RE)?.[0]}"`,
    };
  }
  if (GOV_RE.test(hay)) {
    return { label: "Government", tone: "warning", basis: `operator matches "${hay.match(GOV_RE)?.[0]}"` };
  }
  if (PRIVATE_RE.test(hay)) {
    return {
      label: "Private company",
      tone: "warning",
      basis: `operator "${v.operator_company ?? v.owner}" (${v.flag_state ?? "flag n/a"})`,
    };
  }
  if (v.operator_company || v.owner) {
    return { label: "Other operator", tone: "outline" as Tone, basis: `${v.operator_company ?? v.owner}` };
  }
  return { label: "Unknown", tone: "outline" as Tone, basis: "no ownership record in the registries queried" };
}

/* ---------- area entry / exit timing ----------------------------------- */

function inside(bbox: BBox, lon: number, lat: number): boolean {
  return lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north;
}

export interface AoiTransit {
  entered: string | null;
  exited: string | null;
  dwellHours: number | null;
}

/**
 * First-entered / last-exited timestamps for a vessel over a bbox, from its
 * track LineString (coordinates + aligned `times` array).
 */
export function aoiTransit(
  coords: number[][] | undefined,
  times: string[] | undefined,
  bbox: BBox,
): AoiTransit {
  if (!coords || !times || coords.length !== times.length) {
    return { entered: null, exited: null, dwellHours: null };
  }
  let entered: string | null = null;
  let exited: string | null = null;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]!;
    if (inside(bbox, c[0]!, c[1]!)) {
      if (!entered) entered = times[i]!;
      exited = times[i]!;
    }
  }
  const dwellHours =
    entered && exited
      ? Math.max(0, (new Date(exited).getTime() - new Date(entered).getTime()) / 3.6e6)
      : null;
  return { entered, exited, dwellHours };
}

/* ---------- vessel movement timeline ---------------------------------- */

export interface VesselEvent {
  key: string;
  label: string;
  at: string | null;
  tone: "muted" | "accent" | "danger";
  note?: string;
}

/**
 * Ordered "where was this vessel, when" chronology around the spill — first fix,
 * area-of-interest entry, closest approach to the estimated origin (the spill-time
 * anchor), area exit, last known position.
 */
export function vesselTimeline(card: EvidenceCard, aoi?: BBox): VesselEvent[] {
  const track = (card.track?.features ?? []).find(
    (f) => f.geometry?.type === "LineString",
  );
  const coords = (track?.geometry as { coordinates?: number[][] } | undefined)?.coordinates;
  const times = (track?.properties as { times?: string[] } | undefined)?.times ?? [];
  const first = times[0] ?? null;
  const last = times[times.length - 1] ?? null;
  const transit = aoi ? aoiTransit(coords, times, aoi) : { entered: null, exited: null, dwellHours: null };

  const evs: VesselEvent[] = [
    { key: "first", label: "First AIS fix in window", at: first, tone: "muted" },
    { key: "enter", label: "Entered area of interest", at: transit.entered, tone: "accent" },
    {
      key: "spill",
      label: "Closest approach to estimated origin",
      at: card.closest_approach_at ?? null,
      tone: "danger",
      note:
        card.closest_approach_km != null
          ? `${card.closest_approach_km.toFixed(1)} km from origin (spill-time anchor)`
          : "spill-time anchor",
    },
    {
      key: "exit",
      label: "Exited area of interest",
      at: transit.exited,
      tone: "accent",
      note: transit.dwellHours != null ? `${transit.dwellHours.toFixed(1)} h inside the area` : undefined,
    },
    { key: "last", label: "Last known position", at: last, tone: "muted" },
  ];
  return evs.filter((e) => e.at);
}
