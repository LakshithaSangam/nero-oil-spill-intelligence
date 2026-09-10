"use client";

import { create } from "zustand";

type Theme = "dark" | "light";

/** Which segmentation model the detection pipeline runs. "mock" is the smooth
 * scenario replay; the other two run a real CV / CNN over the SAR quicklook. */
export type SegModel = "mock" | "classical-sar" | "trained-unet";

interface UiState {
  theme: Theme;
  segModel: SegModel;
  panelCollapsed: boolean;
  /** the right-hand Intelligence panel collapsed to a slim rail */
  intelCollapsed: boolean;
  commandOpen: boolean;
  howItWorksOpen: boolean;
  /** cinematic auto-brief: the app drives itself through a full investigation */
  presenterOn: boolean;
  settingsOpen: boolean;
  /** the map layers / legend popover (opened from the top bar) */
  layersOpen: boolean;
  /** Show the built-in example investigations alongside real ones, so a new
   * visitor sees a populated app instead of an empty list. On by default. */
  sampleDataVisible: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSegModel: (m: SegModel) => void;
  togglePanel: () => void;
  toggleIntel: () => void;
  setCommandOpen: (v: boolean) => void;
  setHowItWorks: (v: boolean) => void;
  setPresenter: (v: boolean) => void;
  setSettings: (v: boolean) => void;
  setLayersOpen: (v: boolean) => void;
  toggleLayers: () => void;
  setSampleDataVisible: (v: boolean) => void;
}

const STORAGE_KEY = "neuro.theme";
const SAMPLE_DATA_KEY = "neuro.sampleDataVisible";
const SEG_MODEL_KEY = "neuro.segModel";

function initialSegModel(): SegModel {
  if (typeof window === "undefined") return "mock";
  const saved = window.localStorage.getItem(SEG_MODEL_KEY);
  return saved === "classical-sar" || saved === "trained-unet" ? saved : "mock";
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* private mode */
  }
}

function initialSampleDataVisible(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(SAMPLE_DATA_KEY);
  return saved === null ? true : saved === "1";
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  segModel: initialSegModel(),
  panelCollapsed: false,
  intelCollapsed: false,
  commandOpen: false,
  howItWorksOpen: false,
  presenterOn: false,
  settingsOpen: false,
  layersOpen: false,
  sampleDataVisible: initialSampleDataVisible(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  setSegModel: (segModel) => {
    set({ segModel });
    try {
      window.localStorage.setItem(SEG_MODEL_KEY, segModel);
    } catch {
      /* private mode */
    }
  },
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  toggleIntel: () => set((s) => ({ intelCollapsed: !s.intelCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setHowItWorks: (howItWorksOpen) => set({ howItWorksOpen }),
  setPresenter: (presenterOn) => set({ presenterOn }),
  setSettings: (settingsOpen) => set({ settingsOpen }),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  toggleLayers: () => set((s) => ({ layersOpen: !s.layersOpen })),
  setSampleDataVisible: (sampleDataVisible) => {
    set({ sampleDataVisible });
    try {
      window.localStorage.setItem(SAMPLE_DATA_KEY, sampleDataVisible ? "1" : "0");
    } catch {
      /* private mode */
    }
  },
}));
