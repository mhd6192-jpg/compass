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
interface PlayerState {
  teamId: string | null;
  setTeam: (teamId: string | null) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      teamId: null,
      setTeam: (teamId) => set({ teamId }),
    }),
    { name: "compass-v2-player" }
  )
);
