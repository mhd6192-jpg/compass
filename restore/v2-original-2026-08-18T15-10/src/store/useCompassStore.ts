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
  tournament: { status: string; format: string; bestOfSets: number; tiebreakMode: string };
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

let polling = false;
let prevMatches: Map<string, MatchDTO> | null = null;
const pendingCounts = new Map<string, number>();

// Serverless-friendly: polls /api/state on an interval instead of holding a
// socket open (Vercel functions don't have a persistent socket.io server).
// Per-point sound cues are sacrificed for this; match-completed/champion
// events are still derived by diffing each poll against the previous one.
export const useCompassStore = create<StoreState>((set, get) => ({
  connected: false,
  snapshot: null,
  lastPointEvent: null,
  completedEvents: [],
  tvControl: null,
  connect: () => {
    if (polling) return;
    polling = true;

    const poll = () =>
      fetch("/api/state")
        .then((r) => r.json())
        .then((snap: Snapshot) => {
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
        .catch(() => set({ connected: false }));

    poll();
    setInterval(poll, 800);
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
    fetch("/api/state")
      .then((r) => r.json())
      .then((snap: Snapshot) => set({ snapshot: snap }))
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
