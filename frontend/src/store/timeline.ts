"use client";

import { create } from "zustand";

type Mode = "forecast" | "reconstruction";
export type PlaybackSpeed = 1 | 2 | 5;

interface TimelineState {
  hour: number;
  startHour: number; // negative in reconstruction mode
  horizon: number;
  mode: Mode;
  playing: boolean;
  speed: PlaybackSpeed;
  /** a second hour pinned for before/after comparison, or null */
  compareHour: number | null;
  setHour: (h: number) => void;
  setStartHour: (h: number) => void;
  setHorizon: (h: number) => void;
  setMode: (m: Mode) => void;
  setPlaying: (v: boolean) => void;
  setSpeed: (s: PlaybackSpeed) => void;
  setCompareHour: (h: number | null) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  hour: 0,
  startHour: 0,
  horizon: 72,
  mode: "forecast",
  playing: false,
  speed: 1,
  compareHour: null,
  setHour: (hour) => set({ hour }),
  setStartHour: (startHour) => set({ startHour }),
  setHorizon: (horizon) => set({ horizon }),
  setMode: (mode) => set({ mode }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setCompareHour: (compareHour) => set({ compareHour }),
}));
