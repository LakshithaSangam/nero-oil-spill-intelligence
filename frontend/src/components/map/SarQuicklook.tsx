"use client";

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { API_BASE_URL } from "@/lib/api/client";
import { useDetectionStore } from "@/store/detection";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useScenarioStore } from "@/store/scenario";

const SRC_ID = "oe-sar-quicklook";
const LAYER_ID = "oe-sar-quicklook-img";
// slot the raster just under the detection / drift / vessel layers, so the
// slick, its boundary and the tracks always draw on top of the scene it was
// found in
const BELOW_CANDIDATES = [
  "oe-spill-feather",
  "oe-spill-fill",
  "oe-spill-edge",
  "oe-hindcast-line",
  "oe-forecast-line",
  "oe-ais-line",
];

function quicklookUrl(scene: string): string {
  const u = new URL("/v1/detection/quicklook", API_BASE_URL);
  u.searchParams.set("scene", scene);
  return u.toString();
}

/**
 * The Sentinel-1 SAR quicklook the detection pipeline actually segments, laid
 * over its AOI as a real MapLibre `image` source. With `IMAGERY_PROVIDER=mock`
 * the backend renders a synthetic scene (speckled ocean, dark slick, swath
 * no-data wedge); a real provider serves the true CDSE quicklook at the same
 * URL contract, unchanged. Toggled from the Layers panel / Settings as
 * "SAR quicklook".
 */
export function SarQuicklook() {
  const on = useLayersStore(
    (s) => s.layers.find((l) => l.id === "sar-quicklook")?.visible ?? false,
  );
  const opacity = useLayersStore(
    (s) => s.layers.find((l) => l.id === "sar-quicklook")?.opacity ?? 1,
  );
  const map = useMapStore((s) => s.map);
  const ready = useMapStore((s) => s.ready);
  const activeId = useScenarioStore((s) => s.activeId);
  const scenario = useScenarioStore((s) => s.active());
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));

  // scene id: prefer the one the detection ran on; fall back to the scenario id
  const scene = detection?.sar_scene_id ?? scenario?.id ?? null;
  const aoi = scenario?.aoi ?? null;

  const installedRef = useRef(false);

  useEffect(() => {
    if (!map || !on || !aoi || !scene) return;

    const corners: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [aoi.west, aoi.north],
      [aoi.east, aoi.north],
      [aoi.east, aoi.south],
      [aoi.west, aoi.south],
    ];
    const url = quicklookUrl(scene);

    const install = () => {
      if (!map.isStyleLoaded()) return false;
      try {
        const existing = map.getSource(SRC_ID) as maplibregl.ImageSource | undefined;
        if (existing) {
          existing.updateImage({ url, coordinates: corners });
        } else {
          map.addSource(SRC_ID, { type: "image", url, coordinates: corners });
        }
        if (!map.getLayer(LAYER_ID)) {
          const beforeId = BELOW_CANDIDATES.find((id) => map.getLayer(id));
          map.addLayer(
            {
              id: LAYER_ID,
              type: "raster",
              source: SRC_ID,
              paint: {
                "raster-opacity": 0.9 * opacity,
                "raster-fade-duration": 120,
                "raster-resampling": "linear",
              },
            },
            beforeId,
          );
        } else {
          map.setPaintProperty(LAYER_ID, "raster-opacity", 0.9 * opacity);
        }
        installedRef.current = true;
        return true;
      } catch {
        return false;
      }
    };

    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      timer = null;
      if (install()) return;
      if (tries++ < 40) timer = setTimeout(attempt, 300);
    };
    attempt();

    return () => {
      if (timer) clearTimeout(timer);
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
      } catch {
        /* style torn down */
      }
      installedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, on, scene, aoi?.west, aoi?.east, aoi?.south, aoi?.north]);

  // opacity slider without a full re-install
  useEffect(() => {
    if (!map || !installedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, "raster-opacity", 0.9 * opacity);
      }
    } catch {
      /* ignore */
    }
  }, [map, opacity]);

  return null;
}
