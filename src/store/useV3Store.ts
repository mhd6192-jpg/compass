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

/** While a court has a match on it — somebody is watching a number change. */
const POLL_LIVE_MS = 350;
/** Nothing on court: between events, or before the draw is seeded. */
const POLL_IDLE_MS = 2000;
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

    /**
     * How long to wait before asking again.
     *
     * The wait between polls turned out to matter as much as the request
     * itself. Measured from Muscat, a poll takes about 400ms — so a fixed
     * 800ms tick meant a point took 400ms to fetch and, on average, another
     * 400ms just sitting there before anybody asked for it.
     *
     * So the rate follows what is actually happening. While a court has a
     * match on it the screens ask three times a second, because that is when
     * somebody is watching a number they expect to change. With nothing on
     * court — between events, or before the draw is seeded — they drop to once
     * every two seconds, which is both kinder than the old fixed rate and
     * completely unnoticeable.
     */
    const nextDelay = () => {
      const snap = get().snapshot;
      if (!snap) return POLL_LIVE_MS; // still connecting: keep asking
      const onCourt = snap.matches.some((m) => m.courtId !== null && m.status !== "completed");
      return onCourt ? POLL_LIVE_MS : POLL_IDLE_MS;
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const started = Date.now();
      await poll();

      // Timed from when the request STARTED, not when it came back. Waiting
      // the full delay after the answer would add the round trip to every
      // cycle — with a 400ms request a 350ms delay becomes a 750ms cycle,
      // which is barely different from the fixed 800ms tick this replaced.
      // Measured this way the delay is a target rate, and a server slower than
      // the target simply paces itself instead of stacking requests up.
      const spent = Date.now() - started;
      timer = setTimeout(tick, Math.max(0, nextDelay() - spent));
    };

    void tick();

    // Browsers throttle a hidden tab's timers to about once a minute, so a
    // screen that has just been woken — a phone out of a pocket, a TV whose
    // input was switched back — is showing a minute-old score. Ask again the
    // moment it returns rather than waiting for the next tick.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void tick();
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
