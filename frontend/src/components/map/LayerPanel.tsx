"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useMapStore } from "@/store/map";
import { BASEMAPS, type BasemapId } from "@/components/map/mapStyle";
import {
  LAYER_GROUP_LABEL,
  useLayersStore,
  type LayerDef,
  type LayerGroup,
} from "@/store/layers";

const BASEMAP_IDS = Object.keys(BASEMAPS) as BasemapId[];

const GROUP_ORDER: LayerGroup[] = ["base", "detection", "drift", "vessels", "environment"];

export function LayerPanel() {
  const [open, setOpen] = useState(true);
  const layers = useLayersStore((s) => s.layers);
  const toggle = useLayersStore((s) => s.toggle);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  // the basemap is read from localStorage on the client, so the server render
  // (always "natural") can differ — defer the active highlight until after mount
  // so hydration doesn't leave a stale one selected.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const byGroup = (g: LayerGroup) => layers.filter((l) => l.group === g);

  return (
    <div className="panel flex min-h-0 w-[17.5rem] flex-col overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full shrink-0 items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          <Layers size={13} /> Layers &amp; legend
        </span>
        <ChevronDown
          size={14}
          className={cn("text-text-subtle transition-transform", open ? "" : "-rotate-90")}
        />
      </button>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 py-2" style={{ maxHeight: "min(46vh, calc(100vh - 20rem))" }}>
          <div className="mb-2">
            <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Map style
            </div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {BASEMAP_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setBasemap(id)}
                  className={cn(
                    "rounded-[5px] border px-2 py-1 text-[11px] transition-colors",
                    hydrated && basemap === id
                      ? "border-accent/60 bg-accent/12 text-text"
                      : "border-border text-text-subtle hover:border-border-strong hover:text-text-muted",
                  )}
                >
                  {BASEMAPS[id].label}
                </button>
              ))}
            </div>
          </div>

          {GROUP_ORDER.map((g) => {
            const items = byGroup(g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-2 last:mb-0">
                <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                  {LAYER_GROUP_LABEL[g]}
                </div>
                {items.map((l) => (
                  <LayerRow
                    key={l.id}
                    layer={l}
                    onToggle={() => toggle(l.id)}
                    onOpacity={(v) => setOpacity(l.id, v)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LayerRow({
  layer,
  onToggle,
  onOpacity,
}: {
  layer: LayerDef;
  onToggle: () => void;
  onOpacity: (v: number) => void;
}) {
  const pending = Boolean(layer.availableFrom);
  const showSlider = !pending && layer.visible && layer.adjustable !== false;
  return (
    <div className={cn("rounded-sm px-1.5 py-1", pending && "opacity-55")}>
      <button
        onClick={onToggle}
        disabled={pending}
        title={layer.desc}
        className={cn(
          "group flex w-full items-center gap-2 py-0.5 text-left transition-colors",
          pending ? "cursor-not-allowed" : "hover:text-text",
        )}
      >
        <span
          className={cn(
            "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border",
            layer.visible ? "border-accent bg-accent/20" : "border-border-strong bg-transparent",
          )}
        >
          {layer.visible && <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" />}
        </span>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ background: `rgb(var(--${layer.swatch}))` }}
        />
        <span className="flex-1 truncate text-xs text-text">{layer.label}</span>
        {pending && <Badge tone="outline">{layer.availableFrom}</Badge>}
      </button>

      {layer.visible && !pending && (
        <p className="mt-0.5 pl-[1.375rem] pr-0.5 text-[0.66rem] leading-snug text-text-subtle">
          {layer.desc}
        </p>
      )}

      {showSlider && (
        <div className="mt-1 flex items-center gap-2 pl-[1.375rem] pr-0.5">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(layer.opacity * 100)}
            onChange={(e) => onOpacity(Number(e.target.value) / 100)}
            aria-label={`${layer.label} opacity`}
            className="layer-opacity h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border-strong/70 accent-accent"
          />
          <span className="tnum w-7 shrink-0 text-right text-[0.6rem] text-text-subtle">
            {Math.round(layer.opacity * 100)}
          </span>
        </div>
      )}
    </div>
  );
}
