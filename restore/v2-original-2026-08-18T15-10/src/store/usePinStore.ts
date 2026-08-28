"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PinState {
  pin: string;
  setPin: (pin: string) => void;
}

export const usePinStore = create<PinState>()(
  persist(
    (set) => ({
      pin: "",
      setPin: (pin: string) => set({ pin }),
    }),
    { name: "compass-draw-pin" }
  )
);
