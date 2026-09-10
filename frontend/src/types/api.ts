/**
 * Backend API types.
 *
 * Generated from the FastAPI OpenAPI schema:  `npm run gen:types`
 * (requires the backend running on http://localhost:8000).
 *
 * Until first generation, hand-written mirrors of the M0 contracts live here so the
 * app type-checks offline. Replace wholesale once codegen runs.
 */

export interface Health {
  status: string;
  version: string;
  time: string;
}

export interface ProviderHealth {
  state: "ok" | "degraded" | "unavailable" | "mock";
  checked_at: string;
  latency_ms?: number | null;
  detail: string;
}

export interface ProviderInfo {
  id: string;
  domain: "imagery" | "incidents" | "oceanography" | "ais";
  display_name: string;
  is_mock: boolean;
  is_active: boolean;
  docs_url?: string | null;
  capabilities: Record<string, unknown>;
  health?: ProviderHealth | null;
}

export interface ProviderRegistrySnapshot {
  selection: Record<string, string>;
  providers: ProviderInfo[];
}

export interface LonLat {
  lon: number;
  lat: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Incident {
  id: string;
  source: string;
  name: string;
  location: LonLat;
  reported_at: string;
  severity: "minor" | "moderate" | "major" | "catastrophic" | "unknown";
  status: "reported" | "confirmed" | "responding" | "recovered" | "archived";
  substance?: string | null;
  estimated_volume_bbl?: number | null;
  description: string;
  external_url?: string | null;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  summary: string;
  aoi: BBox;
  origin_hint: LonLat;
  incident: Incident;
  tags: string[];
}

// ---- imagery ----
export type Sensor =
  | "sentinel-1-sar"
  | "sentinel-2-eo"
  | "generic-sar"
  | "generic-optical";

export interface SceneRef {
  id: string;
  provider_id: string;
  sensor: Sensor;
  acquired_at: string;
  bbox: BBox;
  polarisations: string[];
  cloud_cover_pct?: number | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
}

// ---- Module 1 · detection ----
export interface Confidence {
  score: number;
  rationale: string;
}

export interface GeoJSONGeometry {
  type:
    | "Point"
    | "MultiPoint"
    | "LineString"
    | "MultiLineString"
    | "Polygon"
    | "MultiPolygon";
  coordinates: unknown;
}

export type OilType =
  | "crude"
  | "heavy-fuel-oil"
  | "light-refined"
  | "bilge-oily-water"
  | "vegetable-or-biogenic"
  | "unknown";

export type SpillTrend = "new" | "expanding" | "stable" | "recovering" | "unknown";

export interface SpillGeometry {
  polygon: GeoJSONGeometry;
  bbox: BBox;
  area_km2: number;
  perimeter_km: number;
  centroid: [number, number];
  slick_length_km?: number | null;
  fragment_count: number;
}

export interface SpillCharacterisation {
  estimated_volume_bbl_low: number;
  estimated_volume_bbl_high: number;
  oil_type: OilType;
  oil_type_confidence: Confidence;
  spill_age_hours_low: number;
  spill_age_hours_high: number;
  thickness_class:
    | "sheen"
    | "rainbow"
    | "metallic"
    | "discontinuous"
    | "continuous";
}

export interface SpillDetection {
  id: string;
  incident_id?: string | null;
  detected_at: string;
  sar_scene_id: string;
  eo_scene_id?: string | null;
  eo_validated: boolean;
  geometry: SpillGeometry;
  characterisation: SpillCharacterisation;
  detection_confidence: Confidence;
  false_positive_checks: string[];
  trend: SpillTrend;
  segmentation_model_id: string;
  segmentation_notes: string;
}

export interface DetectionRequest {
  incident_id?: string | null;
  bbox: BBox;
  at?: string | null;
  segmentation_model?: "mock" | "classical-sar" | "trained-unet" | null;
  scenario?: string | null;
}

// ---- Advanced 1 + 2 · historical timeline & recovery ----
export interface SpillTimelineEntry {
  scene_id: string;
  sensor: string;
  acquired_at: string;
  area_km2: number;
  perimeter_km: number;
  centroid: [number, number];
  area_delta_pct?: number | null;
}

export interface RecoveryAnalysis {
  baseline_scene_id: string;
  latest_scene_id: string;
  baseline_area_km2: number;
  peak_area_km2: number;
  latest_area_km2: number;
  reduction_from_peak_pct: number;
  cleaned_area_km2: number;
  remaining_area_km2: number;
  assessment: string;
}

export interface SpillTimeline {
  detection_id: string;
  entries: SpillTimelineEntry[];
  trend: SpillTrend;
  trend_rationale: string;
  recovery?: RecoveryAnalysis | null;
}

// ---- Module 2 · ocean intelligence ----
export interface GeoJSONFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface OriginEstimate {
  point: LonLat;
  probability_surface: GeoJSONFeatureCollection;
  release_window: TimeRange;
  confidence: Confidence;
  method: string;
}

export interface HindcastResult {
  detection_id: string;
  origin: OriginEstimate;
  backtrack_paths: GeoJSONFeatureCollection;
}

export interface DriftScenario {
  id: string;
  label: string;
  probability: number;
  track: GeoJSONFeatureCollection;
  forcing_note: string;
}

export interface AffectedCoast {
  name: string;
  geometry: GeoJSONFeatureCollection;
  eta?: string | null;
  likelihood: number;
}

export interface ForecastResult {
  detection_id: string;
  horizon_hours: number;
  scenarios: DriftScenario[];
  expected_area_km2_by_hour: Record<string, number>;
  affected_coasts: AffectedCoast[];
  /** environmental forcings combined for this drift run */
  forcing_factors?: string[];
}

// ---- surface wind field (map wind layer) ----
export interface WindVector {
  lon: number;
  lat: number;
  speed_ms: number;
  /** going-to bearing, degrees clockwise from true north */
  direction_deg: number;
}

export interface WindFieldResponse {
  bbox: BBox;
  valid_at: string;
  source: string;
  cols: number;
  rows: number;
  points: WindVector[];
}

export interface CurrentVector {
  lon: number;
  lat: number;
  speed_ms: number;
  /** going-to bearing, degrees clockwise from true north */
  direction_deg: number;
}

export interface CurrentFieldResponse {
  bbox: BBox;
  valid_at: string;
  source: string;
  cols: number;
  rows: number;
  points: CurrentVector[];
}

export interface TempSample {
  lon: number;
  lat: number;
  /** 2 m air temperature, degrees Celsius */
  temp_c: number;
}

export interface TempFieldResponse {
  bbox: BBox;
  valid_at: string;
  source: string;
  cols: number;
  rows: number;
  points: TempSample[];
}

export interface DriftAnalysisRequest {
  detection_id: string;
  horizon_hours?: number;
  ensemble_size?: number;
}

// ---- Module 3 · investigation ----
export type VesselType =
  | "tanker"
  | "cargo"
  | "bulk-carrier"
  | "container"
  | "fishing"
  | "passenger"
  | "tug"
  | "offshore"
  | "military"
  | "pleasure"
  | "other"
  | "unknown";

export interface VesselStaticInfo {
  mmsi: string;
  imo?: string | null;
  name?: string | null;
  call_sign?: string | null;
  vessel_type: VesselType;
  length_m?: number | null;
  beam_m?: number | null;
  flag_state?: string | null;
  owner?: string | null;
  operator_company?: string | null;
  home_port?: string | null;
  cargo_declared?: string | null;
  prior_violations?: number | null;
}

export type EvidenceKind =
  | "proximity"
  | "ais_gap"
  | "drift_alignment"
  | "speed_anomaly"
  | "course_deviation"
  | "cargo_match"
  | "time_correlation"
  | "route_deviation"
  | "behavioural_anomaly"
  | "prior_history";

export type EvidencePolarity = "incriminating" | "mitigating" | "neutral";

export interface EvidenceFactor {
  kind: EvidenceKind;
  polarity: EvidencePolarity;
  weight: number;
  summary: string;
  detail: string;
  value?: number | string | null;
}

export interface EvidenceCard {
  vessel: VesselStaticInfo;
  suspicion_score: number;
  rank: number;
  closest_approach_km?: number | null;
  closest_approach_at?: string | null;
  track: GeoJSONFeatureCollection;
  factors: EvidenceFactor[];
  narrative: string;
  confidence: Confidence;
}

export interface SuspectRanking {
  detection_id: string;
  origin_window_used: string;
  candidates_considered: number;
  cards: EvidenceCard[];
}

export interface InvestigationRequest {
  detection_id: string;
  search_radius_km?: number;
  window_padding_hours?: number;
}

// ---- environmental (v1) ----
export type ReceptorKind =
  | "coral-reef"
  | "mangrove"
  | "marine-protected-area"
  | "fishery"
  | "coastline"
  | "seagrass"
  | "turtle-nesting"
  | "desalination-intake";

export interface ReceptorThreat {
  receptor_id: string;
  name: string;
  kind: ReceptorKind;
  geometry: GeoJSONFeatureCollection;
  eta?: string | null;
  distance_km: number;
  likelihood: number;
  sensitivity: number;
  exposure: number;
  response_note: string;
}

export interface EnvironmentalImpact {
  detection_id: string;
  priority_score: number;
  affected_area_km2_estimate: number;
  /** "Dense" / "Moderate" / "Sparse" marine life around the spill */
  marine_biodiversity?: string;
  /** estimated % of local marine life affected (0..100) */
  marine_life_affected_pct?: number;
  marine_life_note?: string;
  receptors: ReceptorThreat[];
  receptor_summary: Record<string, number>;
  estimated_cleanup_cost_usd_low: number;
  estimated_cleanup_cost_usd_high: number;
  estimated_liability_usd_low: number;
  estimated_liability_usd_high: number;
  response_guidance: string[];
  notes: string;
}

// ---- report ----
export type SpillCause =
  | "illegal-bilge-dumping"
  | "cargo-leak"
  | "tanker-collision"
  | "pipeline-rupture"
  | "offshore-drilling-incident"
  | "maintenance-discharge"
  | "unknown";

/** confidence 0..1 per broad cause category (Shipping accident, Offshore drilling, …) */
export interface CauseAssessment {
  category_confidence?: Record<string, number>;
  cause: SpillCause;
  probability: number;
  supporting_evidence: string[];
  alternatives: Record<string, number>;
}

export interface ReportSection {
  key: string;
  title: string;
  body_markdown: string;
}

export interface InvestigationReport {
  id: string;
  detection_id: string;
  investigation_id?: string | null;
  incident_id?: string | null;
  generated_at: string;
  title: string;
  executive_summary: string;
  cause: CauseAssessment;
  lead_suspect_mmsi?: string | null;
  detection: SpillDetection;
  hindcast: HindcastResult;
  forecast: ForecastResult;
  suspects: SuspectRanking;
  environmental?: EnvironmentalImpact | null;
  sections: ReportSection[];
  disclaimer: string;
}

export interface ReportRequest {
  detection_id: string;
  investigation_id?: string | null;
  format?: "json" | "html";
}

// ---- Module 11 · multi-agent orchestration ----
export type AgentPhase =
  | "satellite"
  | "ocean"
  | "vessel"
  | "investigation"
  | "environmental"
  | "report";

export type AgentStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface AgentEvent {
  phase: AgentPhase;
  status: AgentStatus;
  at: string;
  message: string;
  progress?: number | null;
}

export type RunStatus = "running" | "complete" | "failed";

export interface InvestigationRun {
  id: string;
  label: string;
  scenario_id: string;
  incident_id?: string | null;
  created_at: string;
  finished_at?: string | null;
  status: RunStatus;
  current_phase?: AgentPhase | null;
  completed_phases: AgentPhase[];
  detection_id?: string | null;
  report_id?: string | null;
  lead_suspect_mmsi?: string | null;
  cause?: string | null;
  events: AgentEvent[];
}

export interface InvestigationRunSummary {
  id: string;
  label: string;
  scenario_id: string;
  incident_id?: string | null;
  created_at: string;
  status: RunStatus;
  current_phase?: AgentPhase | null;
  detection_id?: string | null;
  report_id?: string | null;
  lead_suspect_mmsi?: string | null;
  cause?: string | null;
}

export interface CreateInvestigationRequest {
  scenario_id?: string | null;
  incident_id?: string | null;
  label?: string | null;
}

// ---- Advanced 5 + 6 · pollution risk index ----
export type RiskTier = "low" | "elevated" | "high" | "critical";

export interface RiskFactor {
  key: string;
  label: string;
  direction: "raises" | "lowers";
  weight: number;
  detail: string;
  value?: number | string | null;
}

export interface MicroLeakEvent {
  date: string;
  location: LonLat;
  area_km2?: number | null;
  confidence: number;
  note: string;
}

export interface VesselRiskScore {
  mmsi: string;
  name?: string | null;
  vessel_type: string;
  flag_state?: string | null;
  risk_score: number;
  tier: RiskTier;
  headline: string;
  recurring_pollution: boolean;
  micro_leak_count: number;
  prior_violations: number;
  /** signature split: repeated small operational leaks vs risk of a major spill (sum to 1) */
  micro_leak_share: number;
  major_leak_share: number;
  leak_split_note: string;
  updated_at: string;
}

export interface VesselRiskProfile extends VesselRiskScore {
  vessel: VesselStaticInfo;
  factors: RiskFactor[];
  micro_leaks: MicroLeakEvent[];
  linked_event_notes: string[];
}

export interface FleetRiskIndex {
  generated_at: string;
  vessels: VesselRiskScore[];
}

// ---- Advanced 9 · spill similarity search ----
export interface SimilarCase {
  id: string;
  name: string;
  date: string;
  location: LonLat;
  area_km2: number;
  oil_type: string;
  cause: string;
  likely_vessel_type?: string | null;
  outcome: string;
  source: string;
  similarity_score: number;
  matched_features: string[];
}

export interface SimilaritySearchResult {
  detection_id: string;
  query_summary: string;
  cases: SimilarCase[];
  inferred_cause: string;
  inferred_cause_confidence: number;
  inferred_vessel_type?: string | null;
  narrative: string;
}

// ---- Advanced 10 · maritime knowledge graph ----
export interface GraphNode {
  id: string;
  kind: string;
  group: string;
  ring: number;
  label: string;
  sublabel: string;
  score?: number | null;
  detail: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
}

export interface KnowledgeGraph {
  detection_id: string;
  generated_at: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---- Investigation extension · responsible party & notification ----
export type OrgType =
  | "private_company"
  | "government"
  | "naval_coast_guard"
  | "other_operator"
  | "unknown";
export type RecipientKind = "company" | "authority";
export type NotificationStatus = "draft" | "reviewed" | "sent";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  generated_at: string;
}

export interface ResponsibleParty {
  detection_id: string;
  investigation_id?: string | null;
  vessel_mmsi?: string | null;
  vessel_name?: string | null;
  vessel_imo?: string | null;
  organization: string;
  org_type: OrgType;
  country?: string | null;
  confidence: number;
  basis: string;
  sources_checked: string[];
  recipient_kind: RecipientKind;
  recipient_name: string;
  contact_email: string;
  authority_note: string;
  email_draft: EmailDraft;
  status: NotificationStatus;
  disclaimer: string;
}

// ---- Advanced 8 · vessel & company dossier ----
export interface InvestigationAppearance {
  detection_id: string;
  rank: number;
  suspicion_score: number;
  closest_approach_km?: number | null;
  top_factors: string[];
  narrative: string;
}

export interface VesselDossier {
  vessel: VesselStaticInfo;
  risk: VesselRiskProfile;
  appearances: InvestigationAppearance[];
  history_notes: string[];
  behaviour_summary: string;
  assessment: string;
}
