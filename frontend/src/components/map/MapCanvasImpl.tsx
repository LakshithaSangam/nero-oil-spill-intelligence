"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/map";
import { useLayersStore } from "@/store/layers";
import { useScenarioStore } from "@/store/scenario";
import { useDetectionStore } from "@/store/detection";
import { useOceanStore } from "@/store/ocean";
import { useInvestigationStore } from "@/store/investigation";
import { useTimelineStore } from "@/store/timeline";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { lookupDepth } from "@/lib/geo/depth";
import { SEED_INVESTIGATIONS } from "@/lib/mock/investigations";
import type { Incident } from "@/types/api";
import {
  AIS_SOURCE,
  AOI_SOURCE,
  BASE_STYLE,
  BASEMAPS,
  COAST_SOURCE,
  FORECAST_SOURCE,
  GRATICULE_SOURCE,
  HEAT_SOURCE,
  HINDCAST_SOURCE,
  INCIDENT_SOURCE,
  ORIGIN_SOURCE,
  SPILL_SOURCE,
  TIMELINE_SLICK_SOURCE,
  TIMELINE_SOURCE,
  bboxPolygon,
  graticuleGeoJSON,
  tokenColor,
  type BasemapId,
} from "./mapStyle";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ESC[c]!);
}

export default function MapCanvasImpl() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rafCursor = useRef<number | null>(null);
  const resizeObs = useRef<ResizeObserver | null>(null);
  const catchUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAllRef = useRef<((map: maplibregl.Map) => void) | null>(null);

  const setMap = useMapStore((s) => s.setMap);
  const setReady = useMapStore((s) => s.setReady);
  const setCursor = useMapStore((s) => s.setCursor);
  const setView = useMapStore((s) => s.setView);
  const router = useRouter();

  // ---- mount ----------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [69, 20.5],
      zoom: 5.2,
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true,
      maxPitch: 70,
      // Tile the world horizontally so a zoomed-out view is always full of map,
      // never a small globe floating in empty blue. minZoom keeps the whole
      // world roughly filling the frame at the widest, and scroll / trackpad
      // zoom is on so the +/- buttons aren't the only way out.
      renderWorldCopies: true,
      minZoom: 2,
      scrollZoom: true,
    });
    mapRef.current = map;
    setMap(map);

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
      map.on("error", (e) => console.warn("[map error]", e.error?.message));
    }

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    // The container can be 0-sized at init (hidden/blurred preview pane, collapsed
    // panel). Keep the GL viewport in step with the element's real size, and nudge
    // it whenever the tab regains visibility (rAF — and MapLibre — pause while hidden).
    resizeObs.current = new ResizeObserver(() => map.resize());
    resizeObs.current.observe(containerRef.current);
    const onVisible = () => {
      if (document.hidden) return;
      map.resize();
      if (map.isStyleLoaded() && map.getSource(GRATICULE_SOURCE)) syncAllRef.current?.(map);
    };
    document.addEventListener("visibilitychange", onVisible);

    const installLayers = () => {
      if (!map.isStyleLoaded()) return; // `load` / `idle` will call again once ready
      if (!map.getSource(GRATICULE_SOURCE)) {
        map.addSource(GRATICULE_SOURCE, { type: "geojson", data: graticuleGeoJSON() });
        map.addLayer({
          id: "oe-graticule-line",
          type: "line",
          source: GRATICULE_SOURCE,
          // The grid only spans the Indian Ocean working region, not the whole
          // world, so at a zoomed-out world view it read as a stray rectangle
          // patch rather than a coordinate grid. Only show it once a viewer is
          // actually zoomed in enough for "1° grid over the AOI" to make sense.
          minzoom: 3,
          paint: {
            "line-color": tokenColor("border-strong"),
            "line-width": ["case", ["get", "major"], 1, 0.5],
            "line-opacity": ["case", ["get", "major"], 0.65, 0.38],
          },
        });
      }
      if (!map.getSource(AOI_SOURCE)) {
        map.addSource(AOI_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "oe-aoi-fill",
          type: "fill",
          source: AOI_SOURCE,
          paint: { "fill-color": tokenColor("accent"), "fill-opacity": 0.05 },
        });
        map.addLayer({
          id: "oe-aoi-line",
          type: "line",
          source: AOI_SOURCE,
          paint: {
            "line-color": tokenColor("accent"),
            "line-width": 1.2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.75,
          },
        });
      }
      if (!map.getSource(SPILL_SOURCE)) {
        map.addSource(SPILL_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // A floating slick, not a flat polygon: a wide feather of oil bleeding
        // past the boundary into the water, the dark body over it, a faint cool
        // film catching the light, then a soft (never hard) rim.
        map.addLayer({
          id: "oe-spill-feather",
          type: "line",
          source: SPILL_SOURCE,
          paint: {
            "line-color": tokenColor("layer-spill"),
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 7, 9, 20],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 5, 5, 9, 14],
            "line-opacity": 0.52,
          },
        });
        map.addLayer({
          id: "oe-spill-fill",
          type: "fill",
          source: SPILL_SOURCE,
          paint: {
            "fill-color": tokenColor("layer-spill"),
            "fill-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "oe-spill-sheen",
          type: "fill",
          source: SPILL_SOURCE,
          paint: {
            "fill-color": tokenColor("layer-spill-sheen"),
            "fill-opacity": 0.14,
          },
        });
        map.addLayer({
          id: "oe-spill-edge",
          type: "line",
          source: SPILL_SOURCE,
          paint: {
            "line-color": tokenColor("layer-spill-edge"),
            "line-width": 3,
            "line-blur": 0.8,
            "line-opacity": 1,
          },
        });
      }
      registerVesselIcons(map);
      installHeatLayer(map);
      installIncidentLayer(map);
      installOceanLayers(map);
      installVesselLayers(map);
      installTimelineLayer(map);
      installLayerTransitions(map);
      setReady(true);
      syncAll(map);
    };

    const syncAll = (map: maplibregl.Map) => {
      applyBasemap(map, useMapStore.getState().basemap);
      applyLayerVisibility(map, useLayersStore.getState().layers);
      applyLayerOpacity(map, useLayersStore.getState().layers);
      syncScenario(map);
      syncDetection(map);
      syncOcean(map);
      syncInvestigation(map);
      syncTimeline(map);
      void syncHeat(map);
      void syncIncidents(map);
      map.triggerRepaint();
    };
    syncAllRef.current = syncAll;

    map.on("load", installLayers);
    // Safety nets for a map that inits in a hidden / just-mounted pane, where
    // `load`/`idle` can be delayed and data hydrated after mount would otherwise
    // never paint: (a) re-install if `idle` finds no layers, (b) a one-shot
    // deferred pass, (c) re-sync whenever the tab becomes visible.
    map.on("idle", () => {
      if (!map.getSource(GRATICULE_SOURCE)) installLayers();
      else applyBasemap(map, useMapStore.getState().basemap);
    });
    catchUp.current = setTimeout(() => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource(GRATICULE_SOURCE)) installLayers();
      else syncAll(map);
    }, 1200);

    map.on("mousemove", (e) => {
      if (rafCursor.current != null) return;
      rafCursor.current = requestAnimationFrame(() => {
        rafCursor.current = null;
        setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
    });
    map.on("mouseout", () => setCursor(null));

    // click a known-incident marker → recentre on it
    map.on("mouseenter", "oe-incident-point", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "oe-incident-point", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", "oe-incident-point", (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lon, lat] = f.geometry.coordinates as [number, number];
      const p = (f.properties ?? {}) as Record<string, unknown>;
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 7.5), duration: 900 });

      const pos =
        `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} `
        + `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;
      // if a detection has been run for this incident, surface its confidence
      const det = Object.values(useDetectionStore.getState().byScenario)
        .find((d) => d.incident_id && d.incident_id === p.id);
      const confRow: [string, string][] = det
        ? [["Detection confidence", `${Math.round(det.detection_confidence.score * 100)}%`]]
        : [];
      const rows = (depth: string): [string, string][] => [
        ["Severity", String(p.severity ?? "unknown")],
        ...(p.substance ? ([["Substance", String(p.substance)]] as [string, string][]) : []),
        ...(p.volume ? ([["Est. volume", `${Number(p.volume).toLocaleString()} bbl`]] as [string, string][]) : []),
        ...(p.status ? ([["Status", String(p.status)]] as [string, string][]) : []),
        ...confRow,
        ["Water depth", depth],
        ["Position", pos],
      ];
      const html = (depth: string) =>
        `<div class="oe-pop"><div class="oe-pop-title">${escapeHtml(String(p.name ?? "Incident"))}</div>`
        + `<dl>${rows(depth).map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl></div>`;

      const popup = new maplibregl.Popup({ offset: 12, maxWidth: "250px" })
        .setLngLat([lon, lat])
        .setHTML(html("looking up…"))
        .addTo(map);

      void lookupDepth(lon, lat).then((d) => {
        if (popup.isOpen()) {
          popup.setHTML(html(d != null ? `~${Math.round(d).toLocaleString()} m` : "unavailable"));
        }
      });
    });

    // click the detected slick (or its drifting time-lapse body) → open the
    // full investigation for the active scenario. The slick can be a thin
    // sliver, so hit-test a padded box around the pointer rather than the
    // exact pixel, and show a pointer cursor whenever the slick is under it.
    const SLICK_LAYERS = [
      "oe-spill-fill",
      "oe-spill-feather",
      "oe-spill-edge",
      "oe-timeline-slick-fill",
      "oe-timeline-slick-halo",
    ];
    const slickLayersPresent = () => SLICK_LAYERS.filter((id) => map.getLayer(id));
    const slickUnder = (pt: { x: number; y: number }) => {
      const layers = slickLayersPresent();
      if (!layers.length) return false;
      const box: [[number, number], [number, number]] = [
        [pt.x - 16, pt.y - 16],
        [pt.x + 16, pt.y + 16],
      ];
      return map.queryRenderedFeatures(box, { layers }).length > 0;
    };
    const openInvestigation = () => {
      const sid = useScenarioStore.getState().activeId;
      const inv = SEED_INVESTIGATIONS.find((i) => i.scenarioId === sid);
      router.push(inv ? `/investigations/${inv.id}` : "/investigations");
    };
    map.on("click", (e) => {
      if (slickUnder(e.point)) openInvestigation();
    });
    map.on("mousemove", (e) => {
      const overIncident =
        !!map.getLayer("oe-incident-point") &&
        map.queryRenderedFeatures(e.point, { layers: ["oe-incident-point"] }).length > 0;
      if (overIncident) return; // its own hover handler owns the cursor here
      map.getCanvas().style.cursor = slickUnder(e.point) ? "pointer" : "";
    });

    const pushView = () => {
      const c = map.getCenter();
      setView({
        zoom: map.getZoom(),
        center: [c.lng, c.lat],
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    };
    // Time-throttled (not rAF — an rAF can be starved indefinitely in a hidden
    // pane and would latch the throttle). Keeps the `view` snapshot (zoom / centre
    // / pitch / bearing) fresh for the scale bar, POS readout and 3-D toggle; the
    // *end events always push a final exact value even if the throttle swallowed
    // the last tick.
    let lastPush = 0;
    const pushViewThrottled = () => {
      const now = performance.now();
      if (now - lastPush < 60) return;
      lastPush = now;
      pushView();
    };
    map.on("move", pushViewThrottled);
    map.on("moveend", pushView);
    map.on("rotate", pushViewThrottled);
    map.on("rotateend", pushView);
    map.on("pitch", pushViewThrottled);
    map.on("pitchend", pushView);

    return () => {
      if (rafCursor.current != null) cancelAnimationFrame(rafCursor.current);
      if (catchUp.current != null) clearTimeout(catchUp.current);
      document.removeEventListener("visibilitychange", onVisible);
      resizeObs.current?.disconnect();
      resizeObs.current = null;
      map.remove();
      mapRef.current = null;
      setMap(null);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- react to layer visibility -----------------------------------------
  const layers = useLayersStore((s) => s.layers);
  useEffect(() => {
    const map = mapRef.current;
    if (map && useMapStore.getState().ready) {
      applyLayerVisibility(map, layers);
      applyLayerOpacity(map, layers);
      void syncHeat(map);
      map.triggerRepaint();
    }
  }, [layers]);

  // ---- react to the basemap style -------------------------------------
  const basemap = useMapStore((s) => s.basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      applyBasemap(map, basemap);
      map.triggerRepaint();
    }
  }, [basemap]);

  // ---- react to active scenario ----------------------------------------
  // Run a sync if the map is ready and force a frame (MapLibre skips rendering
  // while the pane is hidden / mid-init, so data hydrated after mount would
  // otherwise sit in the source without ever painting). If it is not ready yet,
  // the load / idle / catch-up / visibility handlers replay every sync.
  const runSync = (fn: (map: maplibregl.Map) => void) => {
    const map = mapRef.current;
    if (map && useMapStore.getState().ready) {
      fn(map);
      map.triggerRepaint();
    }
  };

  const activeId = useScenarioStore((s) => s.activeId);
  const scenarios = useScenarioStore((s) => s.scenarios);
  useEffect(() => {
    runSync(syncScenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, scenarios]);

  // ---- react to the detection for the active scenario -------------------
  const detections = useDetectionStore((s) => s.byScenario);
  useEffect(() => {
    runSync(syncDetection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, activeId]);

  // ---- react to the ocean-intelligence result -------------------------
  const oceanByDetection = useOceanStore((s) => s.byDetection);
  useEffect(() => {
    runSync(syncOcean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oceanByDetection, detections, activeId]);

  // ---- react to the investigation result -----------------------------
  const investigations = useInvestigationStore((s) => s.byDetection);
  const focusMmsi = useInvestigationStore((s) => s.focusMmsi);
  useEffect(() => {
    runSync(syncInvestigation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investigations, focusMmsi, detections, activeId]);

  // ---- react to the timeline scrubber -------------------------------
  // Playback advances the clock every animation frame; syncing the GeoJSON that
  // often is wasteful, so coalesce to ~30 Hz with a guaranteed trailing run.
  const timelineHour = useTimelineStore((s) => s.hour);
  const timelineMode = useTimelineStore((s) => s.mode);
  const tlThrottle = useRef<{ last: number; trailing: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    trailing: null,
  });
  useEffect(() => {
    const t = tlThrottle.current;
    if (t.trailing) {
      clearTimeout(t.trailing);
      t.trailing = null;
    }
    const now = performance.now();
    if (now - t.last >= 33) {
      t.last = now;
      runSync(syncTimeline);
    } else {
      t.trailing = setTimeout(() => {
        t.trailing = null;
        tlThrottle.current.last = performance.now();
        runSync(syncTimeline);
      }, 33);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineHour, timelineMode, oceanByDetection, investigations, detections, activeId]);

  const tint = BASEMAPS[basemap].tint;
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {/* deep-water wash — pulls the basemap toward midnight navy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ background: "rgb(var(--navy-950) / 0.3)", opacity: tint }}
      />
      {/* oceanic tint — cheap, does not touch the GL context */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-500"
        style={{
          opacity: tint,
          background:
            "radial-gradient(65% 65% at 18% 12%, rgb(var(--teal-900) / 0.85), transparent 70%)," +
            "radial-gradient(75% 75% at 98% 100%, rgb(var(--emerald-500) / 0.5), transparent 62%)",
        }}
      />
      {/* edge vignette — scales with the tint so the realistic basemaps stay bright */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: 0.09 + tint * 0.4,
          background:
            "radial-gradient(150% 110% at 50% 0%, transparent 62%, rgb(var(--navy-950) / 0.5) 100%)",
        }}
      />
    </div>
  );
}

/** Show exactly one raster basemap; the rest go hidden. */
function applyBasemap(map: maplibregl.Map, id: BasemapId) {
  for (const [key, def] of Object.entries(BASEMAPS)) {
    if (map.getLayer(def.layer)) {
      map.setLayoutProperty(def.layer, "visibility", key === id ? "visible" : "none");
    }
  }
}

function installHeatLayer(map: maplibregl.Map) {
  if (!map.getSource(HEAT_SOURCE)) {
    map.addSource(HEAT_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (map.getLayer("oe-incident-heat")) return;
  map.addLayer({
    id: "oe-incident-heat",
    type: "heatmap",
    source: HEAT_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": ["coalesce", ["get", "w"], 0.4],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 1.1, 9, 3.2],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 26, 6, 44, 9, 70],
      "heatmap-opacity": 0.85,
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(10,24,38,0)",
        0.15, tokenColor("accent", 0.4),
        0.4, tokenColor("warning", 0.7),
        0.7, tokenColor("danger", 0.9),
        1, "rgb(255 214 186)",
      ],
    },
  });
}

let heatCache: GeoJSON.FeatureCollection | null = null;
async function syncHeat(map: maplibregl.Map) {
  const src = map.getSource(HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  // (re)fetch until we actually have data — never cache an empty/failed result,
  // so the heatmap fills in once the backend is up
  if (!heatCache || heatCache.features.length === 0) {
    try {
      const incidents = await api<Incident[]>("/incidents");
      const wBySev: Record<string, number> = {
        minor: 0.4, moderate: 0.65, major: 0.85, catastrophic: 1, unknown: 0.45,
      };
      if (incidents.length > 0) {
        heatCache = {
          type: "FeatureCollection",
          features: incidents.map((i) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [i.location.lon, i.location.lat] },
            properties: { w: wBySev[i.severity] ?? 0.45 },
          })),
        };
      }
    } catch {
      /* leave cache null so the next sync retries */
    }
  }
  if (heatCache) src.setData(heatCache);
}

/**
 * Known incidents (NOAA + replay set) as always-available ground-truth markers —
 * independent of any agent run, so the map is never empty on the Incidents or
 * Investigations routes. A severity-toned dot with a pale rim and soft halo so it
 * reads on every basemap (abyssal, satellite, light), scaled by severity.
 */
function installIncidentLayer(map: maplibregl.Map) {
  if (!map.getSource(INCIDENT_SOURCE)) {
    map.addSource(INCIDENT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  const sevColor: maplibregl.ExpressionSpecification = [
    "match",
    ["get", "severity"],
    "catastrophic", tokenColor("danger"),
    "major", tokenColor("danger"),
    "moderate", tokenColor("warning"),
    tokenColor("coral-400"),
  ];
  // an indicative oil-slick blob at EVERY incident (not a SAR detection — a
  // reported-extent hint scaled by severity / volume), so spills read across the
  // whole map, not only on the scenario with a full detection. Added per-layer
  // (not gated on the source) so it appears even on a map from an older build.
  if (!map.getLayer("oe-incident-slick")) {
    map.addLayer({
      id: "oe-incident-slick",
      type: "circle",
      source: INCIDENT_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          3, ["*", ["coalesce", ["get", "extent"], 1], 7],
          7, ["*", ["coalesce", ["get", "extent"], 1], 13],
          11, ["*", ["coalesce", ["get", "extent"], 1], 20],
          15, ["*", ["coalesce", ["get", "extent"], 1], 30],
        ],
        // warm-dark oil (not pure black — reads as a slick, not a hole) with a
        // faint iridescent sheen ring
        "circle-color": "rgb(36 28 24)",
        "circle-opacity": 0.55,
        "circle-blur": 0.22,
        "circle-stroke-color": tokenColor("oil-sheen"),
        "circle-stroke-width": 1.6,
        "circle-stroke-opacity": 0.6,
      },
    });
  }
  if (!map.getLayer("oe-incident-halo")) {
    map.addLayer({
      id: "oe-incident-halo",
      type: "circle",
      source: INCIDENT_SOURCE,
      paint: {
        "circle-radius": [
          "match", ["get", "severity"],
          "catastrophic", 15, "major", 14, "moderate", 12, "minor", 11, 10,
        ],
        "circle-color": sevColor,
        "circle-opacity": 0.2,
        "circle-blur": 0.7,
      },
    });
  }
  if (!map.getLayer("oe-incident-point")) {
    map.addLayer({
      id: "oe-incident-point",
      type: "circle",
      source: INCIDENT_SOURCE,
      paint: {
        "circle-radius": [
          "match", ["get", "severity"],
          "catastrophic", 7, "major", 6.5, "moderate", 5.5, "minor", 4.5, 4,
        ],
        "circle-color": sevColor,
        "circle-opacity": 0.92,
        "circle-stroke-width": 1.6,
        "circle-stroke-color": tokenColor("sand-100"),
      },
    });
  }
}

const SEV_EXTENT: Record<string, number> = {
  minor: 1.2, moderate: 1.6, major: 2.1, catastrophic: 2.8, unknown: 1.4,
};

let incidentCache: GeoJSON.FeatureCollection | null = null;
async function syncIncidents(map: maplibregl.Map) {
  const src = map.getSource(INCIDENT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!incidentCache || incidentCache.features.length === 0) {
    try {
      const incidents = await api<Incident[]>("/incidents");
      if (incidents.length > 0) {
        incidentCache = {
          type: "FeatureCollection",
          features: incidents.map((i) => {
            const vol = i.estimated_volume_bbl ?? null;
            const volBoost = vol ? Math.min(1.6, Math.sqrt(vol / 250)) : 0;
            const extent = Math.max(1.1, Math.min(3.2, (SEV_EXTENT[i.severity] ?? 1.4) + volBoost));
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [i.location.lon, i.location.lat] },
              properties: {
                id: i.id,
                name: i.name,
                severity: i.severity,
                status: i.status,
                substance: i.substance ?? "",
                volume: vol ?? "",
                extent,
              },
            };
          }),
        };
      }
    } catch {
      /* leave cache null so the next sync retries */
    }
  }
  if (incidentCache) src.setData(incidentCache);
}

/**
 * Per-layer display opacity from the GIS panel sliders. Each entry is
 * [mapLayerId, paintProp, baseOpacity]; the slider value scales the base so a
 * layer never exceeds the weight it was designed with. Layers with
 * expression-driven opacity (AIS, suspects, origin) are toggle-only.
 */
const OPACITY_TARGETS: Record<string, Array<[string, string, number]>> = {
  aoi: [
    ["oe-aoi-fill", "fill-opacity", 0.05],
    ["oe-aoi-line", "line-opacity", 0.75],
  ],
  incidents: [
    ["oe-incident-point", "circle-opacity", 0.92],
    ["oe-incident-halo", "circle-opacity", 0.2],
  ],
  "incident-heat": [["oe-incident-heat", "heatmap-opacity", 0.72]],
  spill: [
    ["oe-spill-feather", "line-opacity", 0.5],
    ["oe-spill-fill", "fill-opacity", 0.9],
    ["oe-spill-sheen", "fill-opacity", 0.14],
  ],
  "spill-edge": [["oe-spill-edge", "line-opacity", 1]],
  hindcast: [["oe-hindcast-line", "line-opacity", 0.9]],
  forecast: [["oe-forecast-line", "line-opacity", 0.88]],
  protected: [["oe-coast-line", "line-opacity", 0.9]],
};

/** Smooth every analysis layer's opacity changes (toggles + slider drags). */
function installLayerTransitions(map: maplibregl.Map) {
  const t = { duration: 260, delay: 0 };
  const byProp: Record<string, string[]> = {
    "line-opacity": [
      "oe-aoi-line", "oe-spill-feather", "oe-spill-edge", "oe-hindcast-line",
      "oe-forecast-line", "oe-coast-line", "oe-graticule-line",
    ],
    "fill-opacity": ["oe-aoi-fill", "oe-spill-fill", "oe-spill-sheen", "oe-origin-surface"],
    "circle-opacity": ["oe-incident-point", "oe-incident-halo"],
    "heatmap-opacity": ["oe-incident-heat"],
  };
  for (const [prop, ids] of Object.entries(byProp)) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setPaintProperty(id, `${prop}-transition`, t);
    }
  }
}

function applyLayerOpacity(map: maplibregl.Map, layers: { id: string; opacity: number }[]) {
  for (const layer of layers) {
    const targets = OPACITY_TARGETS[layer.id];
    if (!targets) continue;
    for (const [mapLayer, prop, base] of targets) {
      if (!map.getLayer(mapLayer)) continue;
      map.setPaintProperty(mapLayer, prop, base * layer.opacity);
    }
  }
}

function applyLayerVisibility(
  map: maplibregl.Map,
  layers: { id: string; visible: boolean }[],
) {
  const vis = (id: string) => layers.find((l) => l.id === id)?.visible ?? false;
  const set = (layerId: string, on: boolean) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    }
  };
  set("oe-graticule-line", vis("graticule"));
  set("oe-aoi-fill", vis("aoi"));
  set("oe-aoi-line", vis("aoi"));
  set("oe-incident-slick", vis("incidents"));
  set("oe-incident-halo", vis("incidents"));
  set("oe-incident-point", vis("incidents"));
  set("oe-incident-heat", vis("incident-heat"));
  set("oe-spill-feather", vis("spill"));
  set("oe-spill-fill", vis("spill"));
  set("oe-spill-sheen", vis("spill"));
  set("oe-spill-edge", vis("spill-edge"));
  set("oe-origin-surface", vis("origin"));
  set("oe-origin-point", vis("origin"));
  set("oe-origin-core", vis("origin"));
  set("oe-hindcast-line", vis("hindcast"));
  set("oe-forecast-line", vis("forecast"));
  set("oe-forecast-head", vis("forecast"));
  set("oe-coast-line", vis("forecast") || vis("protected"));
  set("oe-ais-line-focus", vis("ais"));
  set("oe-ais-line", vis("ais"));
  set("oe-ais-gap", vis("ais"));
  set("oe-vessel-ship", vis("suspects"));
  set("oe-suspect-ring", vis("suspects"));
  // the drifting / expanding oil body follows the scrubber whenever the spill
  // OR forecast layer is on, so a time-lapse always animates the slick itself
  const timelapse = vis("spill") || vis("forecast");
  set("oe-timeline-slick-past", timelapse);
  set("oe-timeline-slick-halo", timelapse);
  set("oe-timeline-slick-fill", timelapse);
  set("oe-timeline-slick-edge", timelapse);
  set("oe-timeline-playhead", timelapse);
  set("oe-timeline-ship", timelapse);
}

function installTimelineLayer(map: maplibregl.Map) {
  if (!map.getSource(TIMELINE_SOURCE)) {
    map.addSource(TIMELINE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  // the drifting / expanding oil body at the scrubbed hour — a time-lapse of the
  // slick itself, not just the vessel markers. Drawn under the ship glyphs.
  if (!map.getSource(TIMELINE_SLICK_SOURCE)) {
    map.addSource(TIMELINE_SLICK_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("oe-timeline-slick-past")) {
    // faint dashed outlines of the footprint at earlier hours — the "tree rings"
    // that make the spread over time legible
    map.addLayer({
      id: "oe-timeline-slick-past",
      type: "line",
      source: TIMELINE_SLICK_SOURCE,
      filter: ["==", ["get", "role"], "past"],
      paint: {
        "line-color": tokenColor("layer-spill-edge"),
        "line-width": 1.3,
        "line-opacity": 0.55,
        "line-dasharray": [2, 2.5],
      },
    });
  }
  if (!map.getLayer("oe-timeline-slick-halo")) {
    // a soft wide glow so the current body is unmistakable as it grows
    map.addLayer({
      id: "oe-timeline-slick-halo",
      type: "line",
      source: TIMELINE_SLICK_SOURCE,
      filter: ["==", ["get", "role"], "now"],
      paint: {
        "line-color": "rgb(255 176 120)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 10, 11, 30],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 5, 9, 11, 24],
        "line-opacity": 0.44,
      },
    });
  }
  if (!map.getLayer("oe-timeline-slick-fill")) {
    map.addLayer({
      id: "oe-timeline-slick-fill",
      type: "fill",
      source: TIMELINE_SLICK_SOURCE,
      filter: ["==", ["get", "role"], "now"],
      paint: {
        "fill-color": "rgb(96 66 52)",
        "fill-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer("oe-timeline-slick-edge")) {
    map.addLayer({
      id: "oe-timeline-slick-edge",
      type: "line",
      source: TIMELINE_SLICK_SOURCE,
      filter: ["==", ["get", "role"], "now"],
      paint: {
        "line-color": "rgb(236 196 148)",
        "line-width": 3.2,
        "line-blur": 0.6,
        "line-opacity": 1,
      },
    });
  }
  if (!map.getLayer("oe-timeline-playhead")) {
    // the position-at-time-T marker on the drift path — a ship glyph, not a dot
    map.addLayer({
      id: "oe-timeline-playhead",
      type: "symbol",
      source: TIMELINE_SOURCE,
      filter: ["!=", ["get", "role"], "vessel"],
      layout: {
        // one colour per drift-ensemble member so the three are distinguishable
        "icon-image": [
          "match", ["coalesce", ["get", "memberIdx"], 0],
          0, "vessel-hot",
          1, "vessel-warn",
          2, "vessel-mid",
          "vessel-calm",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.32, 12, 0.72],
        "icon-rotate": ["coalesce", ["get", "heading"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  if (!map.getLayer("oe-timeline-ship")) {
    map.addLayer({
      id: "oe-timeline-ship",
      type: "symbol",
      source: TIMELINE_SOURCE,
      filter: ["==", ["get", "role"], "vessel"],
      layout: {
        "icon-image": ["case", ["get", "discharging"], "vessel-hot", "vessel-calm"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.32, 12, 0.72],
        "icon-rotate": ["coalesce", ["get", "heading"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

function syncTimeline(map: maplibregl.Map) {
  const src = map.getSource(TIMELINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const slickSrc = map.getSource(TIMELINE_SLICK_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const clearSlick = () =>
    slickSrc?.setData({ type: "FeatureCollection", features: [] });
  const { activeId } = useScenarioStore.getState();
  const detection = activeId ? useDetectionStore.getState().byScenario[activeId] : undefined;
  const forecast = detection
    ? useOceanStore.getState().byDetection[detection.id]?.forecast
    : undefined;
  const { hour, mode } = useTimelineStore.getState();
  const feats: GeoJSON.Feature[] = [];
  let slickSet = false;

  // reconstruction: before detection, animate the lead suspect along its AIS track
  if (mode === "reconstruction" && hour < 0 && detection) {
    const ranking = useInvestigationStore.getState().byDetection[detection.id];
    const lead = ranking?.cards[0];
    const line = lead?.track.features.find(
      (f) => (f.properties as { role?: string }).role === "track",
    );
    const times = (line?.properties as { times?: string[] } | undefined)?.times;
    const coords = line?.geometry.coordinates as number[][] | undefined;
    const t0 = new Date(detection.detected_at).getTime();
    if (times && coords && times.length === coords.length) {
      const targetMs = t0 + hour * 3.6e6;
      const ts = times.map((s) => new Date(s).getTime());
      let i = 0;
      while (i < ts.length - 1 && ts[i + 1]! < targetMs) i++;
      const a = ts[i]!;
      const b = ts[Math.min(i + 1, ts.length - 1)]!;
      const f = b === a ? 0 : Math.max(0, Math.min(1, (targetMs - a) / (b - a)));
      const ca = coords[i]!;
      const cb = coords[Math.min(i + 1, coords.length - 1)]!;
      const hc = useOceanStore.getState().byDetection[detection.id]?.hindcast;
      const rw = hc?.origin.release_window;
      const discharging = rw
        ? targetMs >= new Date(rw.start).getTime() && targetMs <= new Date(rw.end).getTime()
        : false;
      // during the AIS gap the true position is unknown — pin the marker to the
      // estimated discharge point rather than interpolating across the dark window
      const coordinates: [number, number] = discharging && hc
        ? [hc.origin.point.lon, hc.origin.point.lat]
        : [ca[0]! + (cb[0]! - ca[0]!) * f, ca[1]! + (cb[1]! - ca[1]!) * f];
      feats.push({
        type: "Feature",
        properties: {
          role: "vessel",
          discharging,
          heading: bearingDeg(ca, cb), // orient along the reconstructed track
          name: lead?.vessel.name ?? "",
          estimated: discharging,
        },
        geometry: { type: "Point", coordinates },
      });

      // the slick itself during reconstruction: nothing before the discharge
      // starts, then a patch at the origin that grows and drifts toward the
      // detected slick as the clock reaches detection time.
      if (slickSrc && hc && rw) {
        const rwStart = new Date(rw.start).getTime();
        const cen = detection.geometry.centroid;
        const fullArea = detection.geometry.area_km2 ?? 12;
        if (targetMs >= rwStart && cen) {
          const prog = Math.max(0, Math.min(1, (targetMs - rwStart) / (t0 - rwStart || 1)));
          const ox = hc.origin.point.lon;
          const oy = hc.origin.point.lat;
          const bx = ox + (cen[0]! - ox) * prog;
          const by = oy + (cen[1]! - oy) * prog;
          const areaKm2 = Math.max(0.5, fullArea * (0.1 + 0.9 * prog));
          const rKm = Math.max(0.5, Math.sqrt(areaKm2 / Math.PI));
          const brg = bearingDeg([ox, oy], [cen[0]!, cen[1]!]);
          slickSrc.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { hour, areaKm2: Math.round(areaKm2) },
                geometry: {
                  type: "Polygon",
                  coordinates: [ellipseRing(bx, by, rKm * 1.6, rKm * 0.62, brg)],
                },
              },
            ],
          });
          slickSet = true;
        }
      }
    }
  }

  // The static "detected slick" layer is pinned to the detection spot and moment.
  // Hide it while rewinding (it hasn't happened yet) and fade it as the forecast
  // scrubber moves on, so the drifting time-lapse body is what reads on the map.
  const staticSlickK =
    mode === "reconstruction" && hour < 0
      ? 0
      : mode === "forecast" && hour > 0
        ? Math.max(0, 1 - hour / 8)
        : 1;
  fadeStaticSlick(map, staticSlickK);

  if (!forecast || hour <= 0) {
    src.setData({ type: "FeatureCollection", features: feats });
    if (!slickSet) clearSlick();
    return;
  }
  const memberHeads: number[][] = [];
  forecast.scenarios.forEach((sc, memberIdx) => {
    const pts = (sc.track.features as unknown as GeoJSON.Feature[])
      .filter((f) => f.geometry.type === "Point")
      .map((f) => ({
        hour: Number((f.properties as { hour?: number }).hour ?? 0),
        coord: (f.geometry as GeoJSON.Point).coordinates,
      }))
      .sort((a, b) => a.hour - b.hour);
    if (!pts.length) return;
    let lo = pts[0]!;
    let hi = pts[pts.length - 1]!;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i]!.hour <= hour && pts[i + 1]!.hour >= hour) {
        lo = pts[i]!;
        hi = pts[i + 1]!;
        break;
      }
    }
    const span = hi.hour - lo.hour || 1;
    const t = Math.max(0, Math.min(1, (hour - lo.hour) / span));
    const x = lo.coord[0]! + (hi.coord[0]! - lo.coord[0]!) * t;
    const y = lo.coord[1]! + (hi.coord[1]! - lo.coord[1]!) * t;
    memberHeads.push([x, y]);
    feats.push({
      type: "Feature",
      properties: {
        member: sc.id,
        memberIdx,
        label: sc.label,
        hour,
        heading: bearingDeg(lo.coord, hi.coord), // orient along the drift path
      },
      geometry: { type: "Point", coordinates: [x, y] },
    });
  });
  src.setData({ type: "FeatureCollection", features: feats });

  // ---- the oil body as a time-lapse. The slick stays anchored at the spill
  // (origin / detection centroid) and *spreads* — its footprint grows to the
  // forecast's expected-area curve and creeps only slightly down-drift. Faint
  // outlines of the extent at earlier hours sit concentrically behind it so
  // "how much it spread over time" reads without the whole patch sliding around.
  // The moving thing on the map is the ship markers, not the oil.
  if (slickSrc && memberHeads.length) {
    const front: [number, number] = [
      memberHeads.reduce((s, p) => s + p[0]!, 0) / memberHeads.length,
      memberHeads.reduce((s, p) => s + p[1]!, 0) / memberHeads.length,
    ];
    const originPt = useOceanStore.getState().byDetection[detection!.id]?.hindcast?.origin.point;
    const anchor: [number, number] = originPt
      ? [originPt.lon, originPt.lat]
      : ((detection!.geometry.centroid as [number, number] | undefined) ?? front);
    const driftBrg = bearingDeg(anchor, front);

    // footprint ellipse for hour h: centred on the anchor plus a *small* down-drift
    // offset (capped), area from the curve, gently elongated along the drift.
    const bodyAt = (h: number): number[][] => {
      const area = Math.max(1, interpAreaByHour(forecast.expected_area_km2_by_hour, h));
      const r = Math.sqrt(area / Math.PI); // km — the true equivalent radius
      const kmPerDegLat = 110.574;
      const kmPerDegLon = 111.32 * Math.cos((anchor[1] * Math.PI) / 180) || 1e-3;
      const driftKm = Math.hypot(
        (front[0] - anchor[0]) * kmPerDegLon,
        (front[1] - anchor[1]) * kmPerDegLat,
      );
      const offKm = Math.min(driftKm * 0.25, r * 0.7); // creep, never a full translation
      const rad = (driftBrg * Math.PI) / 180;
      const cLon = anchor[0] + (Math.sin(rad) * offKm) / kmPerDegLon;
      const cLat = anchor[1] + (Math.cos(rad) * offKm) / kmPerDegLat;
      // drawn a little tighter than the true equivalent radius so a large
      // projected area still reads as a slick, not a screen-filling blob
      return ellipseRing(cLon, cLat, r * 0.95, r * 0.62, driftBrg);
    };

    const slickFeats: GeoJSON.Feature[] = [];
    for (let h = 12; h < hour - 2; h += 12) {
      slickFeats.push({
        type: "Feature",
        properties: { role: "past", hour: h },
        geometry: { type: "Polygon", coordinates: [bodyAt(h)] },
      });
    }
    slickFeats.push({
      type: "Feature",
      properties: {
        role: "now",
        hour,
        areaKm2: Math.round(interpAreaByHour(forecast.expected_area_km2_by_hour, hour)),
      },
      geometry: { type: "Polygon", coordinates: [bodyAt(hour)] },
    });
    slickSrc.setData({ type: "FeatureCollection", features: slickFeats });
  } else {
    clearSlick();
  }
}

/**
 * The drift forecast can project the slick onto the coast — legitimate for the
 * landfall ETA, but a dashed line snaking kilometres inland reads as nonsense.
 * Truncate a drift polyline at the shoreline (a coarse NE-sloping approximation
 * of the Saurashtra / Gujarat coast for the replay AOI), keeping the point that
 * actually touches land so the track still reaches the beach.
 */
function onLand(lon: number, lat: number): boolean {
  // land if the point is NE of a line through ~(69.95, 20.30) rising at ~45°
  return lon > 69.9 && lat > 20.3 + (lon - 69.95);
}
function clipDriftToCoast(coords: [number, number][]): [number, number][] {
  for (let i = 0; i < coords.length; i++) {
    if (onLand(coords[i]![0], coords[i]![1])) {
      return coords.slice(0, i + 1); // include the landfall point
    }
  }
  return coords;
}

/** dim the static detected-slick layers (multiplier on their base paint opacity) */
function fadeStaticSlick(map: maplibregl.Map, k: number) {
  const base: [string, string, number][] = [
    ["oe-spill-feather", "line-opacity", 0.5],
    ["oe-spill-fill", "fill-opacity", 0.9],
    ["oe-spill-sheen", "fill-opacity", 0.14],
    ["oe-spill-edge", "line-opacity", 1],
  ];
  for (const [id, prop, b] of base) {
    if (map.getLayer(id)) {
      try {
        map.setPaintProperty(id, prop, Math.max(0, Math.min(1, b * k)));
      } catch {
        /* style not ready */
      }
    }
  }
}

/** linear interpolation of the {hour: km²} expected-area curve at an arbitrary hour */
function interpAreaByHour(curve: Record<string, number>, hour: number): number {
  const pts = Object.entries(curve)
    .map(([h, v]) => [Number(h), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  if (hour <= pts[0]![0]) return pts[0]![1];
  if (hour >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [h0, v0] = pts[i]!;
    const [h1, v1] = pts[i + 1]!;
    if (h0 <= hour && hour <= h1) {
      const t = (hour - h0) / (h1 - h0 || 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return pts[pts.length - 1]![1];
}

/** an ellipse ring in lon/lat: semi-axes in km, `bearingDeg` = long-axis heading */
function ellipseRing(
  lon: number,
  lat: number,
  aKm: number,
  bKm: number,
  bearingDegVal: number,
  n = 48,
): number[][] {
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180) || 1e-3;
  const rot = (bearingDegVal * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ring: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * 2 * Math.PI;
    // local km offsets on the ellipse, then rotate into the drift bearing
    const ex = aKm * Math.cos(th);
    const ey = bKm * Math.sin(th);
    const dxKm = ex * sin + ey * cos; // east
    const dyKm = ex * cos - ey * sin; // north
    ring.push([lon + dxKm / kmPerDegLon, lat + dyKm / kmPerDegLat]);
  }
  return ring;
}

/**
 * Detailed top-down cargo-ship plan, bow up (icon-rotate turns it to course):
 * blunt raked bow, parallel hull, three deck hatches, an aft bridge block and a
 * funnel, a flat transom and a faint bow wake. One image per tint.
 */
function shipIcon(fill: string): ImageData {
  const px = 72;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d")!;
  g.translate(px / 2, px / 2);
  g.lineJoin = "round";
  g.lineCap = "round";
  const ink = "rgba(6,14,20,0.8)";

  // ---- bow wake ----
  g.beginPath();
  g.moveTo(-6, -30);
  g.lineTo(0, -37);
  g.lineTo(6, -30);
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = 1.6;
  g.stroke();

  // ---- hull ----
  g.beginPath();
  g.moveTo(0, -28);
  g.bezierCurveTo(5.5, -25, 9.5, -19, 9.8, -11); // raked bow shoulders
  g.lineTo(9.8, 20); // straight side
  g.lineTo(8.6, 25); // quarter
  g.lineTo(-8.6, 25); // transom
  g.lineTo(-9.8, 20);
  g.lineTo(-9.8, -11);
  g.bezierCurveTo(-9.5, -19, -5.5, -25, 0, -28);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2.4;
  g.strokeStyle = ink;
  g.stroke();

  // ---- deck (a lighter inset) ----
  g.save();
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-9.8, -22, 19.6, 44);
  g.restore();

  // ---- three cargo hatches ----
  g.fillStyle = "rgba(6,14,20,0.34)";
  for (const hy of [-16, -6, 4]) g.fillRect(-6.5, hy, 13, 6);

  // ---- aft bridge / superstructure ----
  g.beginPath();
  g.rect(-7, 11, 14, 9);
  g.fillStyle = "rgba(255,255,255,0.42)";
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = ink;
  g.stroke();
  // bridge windows
  g.strokeStyle = "rgba(6,14,20,0.45)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-4.5, 13.5);
  g.lineTo(4.5, 13.5);
  g.stroke();

  // ---- funnel ----
  g.beginPath();
  g.arc(0, 17, 1.9, 0, Math.PI * 2);
  g.fillStyle = ink;
  g.fill();

  return g.getImageData(0, 0, px, px);
}

function registerVesselIcons(map: maplibregl.Map) {
  const defs: [string, string][] = [
    ["vessel-calm", tokenColor("layer-ais")],
    ["vessel-mid", tokenColor("kelp")],
    ["vessel-warn", tokenColor("warning")],
    ["vessel-hot", tokenColor("layer-suspect")],
  ];
  for (const [id, fill] of defs) {
    if (!map.hasImage(id)) {
      try {
        map.addImage(id, shipIcon(fill), { pixelRatio: 2 });
      } catch {
        /* canvas unavailable — fall back to the circle layers */
      }
    }
  }
}

/** initial-course bearing from → to, degrees clockwise from north */
function bearingDeg(from: number[], to: number[]): number {
  const dLon = (to[0] ?? 0) - (from[0] ?? 0);
  const dLat = (to[1] ?? 0) - (from[1] ?? 0);
  const latR = ((from[1] ?? 0) * Math.PI) / 180;
  return (Math.atan2(dLon * Math.cos(latR), dLat) * 180) / Math.PI;
}

function installVesselLayers(map: maplibregl.Map) {
  if (!map.getSource(AIS_SOURCE)) {
    map.addSource(AIS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  // ranked candidate vessels get a distinct colour so each track is followable;
  // the un-ranked AIS crowd stays neutral grey
  const rankColor = [
    "match", ["coalesce", ["get", "rank"], 99],
    1, tokenColor("layer-suspect"),
    2, tokenColor("warning"),
    3, tokenColor("kelp"),
    tokenColor("layer-ais"),
  ] as unknown as maplibregl.ExpressionSpecification;
  if (!map.getLayer("oe-ais-line-focus")) {
    // wide glow under the vessel the analyst has selected (from the dashboard /
    // vessel list) so its complete route is unmistakable on a busy map
    map.addLayer({
      id: "oe-ais-line-focus",
      type: "line",
      source: AIS_SOURCE,
      filter: ["all", ["==", ["get", "role"], "track"], ["==", ["get", "focus"], true]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": tokenColor("accent"),
        "line-width": 10,
        "line-blur": 7,
        "line-opacity": 0.42,
      },
    });
  }
  if (!map.getLayer("oe-ais-line")) {
    map.addLayer({
      id: "oe-ais-line",
      type: "line",
      source: AIS_SOURCE,
      filter: ["==", ["get", "role"], "track"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": rankColor,
        "line-width": [
          "match", ["coalesce", ["get", "rank"], 99],
          1, 3, 2, 2.2, 3, 2, 1.2,
        ],
        "line-blur": 0.4,
        "line-opacity": [
          "match", ["coalesce", ["get", "rank"], 99],
          1, 0.95, 2, 0.82, 3, 0.78, 0.5,
        ],
      },
    });
  }
  if (!map.getLayer("oe-ais-gap")) {
    map.addLayer({
      id: "oe-ais-gap",
      type: "line",
      source: AIS_SOURCE,
      filter: ["==", ["get", "role"], "gap"],
      paint: {
        "line-color": tokenColor("layer-suspect"),
        "line-width": 2.6,
        "line-blur": 0.4,
        "line-dasharray": [1.4, 1.6],
        "line-opacity": 1,
      },
    });
  }
  if (!map.getLayer("oe-suspect-ring")) {
    map.addLayer({
      id: "oe-suspect-ring",
      type: "circle",
      source: AIS_SOURCE,
      filter: ["all", ["==", ["get", "role"], "closest"], ["==", ["get", "rank"], 1]],
      paint: {
        "circle-radius": 15,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": tokenColor("layer-suspect"),
        "circle-stroke-width": 2.4,
        "circle-stroke-opacity": 1,
      },
    });
  }
  if (!map.getLayer("oe-vessel-ship")) {
    map.addLayer({
      id: "oe-vessel-ship",
      type: "symbol",
      source: AIS_SOURCE,
      filter: ["==", ["get", "role"], "closest"],
      layout: {
        "icon-image": [
          "match", ["coalesce", ["get", "rank"], 99],
          1, "vessel-hot",
          2, "vessel-warn",
          3, "vessel-mid",
          "vessel-calm",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 9, 0.5, 13, 0.72],
        // real course when we have it, otherwise lie horizontal (heading 90 = E)
        "icon-rotate": ["coalesce", ["get", "heading"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

function syncInvestigation(map: maplibregl.Map) {
  const src = map.getSource(AIS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const { activeId } = useScenarioStore.getState();
  const detection = activeId ? useDetectionStore.getState().byScenario[activeId] : undefined;
  const ranking = detection
    ? useInvestigationStore.getState().byDetection[detection.id]
    : undefined;
  if (!ranking) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const focusMmsi = useInvestigationStore.getState().focusMmsi;
  // Keep the map readable: the *selected* vessel (default = #1 suspect) gets its
  // full route through the area of interest; every other vessel is trimmed to a
  // short segment around its own closest approach — a "passed here" mark rather
  // than another full line crossing the view.
  const aoi = useScenarioStore.getState().active()?.aoi;
  const wideBox = aoi
    ? (() => {
        const mx = (aoi.east - aoi.west) * 0.4;
        const my = (aoi.north - aoi.south) * 0.4;
        return { w: aoi.west - mx, s: aoi.south - my, e: aoi.east + mx, n: aoi.north + my };
      })()
    : null;

  const feats: GeoJSON.Feature[] = [];
  ranking.cards.forEach((card, idx) => {
    const focused = focusMmsi != null && card.vessel.mmsi === focusMmsi;
    const trackF = (card.track.features as unknown as GeoJSON.Feature[]).find(
      (f) => (f.properties as { role?: string })?.role === "track",
    );
    const line =
      trackF?.geometry.type === "LineString"
        ? (trackF.geometry.coordinates as number[][])
        : undefined;
    const closestF = (card.track.features as unknown as GeoJSON.Feature[]).find(
      (f) => (f.properties as { role?: string })?.role === "closest",
    );
    const cp =
      closestF?.geometry.type === "Point"
        ? (closestF.geometry.coordinates as number[])
        : undefined;
    // ~12 km half-window around the closest approach for non-selected vessels
    const nearBox = cp
      ? { w: cp[0]! - 0.12, s: cp[1]! - 0.12, e: cp[0]! + 0.12, n: cp[1]! + 0.12 }
      : null;
    const box = focused ? wideBox : (nearBox ?? wideBox);

    for (const f of card.track.features as unknown as GeoJSON.Feature[]) {
      const isTrack = (f.properties as { role?: string })?.role === "track";
      const geometry =
        isTrack && box && f.geometry.type === "LineString"
          ? {
              ...f.geometry,
              coordinates: clipLineToBox(f.geometry.coordinates as number[][], box),
            }
          : f.geometry;
      const props: Record<string, unknown> = {
        ...f.properties,
        mmsi: card.vessel.mmsi,
        name: card.vessel.name,
        suspicion: card.suspicion_score,
        // cards arrive sorted by rank — use the position so the colour ramp is
        // always distinct even if the payload's `rank` is flat
        rank: idx + 1,
        focus: focused,
      };
      // orient the ship glyph along its course at the closest-approach point
      if (
        (f.properties as { role?: string })?.role === "closest"
        && f.geometry.type === "Point"
        && line
        && line.length > 1
      ) {
        const [px, py] = f.geometry.coordinates as [number, number];
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < line.length; k++) {
          const d = (line[k]![0]! - px) ** 2 + (line[k]![1]! - py) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        const a = line[Math.max(0, best - 1)]!;
        const b = line[Math.min(line.length - 1, best + 1)]!;
        props.heading = bearingDeg(a, b);
      }
      feats.push({ ...f, geometry, properties: props });
    }
  });
  src.setData({ type: "FeatureCollection", features: feats });
}

/** Keep only the run of a track that passes through `box` (+ one vertex either
 *  side so the line reaches the edge). If no vertex lands inside, fall back to a
 *  short slice around the vertex nearest the box centre. */
function clipLineToBox(
  coords: number[][],
  box: { w: number; s: number; e: number; n: number },
): number[][] {
  if (coords.length < 2) return coords;
  const inside = (c: number[]) =>
    c[0]! >= box.w && c[0]! <= box.e && c[1]! >= box.s && c[1]! <= box.n;
  let first = -1;
  let last = -1;
  for (let i = 0; i < coords.length; i++) {
    if (inside(coords[i]!)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first >= 0) {
    return coords.slice(Math.max(0, first - 1), Math.min(coords.length - 1, last + 1) + 1);
  }
  // nothing inside — take a 3-vertex slice centred on the closest vertex
  const cx = (box.w + box.e) / 2;
  const cy = (box.s + box.n) / 2;
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i]![0]! - cx) ** 2 + (coords[i]![1]! - cy) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return coords.slice(Math.max(0, bi - 1), Math.min(coords.length - 1, bi + 1) + 1);
}

function installOceanLayers(map: maplibregl.Map) {
  const empty = { type: "FeatureCollection" as const, features: [] };
  for (const src of [ORIGIN_SOURCE, HINDCAST_SOURCE, FORECAST_SOURCE, COAST_SOURCE]) {
    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: empty });
  }
  if (!map.getLayer("oe-origin-surface")) {
    map.addLayer({
      id: "oe-origin-surface",
      type: "fill",
      source: ORIGIN_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": tokenColor("layer-hindcast"),
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "weight"], 0.2],
          0,
          0.04,
          1,
          0.42,
        ],
      },
    });
  }
  if (!map.getLayer("oe-hindcast-line")) {
    map.addLayer({
      id: "oe-hindcast-line",
      type: "line",
      source: HINDCAST_SOURCE,
      paint: {
        "line-color": tokenColor("layer-hindcast"),
        "line-width": 2,
        "line-opacity": 0.9,
        "line-blur": 0.3,
        "line-dasharray": [2.4, 1.8],
      },
    });
  }
  if (!map.getLayer("oe-coast-line")) {
    map.addLayer({
      id: "oe-coast-line",
      type: "line",
      source: COAST_SOURCE,
      paint: {
        "line-color": [
          "case",
          [">=", ["coalesce", ["get", "likelihood"], 0], 0.5],
          tokenColor("danger"),
          [">", ["coalesce", ["get", "likelihood"], 0], 0],
          tokenColor("warning"),
          tokenColor("text-subtle"),
        ],
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer("oe-forecast-line")) {
    map.addLayer({
      id: "oe-forecast-line",
      type: "line",
      source: FORECAST_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        // one colour per ensemble member, matching its head ship
        "line-color": [
          "match", ["coalesce", ["get", "memberIdx"], 0],
          0, tokenColor("layer-suspect"),
          1, tokenColor("warning"),
          2, tokenColor("kelp"),
          tokenColor("layer-forecast"),
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "probability"], 0.3],
          0.1,
          2,
          0.6,
          4,
        ],
        "line-opacity": 0.88,
        "line-dasharray": [2.5, 1.5],
      },
    });
  }
  if (!map.getLayer("oe-forecast-head")) {
    // drift-ensemble tips on the forecast paths — ship glyphs, colour per member
    map.addLayer({
      id: "oe-forecast-head",
      type: "symbol",
      source: FORECAST_SOURCE,
      filter: ["==", ["get", "role"], "head"],
      layout: {
        "icon-image": [
          "match", ["coalesce", ["get", "memberIdx"], 0],
          0, "vessel-hot",
          1, "vessel-warn",
          2, "vessel-mid",
          "vessel-calm",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.26, 12, 0.56],
        "icon-rotate": ["coalesce", ["get", "heading"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  if (!map.getLayer("oe-origin-point")) {
    // a hollow target ring, not a filled dot — "X marks the estimated origin"
    map.addLayer({
      id: "oe-origin-point",
      type: "circle",
      source: ORIGIN_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6.5,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": tokenColor("warning"),
        "circle-stroke-width": 2.4,
        "circle-stroke-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("oe-origin-core")) {
    map.addLayer({
      id: "oe-origin-core",
      type: "circle",
      source: ORIGIN_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 1.6,
        "circle-color": tokenColor("warning"),
      },
    });
  }
}

function syncOcean(map: maplibregl.Map) {
  const originSrc = map.getSource(ORIGIN_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const hindcastSrc = map.getSource(HINDCAST_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const forecastSrc = map.getSource(FORECAST_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const coastSrc = map.getSource(COAST_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!originSrc || !hindcastSrc || !forecastSrc || !coastSrc) return;

  const { activeId } = useScenarioStore.getState();
  const detection = activeId ? useDetectionStore.getState().byScenario[activeId] : undefined;
  const entry = detection ? useOceanStore.getState().byDetection[detection.id] : undefined;

  const clear = (s: maplibregl.GeoJSONSource) =>
    s.setData({ type: "FeatureCollection", features: [] });

  if (entry?.hindcast) {
    const o = entry.hindcast.origin;
    originSrc.setData({
      type: "FeatureCollection",
      features: [
        ...(o.probability_surface.features as unknown as GeoJSON.Feature[]),
        {
          type: "Feature",
          properties: { role: "origin" },
          geometry: { type: "Point", coordinates: [o.point.lon, o.point.lat] },
        },
      ],
    });
    hindcastSrc.setData(
      entry.hindcast.backtrack_paths as unknown as GeoJSON.FeatureCollection,
    );
  } else {
    clear(originSrc);
    clear(hindcastSrc);
  }

  if (entry?.forecast) {
    const lines: GeoJSON.Feature[] = [];
    entry.forecast.scenarios.forEach((sc, memberIdx) => {
      const track = sc.track.features as unknown as GeoJSON.Feature[];
      const line = track.find((f) => f.geometry.type === "LineString");
      if (line) {
        const clipped = clipDriftToCoast(
          (line.geometry as GeoJSON.LineString).coordinates as [number, number][],
        );
        lines.push({
          ...line,
          geometry: { type: "LineString", coordinates: clipped },
          properties: {
            ...line.properties,
            probability: sc.probability,
            member: sc.id,
            memberIdx,
          },
        });
        const coords = clipped;
        const last = coords[coords.length - 1];
        const prev = coords[Math.max(0, coords.length - 2)];
        if (last)
          lines.push({
            type: "Feature",
            properties: {
              role: "head",
              member: sc.id,
              memberIdx,
              heading: prev ? bearingDeg(prev, last) : 0,
            },
            geometry: { type: "Point", coordinates: last },
          });
      }
    });
    forecastSrc.setData({ type: "FeatureCollection", features: lines });

    const coastFeats: GeoJSON.Feature[] = [];
    for (const c of entry.forecast.affected_coasts) {
      for (const f of c.geometry.features as unknown as GeoJSON.Feature[]) {
        coastFeats.push({
          ...f,
          properties: { ...f.properties, name: c.name, likelihood: c.likelihood },
        });
      }
    }
    coastSrc.setData({ type: "FeatureCollection", features: coastFeats });
  } else {
    clear(forecastSrc);
    clear(coastSrc);
  }
}

function syncDetection(map: maplibregl.Map) {
  const src = map.getSource(SPILL_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const { byScenario } = useDetectionStore.getState();
  const { activeId } = useScenarioStore.getState();
  const detection = activeId ? byScenario[activeId] : undefined;
  if (!detection) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  src.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: detection.id },
        geometry: detection.geometry.polygon as unknown as GeoJSON.Geometry,
      },
    ],
  });
  const b = detection.geometry.bbox;
  map.fitBounds(
    [
      [b.west, b.south],
      [b.east, b.north],
    ],
    { padding: 180, duration: 1200, maxZoom: 11 },
  );
}

function syncScenario(map: maplibregl.Map) {
  const { scenarios, activeId } = useScenarioStore.getState();
  const active = scenarios.find((s) => s.id === activeId);
  const src = map.getSource(AOI_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!active) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  src.setData({ type: "FeatureCollection", features: [bboxPolygon(active.aoi)] });
  const b = active.aoi;
  map.fitBounds(
    [
      [b.west, b.south],
      [b.east, b.north],
    ],
    { padding: 140, duration: 1400, maxZoom: 7.5 },
  );
}
