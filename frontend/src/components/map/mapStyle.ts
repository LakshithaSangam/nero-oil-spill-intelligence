import type { StyleSpecification } from "maplibre-gl";
import type { BBox } from "@/types/api";

/**
 * Base map style. Several keyless raster basemaps stacked in one style; exactly
 * one is visible at a time (switched in the Layers panel → Map style). Defaults
 * to "Natural" — a true-colour physical map (green/tan land, sandy arid zones,
 * depth-shaded ocean) so the map reads like a real atlas. "Abyssal" keeps the
 * dark chart look. Analysis layers (spill, drift, AIS) sit above; a light navy
 * tint overlay (per-basemap strength) is a CSS blend in <MapCanvasImpl>.
 */
export type BasemapId = "natural" | "atlas" | "satellite" | "abyssal" | "light";

const ESRI = "https://services.arcgisonline.com/arcgis/rest/services";

export const BASE_STYLE: StyleSpecification = {
  version: 8,
  name: "Nero basemaps",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    // physiographic true-colour: green lowlands → tan uplands → sand deserts,
    // ocean shaded by real bathymetry. No labels. Crisp to ~z8, over-zoomed after.
    "esri-physical": {
      type: "raster",
      tiles: [`${ESRI}/World_Physical_Map/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 8,
      attribution: "Esri · U.S. National Park Service",
    },
    // National Geographic style: same natural land/ocean palette + light place
    // and ocean labels, and it stays sharp all the way in.
    "esri-natgeo": {
      type: "raster",
      tiles: [`${ESRI}/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Esri · National Geographic · Garmin · HERE · UNEP-WCMC · USGS · NASA · ESA · METI · NRCAN · GEBCO · NOAA",
    },
    "esri-ocean": {
      type: "raster",
      tiles: [`${ESRI}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 9,
      attribution: "Esri · GEBCO · NOAA · National Geographic · and other contributors",
    },
    "esri-imagery": {
      type: "raster",
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri · Maxar · Earthstar Geographics · and the GIS User Community",
    },
    "esri-gray": {
      type: "raster",
      tiles: [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Esri · HERE · Garmin · FAO · NOAA · USGS",
    },
  },
  layers: [
    // ocean-blue ground so tile gaps / over-zoom read as water, not a black void
    { id: "ground", type: "background", paint: { "background-color": "#1C4257" } },
    // Natural — true-colour physical atlas (default)
    {
      id: "basemap-natural",
      type: "raster",
      source: "esri-physical",
      paint: {
        "raster-opacity": 1,
        "raster-saturation": 0.34,
        "raster-contrast": 0.22,
        "raster-brightness-min": 0.04,
      },
    },
    // Atlas — National Geographic, with labels, sharp at high zoom
    {
      id: "basemap-atlas",
      type: "raster",
      source: "esri-natgeo",
      layout: { visibility: "none" },
      paint: { "raster-opacity": 1, "raster-saturation": 0.05 },
    },
    // true satellite imagery — nudged toward an intelligence-console read
    {
      id: "basemap-satellite",
      type: "raster",
      source: "esri-imagery",
      layout: { visibility: "none" },
      paint: {
        "raster-opacity": 1,
        "raster-saturation": -0.1,
        "raster-contrast": 0.1,
        "raster-brightness-min": 0.06,
        "raster-brightness-max": 0.94,
      },
    },
    // Abyssal — deep, low-key dark chart
    {
      id: "basemap",
      type: "raster",
      source: "esri-ocean",
      layout: { visibility: "none" },
      paint: {
        "raster-opacity": 0.58,
        "raster-saturation": -0.5,
        "raster-contrast": 0.05,
        "raster-brightness-min": 0.015,
        "raster-brightness-max": 0.46,
        "raster-hue-rotate": -8,
      },
    },
    // clean light canvas
    {
      id: "basemap-light",
      type: "raster",
      source: "esri-gray",
      layout: { visibility: "none" },
      paint: { "raster-opacity": 0.95 },
    },
  ],
};

/** id → the map layer that carries it, plus how strong the navy tint overlay should be */
export const BASEMAPS: Record<BasemapId, { layer: string; label: string; tint: number }> = {
  natural: { layer: "basemap-natural", label: "Natural", tint: 0.06 },
  atlas: { layer: "basemap-atlas", label: "Atlas", tint: 0.05 },
  satellite: { layer: "basemap-satellite", label: "Satellite", tint: 0.1 },
  abyssal: { layer: "basemap", label: "Abyssal", tint: 1 },
  light: { layer: "basemap-light", label: "Light", tint: 0 },
};

export const GRATICULE_SOURCE = "oe-graticule";
export const AOI_SOURCE = "oe-aoi";
export const SPILL_SOURCE = "oe-spill";
export const ORIGIN_SOURCE = "oe-origin";
export const HINDCAST_SOURCE = "oe-hindcast";
export const FORECAST_SOURCE = "oe-forecast";
export const COAST_SOURCE = "oe-coast";
export const AIS_SOURCE = "oe-ais";
export const TIMELINE_SOURCE = "oe-timeline";
export const TIMELINE_SLICK_SOURCE = "oe-timeline-slick";
export const HEAT_SOURCE = "oe-heat";
export const INCIDENT_SOURCE = "oe-incidents";

/** 1° graticule over the Indian Ocean working region. */
export function graticuleGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lon = 40; lon <= 110; lon += 1) {
    features.push({
      type: "Feature",
      properties: { major: lon % 5 === 0 },
      geometry: { type: "LineString", coordinates: [[lon, -10], [lon, 40]] },
    });
  }
  for (let lat = -10; lat <= 40; lat += 1) {
    features.push({
      type: "Feature",
      properties: { major: lat % 5 === 0 },
      geometry: { type: "LineString", coordinates: [[40, lat], [110, lat]] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function bboxPolygon(b: BBox): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  };
}

/** Resolve a CSS token (space-separated RGB channels) to an rgb() string for MapLibre. */
export function tokenColor(name: string, alpha = 1): string {
  if (typeof window === "undefined") return "#5FE3D0";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!raw) return "#5FE3D0";
  return alpha === 1 ? `rgb(${raw})` : `rgba(${raw} / ${alpha})`;
}
