"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled: boolean) => set({ enabled }),
    }),
    { name: "compass-draw-sound" }
  )
);
