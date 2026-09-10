"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { readStoredBasemap, useMapStore } from "@/store/map";

const MapCanvasImpl = dynamic(() => import("./MapCanvasImpl"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-bg">
      <span className="text-xs tracking-widest text-text-subtle">CHARTING…</span>
    </div>
  ),
});

export function MapCanvas() {
  // Re-assert the remembered basemap on every mount. The server render always
  // starts from "natural" (no localStorage there), and a hard load re-creates the
  // store, so without this the user's chosen style silently reverts.
  useEffect(() => {
    const stored = readStoredBasemap();
    if (useMapStore.getState().basemap !== stored) useMapStore.getState().setBasemap(stored);
  }, []);

  return <MapCanvasImpl />;
}
