"use client";

import { create } from "zustand";
import { AnimationTier, MatchDTO, MatchStateDTO } from "@/lib/types";
import { formatMatchScoreLine } from "@/lib/scoring/format";

export interface TvControl {
  mode: "auto" | "pinned";
  sceneId: string;
  rev: number;
  updatedAt: number;
}

export interface Snapshot {
  tournament: { status: string; format: string; bestOfSets: number; tiebreakMode: string; raceTarget?: number; serveEvery?: number; raceWinBy?: number };
  courts: { id: number; label: string }[];
  matches: MatchDTO[];
  progress: { completed: number; total: number };
  tvControl?: TvControl;
}

export interface PointEvt {
  matchId: string;
  tier: AnimationTier;
  championshipWon: boolean;
  ts: number;
}

export interface CompletedEvt {
  key: string;
  matchId: string;
  bracket: string;
  roundName: string;
  winnerName?: string;
  loserName?: string;
  scoreLine: string;
  courtId: number | null;
  isChampionshipFinal: boolean;
  forced?: boolean;
  reason?: string;
  ts: number;
}

interface StoreState {
  connected: boolean;
  /**
   * When the last successful poll landed, so a screen can say how old the
   * picture it is showing actually is. `connected` alone cannot: a fetch that
   * hangs instead of failing never flips it.
   */
  lastSyncAt: number | null;
  snapshot: Snapshot | null;
  lastPointEvent: PointEvt | null;
  completedEvents: CompletedEvt[];
  tvControl: TvControl | null;
  connect: () => void;
  /** Instantly patches one match's live state client-side, ahead of the next
   * poll, so a tap on the scorer feels immediate instead of waiting ~1s for a
   * round trip + poll cycle. The next poll silently reconciles over it. */
  optimisticPoint: (matchId: string, newState: MatchStateDTO) => void;
  /** One-off out-of-cycle fetch, used to correct an optimistic update if the
   * point actually failed to save (bad PIN, network error, etc). */
  refresh: () => void;
  /** Marks a match as having an optimistic write in flight, so the next poll
   * doesn't clobber it with a snapshot fetched before that write landed —
   * that race is what caused the score to visibly jump around on rapid taps. */
  beginPending: (matchId: string) => void;
  endPending: (matchId: string) => void;
}

/** A poll that has not answered by now is not going to. */
const POLL_TIMEOUT_MS = 10_000;
let polling = false;
/** The revision of the last snapshot received, so unchanged polls cost nothing. */
let lastRev: string | null = null;
let prevMatches: Map<string, MatchDTO> | null = null;
const pendingCounts = new Map<string, number>();

// Serverless-friendly: polls /api/state on an interval instead of holding a
// socket open (Vercel functions don't have a persistent socket.io server).
// Per-point sound cues are sacrificed for this; match-completed/champion
// events are still derived by diffing each poll against the previous one.
export const useCompassStore = create<StoreState>((set, get) => ({
  connected: false,
  lastSyncAt: null,
  snapshot: null,
  lastPointEvent: null,
  completedEvents: [],
  tvControl: null,
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
      return fetch(`/api/state${lastRev ? `?since=${encodeURIComponent(lastRev)}` : ""}`, { signal: stop.signal })
        .then((r) => r.json())
        .then((snap: Snapshot & { unchanged?: boolean; rev?: string }) => {
          // Nothing has changed since the last poll, so there is nothing to
          // diff for celebrations and nothing to re-render.
          if (snap.unchanged) {
            set({ connected: true, lastSyncAt: Date.now() });
            return;
          }
          if (snap.rev) lastRev = snap.rev;
          const newlyCompleted: CompletedEvt[] = [];
          if (prevMatches) {
            for (const m of snap.matches) {
              const prev = prevMatches.get(m.id);
              if (m.status === "completed" && m.winnerId && prev && prev.status !== "completed" && m.player1 && m.player2) {
                const winnerIsP1 = m.winnerId === m.player1.id;
                newlyCompleted.push({
                  key: `${m.id}-${Date.now()}`,
                  matchId: m.id,
                  bracket: m.bracket,
                  roundName: m.roundName,
                  winnerName: winnerIsP1 ? m.player1.name : m.player2.name,
                  loserName: winnerIsP1 ? m.player2.name : m.player1.name,
                  scoreLine: m.forcedEnd ? m.forcedEndReason ?? "walkover" : formatMatchScoreLine(m),
                  courtId: m.courtId,
                  isChampionshipFinal: m.isChampionshipFinal,
                  forced: m.forcedEnd,
                  reason: m.forcedEndReason ?? undefined,
                  ts: Date.now(),
                });
              }
            }
          }
          prevMatches = new Map(snap.matches.map((m) => [m.id, m]));

          set((s) => {
            // Don't let a poll (which may have been fetched before an in-flight
            // point actually committed) stomp the optimistic state of a match
            // that's still mid-tap — keep the local version until it settles.
            const reconciled =
              pendingCounts.size === 0
                ? snap
                : {
                    ...snap,
                    matches: snap.matches.map((m) => {
                      if (!pendingCounts.get(m.id)) return m;
                      const local = s.snapshot?.matches.find((x) => x.id === m.id);
                      return local ?? m;
                    }),
                  };
            return {
              connected: true,
              lastSyncAt: Date.now(),
              snapshot: reconciled,
              completedEvents:
                newlyCompleted.length > 0
                  ? [...newlyCompleted, ...s.completedEvents.filter((e) => !newlyCompleted.some((n) => n.matchId === e.matchId))].slice(0, 40)
                  : s.completedEvents.length > 0
                    ? s.completedEvents
                    : backfillCompleted(snap),
              tvControl: snap.tvControl ?? s.tvControl,
              lastPointEvent: newlyCompleted[0]
                ? {
                    matchId: newlyCompleted[0].matchId,
                    tier: newlyCompleted[0].isChampionshipFinal ? "champion" : "match",
                    championshipWon: newlyCompleted[0].isChampionshipFinal,
                    ts: Date.now(),
                  }
                : get().lastPointEvent,
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
    setInterval(poll, 800);

    // Browsers throttle a hidden tab's timers to about once a minute, so a
    // screen that has just been woken — a phone out of a pocket, a TV whose
    // input was switched back — is showing a minute-old score. Ask again the
    // moment it returns rather than waiting for the next tick.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") poll();
    });
  },
  optimisticPoint: (matchId, newState) =>
    set((s) => {
      if (!s.snapshot) return {};
      return {
        snapshot: {
          ...s.snapshot,
          matches: s.snapshot.matches.map((m) =>
            m.id === matchId ? { ...m, state: newState, status: newState.matchWinnerSlot ? m.status : "in_progress" } : m
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
  refresh: () => {
    // Unconditional, for the same reason as the poll's counterpart: this is
    // called right after this device changed something.
    fetch("/api/state")
      .then((r) => r.json())
      .then((snap: Snapshot & { rev?: string }) => {
        if (snap.rev) lastRev = snap.rev;
        set({ snapshot: snap });
      })
      .catch(() => {});
  },
}));

function backfillCompleted(snap: Snapshot): CompletedEvt[] {
  return snap.matches
    .filter((m) => m.status === "completed" && m.player1 && m.player2 && m.winnerId)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 20)
    .map((m) => {
      const winnerIsP1 = m.winnerId === m.player1!.id;
      return {
        key: `backfill-${m.id}`,
        matchId: m.id,
        bracket: m.bracket,
        roundName: m.roundName,
        winnerName: winnerIsP1 ? m.player1!.name : m.player2!.name,
        loserName: winnerIsP1 ? m.player2!.name : m.player1!.name,
        scoreLine: m.forcedEnd ? m.forcedEndReason ?? "walkover" : formatMatchScoreLine(m),
        courtId: m.courtId,
        isChampionshipFinal: m.isChampionshipFinal,
        forced: m.forcedEnd,
        reason: m.forcedEndReason ?? undefined,
        ts: m.completedAt ? new Date(m.completedAt).getTime() : 0,
      };
    });
}

export function findMatch(snapshot: Snapshot | null, matchId: string | undefined): MatchDTO | undefined {
  if (!snapshot || !matchId) return undefined;
  return snapshot.matches.find((m) => m.id === matchId);
}
