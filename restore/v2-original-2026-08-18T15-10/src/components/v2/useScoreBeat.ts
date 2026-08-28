"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchDTO } from "@/lib/types";

export interface ScoreBeat {
  tier: "game" | "set";
  ts: number;
}

/**
 * Fires a GAME / SET beat by diffing the match state between polls.
 *
 * v1's display gets these from socket events; the v2 screens poll, so the beat
 * is reconstructed locally from what changed — games played in the current set,
 * and sets completed. Same visual payoff, no socket required (which matters:
 * on Vercel there is no persistent socket server).
 */
export function useScoreBeat(match: MatchDTO | null): ScoreBeat | null {
  const [beat, setBeat] = useState<ScoreBeat | null>(null);
  const prev = useRef<{ matchId: string; games: number; sets: number } | null>(null);

  const matchId = match?.id ?? null;
  const games = match ? (match.state.currentSet?.games[0] ?? 0) + (match.state.currentSet?.games[1] ?? 0) : 0;
  const sets = match ? match.state.completedSets.length : 0;

  useEffect(() => {
    if (!matchId) {
      prev.current = null;
      return;
    }
    const before = prev.current;
    prev.current = { matchId, games, sets };
    if (!before || before.matchId !== matchId) return; // first sight of this match — nothing to celebrate
    if (sets > before.sets) setBeat({ tier: "set", ts: Date.now() });
    else if (games > before.games) setBeat({ tier: "game", ts: Date.now() });
  }, [matchId, games, sets]);

  // Beats are momentary; clear them so a re-render can't leave a stamp on screen.
  useEffect(() => {
    if (!beat) return;
    const t = setTimeout(() => setBeat(null), beat.tier === "set" ? 2000 : 1300);
    return () => clearTimeout(t);
  }, [beat]);

  return beat;
}
