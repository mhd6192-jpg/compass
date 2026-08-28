"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which court this phone belongs to, and who is holding it.
 *
 * Persisted because a coach picks their court once at the start of the day —
 * every reload after that should land straight on their own console, not on a
 * chooser.
 */
interface CoachState {
  courtId: number | null;
  name: string;
  setCourt: (courtId: number | null) => void;
  setName: (name: string) => void;
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set) => ({
      courtId: null,
      name: "",
      setCourt: (courtId) => set({ courtId }),
      setName: (name) => set({ name }),
    }),
    { name: "compass-v2-coach" }
  )
);
