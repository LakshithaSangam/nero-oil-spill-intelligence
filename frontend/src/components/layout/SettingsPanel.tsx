"use client";

import { useEffect } from "react";
import { ArrowRight, Check, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASEMAPS, type BasemapId } from "@/components/map/mapStyle";
import { useLayersStore } from "@/store/layers";
import { useMapStore } from "@/store/map";
import { useUiStore, type SegModel } from "@/store/ui";

const BASEMAP_IDS = Object.keys(BASEMAPS) as BasemapId[];

const SEG_MODELS: { id: SegModel; label: string; sub: string }[] = [
  {
    id: "mock",
    label: "Scenario replay",
    sub: "Calibrated slick for a smooth walkthrough (default)",
  },
  {
    id: "classical-sar",
    label: "Classical SAR CV",
    sub: "Adaptive dark-spot detection over the Sentinel-1 quicklook — no training",
  },
  {
    id: "trained-unet",
    label: "Trained U-Net",
    sub: "CNN segmentation checkpoint; falls back to the scenario mask if the geometry is implausible",
  },
];

const BASEMAP_HINT: Record<BasemapId, string> = {
  natural: "True colour physical map: green land, real ocean depth",
  atlas: "National Geographic style, with place and ocean labels",
  satellite: "Live satellite imagery",
  abyssal: "Dark navigational chart",
  light: "Minimal light canvas",
};

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettings);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);

  const layers = useLayersStore((s) => s.layers);
  const toggleLayer = useLayersStore((s) => s.toggle);
  const heatOn = layers.find((l) => l.id === "incident-heat")?.visible ?? false;
  const markersOn = layers.find((l) => l.id === "incidents")?.visible ?? false;
  const tempOn = layers.find((l) => l.id === "temperature")?.visible ?? false;
  const sarOn = layers.find((l) => l.id === "sar-quicklook")?.visible ?? false;

  const sampleDataVisible = useUiStore((s) => s.sampleDataVisible);
  const setSampleDataVisible = useUiStore((s) => s.setSampleDataVisible);
  const setHowItWorks = useUiStore((s) => s.setHowItWorks);
  const setPresenter = useUiStore((s) => s.setPresenter);
  const segModel = useUiStore((s) => s.segModel);
  const setSegModel = useUiStore((s) => s.setSegModel);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[900] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <button
        aria-label="Close settings"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[rgb(var(--navy-950)/0.72)] backdrop-blur-[3px]"
      />

      <div className="panel relative flex max-h-[86vh] w-[min(34rem,92vw)] flex-col overflow-hidden">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <p className="eyebrow text-[0.58rem]">Preferences</p>
            <h2 className="h-editorial mt-1.5 text-[1.4rem] text-text">Settings</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-[5px] border border-border text-text-subtle transition-colors hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-7 overflow-y-auto px-6 py-6">
          {/* Appearance */}
          <Section label="Appearance" hint="Applies across the whole application.">
            <div className="grid grid-cols-2 gap-2">
              <Choice
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                icon={<Moon size={14} />}
                title="Dark"
                sub="Operations centre"
              />
              <Choice
                active={theme === "light"}
                onClick={() => setTheme("light")}
                icon={<Sun size={14} />}
                title="Light"
                sub="Daylight / print"
              />
            </div>
          </Section>

          {/* Base map */}
          <Section label="Base map">
            <div className="space-y-1">
              {BASEMAP_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setBasemap(id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[5px] border px-3 py-2 text-left transition-colors",
                    basemap === id
                      ? "border-accent/55 bg-accent/10"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {basemap === id && <Check size={14} className="text-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[0.82rem] text-text">{BASEMAPS[id].label}</span>
                    <span className="block text-[0.68rem] text-text-subtle">{BASEMAP_HINT[id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* Map layers */}
          <Section label="Map layers" hint="Also available from the Layers panel on the map.">
            <Toggle
              on={markersOn}
              onClick={() => toggleLayer("incidents")}
              title="Known incident markers"
              sub="Reported NOAA spills plus our replay set"
            />
            <Toggle
              on={heatOn}
              onClick={() => toggleLayer("incident-heat")}
              title="Incident density heatmap"
              sub="Where reported spills cluster, weighted by severity"
            />
            <Toggle
              on={tempOn}
              onClick={() => toggleLayer("temperature")}
              title="Temperature heatmap"
              sub="Real 2 m air temperature as a blue-to-red weather-map wash over the view"
            />
            <Toggle
              on={sarOn}
              onClick={() => toggleLayer("sar-quicklook")}
              title="SAR quicklook"
              sub="The Sentinel-1 radar scene the detector segments, over its acquisition footprint"
            />
          </Section>

          {/* Detection model */}
          <Section
            label="Detection model"
            hint="Which segmenter the pipeline runs on the SAR quicklook the next time you run an investigation."
          >
            <div className="space-y-1">
              {SEG_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSegModel(m.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[5px] border px-3 py-2 text-left transition-colors",
                    segModel === m.id
                      ? "border-accent/55 bg-accent/10"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {segModel === m.id && <Check size={14} className="text-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[0.82rem] text-text">{m.label}</span>
                    <span className="block text-[0.68rem] text-text-subtle">{m.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* Sample data */}
          <Section label="Sample data" hint="For getting a feel for the app before bringing your own incident.">
            <Toggle
              on={sampleDataVisible}
              onClick={() => setSampleDataVisible(!sampleDataVisible)}
              title="Show example investigations"
              sub="A couple of worked incidents on the dashboard and investigations list"
            />
          </Section>

          {/* Walkthrough */}
          <Section label="Walkthrough" hint="Two ways in: read the pipeline, or watch it run itself.">
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  setHowItWorks(true);
                }}
                className="flex w-full items-center gap-3 rounded-[5px] border border-border px-3 py-2 text-left transition-colors hover:border-accent/55"
              >
                <span className="flex-1">
                  <span className="block text-[0.82rem] text-text">How it works</span>
                  <span className="block text-[0.68rem] text-text-subtle">
                    Six-step explainer of the detection-to-report pipeline
                  </span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-text-subtle" />
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setPresenter(true);
                }}
                className="flex w-full items-center gap-3 rounded-[5px] border border-accent/40 bg-accent/[0.07] px-3 py-2 text-left transition-colors hover:border-accent/70"
              >
                <span className="flex-1">
                  <span className="block text-[0.82rem] text-text">Play presenter brief</span>
                  <span className="block text-[0.68rem] text-text-subtle">
                    Hands-free: the app drives a full investigation on the live map · press P
                  </span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-accent" />
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="eyebrow text-[0.58rem]">{label}</h3>
      {hint && <p className="mt-1 text-[0.7rem] text-text-subtle">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Choice({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-[6px] border px-3 py-2.5 text-left transition-colors",
        active ? "border-accent/55 bg-accent/10 text-text" : "border-border text-text-muted hover:border-border-strong",
      )}
    >
      <span className={cn("flex items-center gap-1.5", active && "text-accent")}>{icon}</span>
      <span className="text-[0.82rem] text-text">{title}</span>
      <span className="text-[0.66rem] text-text-subtle">{sub}</span>
    </button>
  );
}

function Toggle({
  on,
  onClick,
  title,
  sub,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center gap-3 rounded-[5px] px-1 py-2 text-left transition-colors hover:bg-surface-3/40"
    >
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full border transition-colors",
          on ? "border-accent/60 bg-accent/30" : "border-border-strong bg-transparent",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all",
            on ? "left-[0.9rem] bg-accent" : "left-0.5 bg-text-subtle",
          )}
        />
      </span>
      <span className="flex-1">
        <span className="block text-[0.82rem] text-text">{title}</span>
        <span className="block text-[0.68rem] text-text-subtle">{sub}</span>
      </span>
    </button>
  );
}
