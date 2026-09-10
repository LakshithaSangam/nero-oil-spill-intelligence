"use client";

import type { Map as MlMap, LngLatLike } from "maplibre-gl";
import { create } from "zustand";
import type { BasemapId } from "@/components/map/mapStyle";

interface ViewSnapshot {
  zoom: number;
  center: [number, number];
  pitch: number;
  bearing: number;
}

interface MapState {
  map: MlMap | null;
  ready: boolean;
  cursor: { lng: number; lat: number } | null;
  view: ViewSnapshot;
  basemap: BasemapId;
  setMap: (m: MlMap | null) => void;
  setReady: (v: boolean) => void;
  setCursor: (c: { lng: number; lat: number } | null) => void;
  setView: (v: ViewSnapshot) => void;
  setBasemap: (b: BasemapId) => void;
  flyTo: (opts: { center?: LngLatLike; zoom?: number; pitch?: number; bearing?: number }) => void;
  fitBounds: (b: [number, number, number, number], padding?: number) => void;
}

const BASEMAP_KEY = "neuro.basemap";
const VALID_BASEMAPS: BasemapId[] = ["natural", "atlas", "satellite", "abyssal", "light"];

export function readStoredBasemap(): BasemapId {
  if (typeof window === "undefined") return "natural";
  try {
    const v = window.localStorage.getItem(BASEMAP_KEY) as BasemapId | null;
    if (v && VALID_BASEMAPS.includes(v)) return v;
  } catch {
    /* storage blocked */
  }
  return "satellite";
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  ready: false,
  cursor: null,
  view: { zoom: 5.2, center: [69, 20.5], pitch: 0, bearing: 0 },
  // remembered across route changes and reloads — a chosen basemap should stick
  basemap: readStoredBasemap(),
  setMap: (map) => set({ map }),
  setReady: (ready) => set({ ready }),
  setCursor: (cursor) => set({ cursor }),
  setView: (view) => set({ view }),
  setBasemap: (basemap) => {
    try {
      window.localStorage.setItem(BASEMAP_KEY, basemap);
    } catch {
      /* storage blocked */
    }
    set({ basemap });
  },
  flyTo: ({ center, zoom, pitch, bearing }) => {
    const { map } = get();
    if (!map) return;
    map.flyTo({
      center: center ?? map.getCenter(),
      zoom: zoom ?? map.getZoom(),
      pitch: pitch ?? map.getPitch(),
      bearing: bearing ?? map.getBearing(),
      duration: 1400,
      essential: true,
    });
  },
  fitBounds: (b, padding = 96) => {
    const { map } = get();
    if (!map) return;
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding, duration: 1400 },
    );
  },
}));
