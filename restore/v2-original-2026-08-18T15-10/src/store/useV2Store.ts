"use client";

import { create } from "zustand";
import { MatchDTO, MatchStateDTO } from "@/lib/types";
import type { AwardDTO, V2StateDTO } from "@/lib/v2/stage";
import { IDLE_CEREMONY } from "@/lib/v2/stage";

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
  beginPending: (matchId: string) => void;
  endPending: (matchId: string) => void;
}

const POLL_MS = 800;
let polling = false;
const pendingCounts = new Map<string, number>();

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
          set((s) => {
            // A poll that left the server before an in-flight tap committed must
            // not stomp the optimistic score on the coach's phone — same guard
            // v1 uses, and the reason rapid taps don't visibly bounce around.
            const matches =
              pendingCounts.size === 0
                ? snap.matches
                : snap.matches.map((m) => {
                    if (!pendingCounts.get(m.id)) return m;
                    return s.snapshot?.matches.find((x) => x.id === m.id) ?? m;
                  });
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
      .then((snap: V2Snapshot) => set({ snapshot: { ...snap, v2: snap.v2 ?? EMPTY_V2 } }))
      .catch(() => {});
  },

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

  beginPending: (matchId) => pendingCounts.set(matchId, (pendingCounts.get(matchId) ?? 0) + 1),
  endPending: (matchId) => {
    const n = (pendingCounts.get(matchId) ?? 1) - 1;
    if (n <= 0) pendingCounts.delete(matchId);
    else pendingCounts.set(matchId, n);
  },
}));

export function useV2Match(matchId: string | null | undefined): MatchDTO | undefined {
  const snapshot = useV2Store((s) => s.snapshot);
  if (!snapshot || !matchId) return undefined;
  return snapshot.matches.find((m) => m.id === matchId);
}

export function v2Get() {
  return useV2Store.getState();
}
