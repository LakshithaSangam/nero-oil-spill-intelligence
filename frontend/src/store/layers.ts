"use client";

import { create } from "zustand";

export type LayerGroup = "base" | "detection" | "drift" | "vessels" | "environment";

export interface LayerDef {
  id: string;
  label: string;
  group: LayerGroup;
  /** token colour name for the legend swatch, e.g. "layer-origin" */
  swatch: string;
  /** one line explaining what this element on the map means */
  desc: string;
  visible: boolean;
  /** 0–1 display opacity, applied on top of each layer's base paint opacity */
  opacity: number;
  /** false = toggle only, no opacity slider (expression-driven paint) */
  adjustable?: boolean;
  /** milestone that populates this layer with real data; undefined = live now */
  availableFrom?: string;
}

const D = (partial: Omit<LayerDef, "opacity" | "adjustable"> & { adjustable?: boolean }): LayerDef => ({
  opacity: 1,
  adjustable: true,
  ...partial,
});

const DEFAULTS: LayerDef[] = [
  D({ id: "graticule", label: "Graticule", group: "base", swatch: "border-strong", visible: true, adjustable: false, desc: "1° latitude / longitude grid." }),
  D({ id: "aoi", label: "Acquisition zone", group: "base", swatch: "accent", visible: true, desc: "Footprint of the satellite scene being analysed, with corner brackets." }),
  D({ id: "incidents", label: "Known incidents", group: "base", swatch: "coral-400", visible: true, desc: "Past spill locations (NOAA plus our replay set). The dark blob is an indicative extent scaled by severity and volume, not an actual radar detection." }),
  D({ id: "incident-heat", label: "Incident density", group: "base", swatch: "warning", visible: false, desc: "Where reported spills cluster, weighted by severity." }),
  D({ id: "currents", label: "Ocean currents", group: "environment", swatch: "layer-forecast", visible: false, adjustable: false, desc: "Real surface current data, drifting streaks show which way the water is actually moving right now." }),
  D({ id: "wind", label: "Wind vectors", group: "environment", swatch: "layer-origin", visible: false, adjustable: false, desc: "Real 10 m wind (Open Meteo / ERA5) sampled across the view. Each arrow points downwind, its length and colour scale with speed." }),
  D({ id: "temperature", label: "Temperature heatmap", group: "environment", swatch: "warning", visible: false, adjustable: false, desc: "Real 2 m air temperature (Open Meteo / ERA5) as a smooth blue-to-red wash over land and sea, like a weather map." }),
  D({ id: "sar-quicklook", label: "SAR quicklook", group: "detection", swatch: "border-strong", visible: false, availableFrom: "M2", desc: "The Sentinel-1 radar scene the detector actually segments, laid over its acquisition footprint. Dark patch = the low-backscatter slick; the black wedge is the swath edge." }),
  D({ id: "spill", label: "Spill polygon", group: "detection", swatch: "layer-spill", visible: false, availableFrom: "M2", desc: "The oil slick detected in the radar scene, shown as the dark filled shape." }),
  D({ id: "spill-edge", label: "Slick boundary", group: "detection", swatch: "layer-spill-edge", visible: false, availableFrom: "M2", desc: "Outline of the detected slick." }),
  D({ id: "hindcast", label: "Hindcast backtrack", group: "drift", swatch: "layer-hindcast", visible: false, availableFrom: "M3", desc: "Dashed green paths tracing the slick backward through the current toward its origin." }),
  D({ id: "origin", label: "Origin estimate", group: "drift", swatch: "layer-origin", visible: false, adjustable: false, availableFrom: "M3", desc: "The amber dot marks where the spill most likely started, traced back from the slick. The ring is its uncertainty area." }),
  D({ id: "forecast", label: "Forecast scenarios", group: "drift", swatch: "layer-forecast", visible: false, availableFrom: "M3", desc: "Pale forward paths projecting where the oil drifts over the next 72 hours." }),
  D({ id: "ais", label: "Vessel tracks (AIS)", group: "vessels", swatch: "layer-ais", visible: false, adjustable: false, availableFrom: "M4", desc: "The curved lines are recorded routes of nearby ships from AIS around the origin. #1 suspect is red, #2 amber, #3 green, the rest grey." }),
  D({ id: "suspects", label: "Ranked suspects", group: "vessels", swatch: "layer-suspect", visible: false, adjustable: false, availableFrom: "M4", desc: "Candidate vessels at their closest approach, shown as ship icons in the same rank colours. The ringed one is #1." }),
  D({ id: "protected", label: "Protected areas", group: "environment", swatch: "layer-protected", visible: false, availableFrom: "M7+", desc: "Sensitive habitats and the coastline stretches at risk." }),
];

interface LayersState {
  layers: LayerDef[];
  toggle: (id: string) => void;
  setVisible: (id: string, visible: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
  isVisible: (id: string) => boolean;
  /** a module produced data for these layers — drop the "coming in Mx" gate */
  markLive: (ids: string[]) => void;
}

export const useLayersStore = create<LayersState>((set, get) => ({
  layers: DEFAULTS,
  toggle: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),
  setVisible: (id, visible) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)) })),
  setOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l,
      ),
    })),
  isVisible: (id) => get().layers.find((l) => l.id === id)?.visible ?? false,
  markLive: (ids) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        ids.includes(l.id) ? { ...l, availableFrom: undefined } : l,
      ),
    })),
}));

export const LAYER_GROUP_LABEL: Record<LayerGroup, string> = {
  base: "Base",
  detection: "Detection",
  drift: "Drift & origin",
  vessels: "Vessels",
  environment: "Environment",
};
