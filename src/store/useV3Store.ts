"use client";

import { create } from "zustand";
import { MatchDTO, MatchStateDTO } from "@/lib/types";
import type { AwardDTO, V2StateDTO } from "@/lib/v2/stage";
import { IDLE_CEREMONY } from "@/lib/v2/stage";
import { pendingFor } from "@/lib/v3/outbox";

export interface V2Snapshot {
  tournament: { status: string; format: string; discipline: string; bestOfSets: number; tiebreakMode: string; raceTarget?: number; serveEvery?: number; raceWinBy?: number };
  courts: { id: number; label: string }[];
  matches: MatchDTO[];
  progress: { completed: number; total: number };
  v2: V2StateDTO & { podium: AwardDTO[] };
}

interface V2StoreState {
  connected: boolean;
  /**
   * When the last successful poll landed, so a screen can say how old the
   * picture it is showing actually is. `connected` alone cannot: a fetch that
   * hangs instead of failing never flips it.
   */
  lastSyncAt: number | null;
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
/** A poll that has not answered by now is not going to. */
const POLL_TIMEOUT_MS = 10_000;
let polling = false;
/**
 * The revision of the last snapshot actually received.
 *
 * Sent back with every poll so the server can answer "unchanged" instead of
 * rebuilding and resending a state nobody has changed — which is most polls,
 * since the score moves every few seconds and this asks every 800ms.
 */
let lastRev: string | null = null;
/** Match state as the server last reported it, keyed by match. */
const serverStates = new Map<string, MatchStateDTO>();

const EMPTY_V2: V2StateDTO & { podium: AwardDTO[] } = { ready: false, courts: [], ceremony: IDLE_CEREMONY, podium: [] };

export const useV3Store = create<V2StoreState>((set, get) => ({
  connected: false,
  lastSyncAt: null,
  snapshot: null,

  connect: () => {
    if (polling) return;
    polling = true;
    let inFlight = false;
    const poll = () => {
      // A poll that has not come back yet is no reason to start another. On a
      // bad connection they pile up, and the pile is what makes a bad
      // connection worse.
      if (inFlight) return;
      inFlight = true;
      // fetch has no timeout of its own, and a connection that hangs rather
      // than failing would leave every screen looking perfectly fresh forever.
      const stop = new AbortController();
      const bell = setTimeout(() => stop.abort(), POLL_TIMEOUT_MS);
      return fetch(`/api/v2/state${lastRev ? `?since=${encodeURIComponent(lastRev)}` : ""}`, { signal: stop.signal })
        .then((r) => r.json())
        .then((snap: V2Snapshot & { unchanged?: boolean; rev?: string }) => {
          // Nothing has moved: keep what is on screen and say we are connected.
          if (snap.unchanged) {
            set({ connected: true, lastSyncAt: Date.now() });
            return;
          }
          if (snap.rev) lastRev = snap.rev;
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
              lastSyncAt: Date.now(),
              snapshot: { ...snap, matches, v2: snap.v2 ?? EMPTY_V2 },
            };
          });
        })
        .catch(() => set({ connected: false }))
        .finally(() => {
          clearTimeout(bell);
          inFlight = false;
        });
    };

    poll();
    setInterval(poll, POLL_MS);

    // Browsers throttle a hidden tab's timers to about once a minute, so a
    // screen that has just been woken — a phone out of a pocket, a TV whose
    // input was switched back — is showing a minute-old score. Ask again the
    // moment it returns rather than waiting for the next tick.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") poll();
    });
  },

  refresh: () => {
    // Deliberately unconditional: refresh is called right after this device
    // changed something, and it wants the result of that change, not a "no news".
    fetch("/api/v2/state")
      .then((r) => r.json())
      .then((snap: V2Snapshot & { rev?: string }) => {
        if (snap.rev) lastRev = snap.rev;
        return snap;
      })
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
  const snapshot = useV3Store((s) => s.snapshot);
  if (!snapshot || !matchId) return undefined;
  return snapshot.matches.find((m) => m.id === matchId);
}

export function v2Get() {
  return useV3Store.getState();
}
