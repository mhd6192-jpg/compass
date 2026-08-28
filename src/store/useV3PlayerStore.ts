"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which team this phone belongs to.
 *
 * Persisted for the same reason as the coach's court: a player picks their name
 * once when they scan the QR, and every look after that — usually a quick
 * glance between matches — should land straight on their own card.
 */
interface V3PlayerState {
  teamId: string | null;
  setTeam: (teamId: string | null) => void;
}

export const useV3PlayerStore = create<V3PlayerState>()(
  persist(
    (set) => ({
      teamId: null,
      setTeam: (teamId) => set({ teamId }),
    }),
    { name: "compass-v3-player" }
  )
);
