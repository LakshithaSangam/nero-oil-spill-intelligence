/**
 * Client-side mirror of the backend Data Provider Layer.
 *
 * The authoritative registry lives in the backend (app/providers). This mirror lets
 * the dashboard render the "Data Providers" screen and switch replay scenarios even
 * with no backend running. It NEVER talks to a real provider. Mock data only.
 */

export type ProviderDomain = "imagery" | "incidents" | "oceanography" | "ais";

export interface ClientProviderInfo {
  id: string;
  domain: ProviderDomain;
  displayName: string;
  isMock: boolean;
  role: "primary" | "fallback" | "alternate" | "ground truth" | "mock";
  docsUrl?: string;
  note: string;
}

export const CLIENT_PROVIDER_CATALOG: ClientProviderInfo[] = [
  // ---- imagery ----
  { id: "mock", domain: "imagery", displayName: "Mock Imagery (scenario replay)", isMock: true, role: "mock", note: "Deterministic SAR/EO scenes for the replay scenarios." },
  { id: "copernicus-dataspace", domain: "imagery", displayName: "Copernicus Data Space Ecosystem", isMock: false, role: "primary", docsUrl: "https://dataspace.copernicus.eu/", note: "Sentinel 1 radar is primary; Sentinel 2 optical for validation." },
  { id: "sentinel-hub", domain: "imagery", displayName: "Sentinel Hub", isMock: false, role: "alternate", docsUrl: "https://www.sentinel-hub.com/", note: "Processing API for S1/S2 tiles." },
  { id: "nasa-earthdata", domain: "imagery", displayName: "NASA Earthdata", isMock: false, role: "alternate", docsUrl: "https://earthdata.nasa.gov/", note: "Broad EO/SAR archive." },
  { id: "usgs-earthexplorer", domain: "imagery", displayName: "USGS EarthExplorer", isMock: false, role: "alternate", docsUrl: "https://earthexplorer.usgs.gov/", note: "Landsat plus supplementary optical." },

  // ---- incidents (ground truth) ----
  { id: "mock", domain: "incidents", displayName: "Mock Incident Catalog", isMock: true, role: "mock", note: "Scenario incidents plus a few historical reference cases." },
  { id: "noaa", domain: "incidents", displayName: "NOAA Marine Pollution Monitoring", isMock: false, role: "ground truth", docsUrl: "https://www.ospo.noaa.gov/products/ocean/marinepollution/", note: "Known spill locations, dates and severity, used to check detections and for replay. Not an imagery source." },

  // ---- oceanography ----
  { id: "mock", domain: "oceanography", displayName: "Mock Ocean Fields (analytic)", isMock: true, role: "mock", note: "Analytic flow field for the monsoon season." },
  { id: "copernicus-marine", domain: "oceanography", displayName: "Copernicus Marine Service", isMock: false, role: "primary", docsUrl: "https://marine.copernicus.eu/", note: "Currents, wind, waves, SST, tide." },
  { id: "open-meteo-marine", domain: "oceanography", displayName: "Open-Meteo Marine API", isMock: false, role: "fallback", docsUrl: "https://open-meteo.com/en/docs/marine-weather-api", note: "Keyless fallback for the forcing fields." },

  // ---- ais ----
  { id: "mock", domain: "ais", displayName: "Mock AIS Reconstruction", isMock: true, role: "mock", note: "Deterministic fleet including one suspect that goes dark." },
  { id: "marine-cadastre", domain: "ais", displayName: "MarineCadastre (NAIS archive)", isMock: false, role: "alternate", docsUrl: "https://marinecadastre.gov/ais/", note: "Bulk historical AIS for US waters." },
  { id: "global-fishing-watch", domain: "ais", displayName: "Global Fishing Watch", isMock: false, role: "alternate", docsUrl: "https://globalfishingwatch.org/our-apis/", note: "Events API: encounters, loitering, gaps." },
];

export const PROVIDER_DOMAINS: ProviderDomain[] = [
  "imagery",
  "incidents",
  "oceanography",
  "ais",
];
