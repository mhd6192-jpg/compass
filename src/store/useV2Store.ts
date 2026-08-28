"use client";

import { create } from "zustand";
import { MatchDTO, MatchStateDTO } from "@/lib/types";
import type { AwardDTO, V2StateDTO } from "@/lib/v2/stage";
import { IDLE_CEREMONY } from "@/lib/v2/stage";
import { pendingFor } from "@/lib/v2/outbox";

export interface V2Snapshot {
  tournament: { status: string; format: string; bestOfSets: number; tiebreakMode: string };
  courts: { id: number; label: string }[];
  matches: MatchDTO[];
  progress: { completed: number; total: number };
  v2: V2StateDTO & { podium: AwardDTO[] };
}

interface V2StoreState {
  connected: boolean;
  snapshot: V2Snapshot | null;
  connect: () => void;
  refresh: () => void;
  /** Paints a tapped point on the coach's screen immediately; the next poll reconciles. */
  optimisticPoint: (matchId: string, state: MatchStateDTO) => void;
  /**
   * Points this match had at the last successful poll — the number a queued
   * tap's sequence must be counted from. Deliberately not the optimistic value,
   * which already includes taps the server has not seen.
   */
  serverPointsFor: (matchId: string) => number;
  /**
   * The match state exactly as the server last reported it, before any
   * optimistic taps were painted on top. Undo needs it to rebuild the display
   * from scratch after taking a point back out of the queue.
   */
  serverStateFor: (matchId: string) => MatchStateDTO | null;
}

const POLL_MS = 800;
let polling = false;
/** Match state as the server last reported it, keyed by match. */
const serverStates = new Map<string, MatchStateDTO>();

const EMPTY_V2: V2StateDTO & { podium: AwardDTO[] } = { ready: false, courts: [], ceremony: IDLE_CEREMONY, podium: [] };

export const useV2Store = create<V2StoreState>((set, get) => ({
  connected: false,
  snapshot: null,

  connect: () => {
    if (polling) return;
    polling = true;
    const poll = () =>
      fetch("/api/v2/state")
        .then((r) => r.json())
        .then((snap: V2Snapshot) => {
          for (const m of snap.matches) serverStates.set(m.id, m.state);
          set((s) => {
            // While taps are still queued for a match, the server's score is
            // behind what the coach has already scored — showing it would make
            // the number jump backwards on their phone. Hold the local view
            // until the queue for that match has drained.
            const matches = snap.matches.map((m) =>
              pendingFor(m.id) > 0 ? s.snapshot?.matches.find((x) => x.id === m.id) ?? m : m
            );
            return {
              connected: true,
              snapshot: { ...snap, matches, v2: snap.v2 ?? EMPTY_V2 },
            };
          });
        })
        .catch(() => set({ connected: false }));

    poll();
    setInterval(poll, POLL_MS);
  },

  refresh: () => {
    fetch("/api/v2/state")
      .then((r) => r.json())
      .then((snap: V2Snapshot) =>
        set((s) => {
          for (const m of snap.matches) serverStates.set(m.id, m.state);
          const matches = snap.matches.map((m) =>
            pendingFor(m.id) > 0 ? s.snapshot?.matches.find((x) => x.id === m.id) ?? m : m
          );
          return { snapshot: { ...snap, matches, v2: snap.v2 ?? EMPTY_V2 } };
        })
      )
      .catch(() => {});
  },

  serverPointsFor: (matchId) => serverStates.get(matchId)?.totalPoints ?? 0,

  serverStateFor: (matchId) => serverStates.get(matchId) ?? null,

  optimisticPoint: (matchId, state) =>
    set((s) => {
      if (!s.snapshot) return {};
      return {
        snapshot: {
          ...s.snapshot,
          matches: s.snapshot.matches.map((m) =>
            m.id === matchId ? { ...m, state, status: state.matchWinnerSlot ? m.status : "in_progress" } : m
          ),
        },
      };
    }),

}));

export function useV2Match(matchId: string | null | undefined): MatchDTO | undefined {
  const snapshot = useV2Store((s) => s.snapshot);
  if (!snapshot || !matchId) return undefined;
  return snapshot.matches.find((m) => m.id === matchId);
}

export function v2Get() {
  return useV2Store.getState();
}
