import { BRACKET_LABELS, BracketCode, MatchDTO } from "./types";

export interface FastestMatch {
  match: MatchDTO;
  durationMs: number;
  winnerName: string;
  loserName: string;
}

/** Fastest completed, fully-played match (excludes forced ends and walkovers, which aren't a real pace signal). */
export function getFastestMatch(matches: MatchDTO[]): FastestMatch | null {
  let best: FastestMatch | null = null;
  for (const m of matches) {
    if (m.status !== "completed" || m.forcedEnd || !m.startedAt || !m.completedAt || !m.winnerId) continue;
    const durationMs = new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime();
    if (durationMs <= 0) continue;
    if (!best || durationMs < best.durationMs) {
      const winnerName = (m.winnerId === m.player1?.id ? m.player1?.name : m.player2?.name) ?? "Unknown";
      const loserName = (m.winnerId === m.player1?.id ? m.player2?.name : m.player1?.name) ?? "Unknown";
      best = { match: m, durationMs, winnerName, loserName };
    }
  }
  return best;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface CrownedChampion {
  bracket: BracketCode;
  label: string;
  championName: string | null;
  runnerUpName: string | null;
}

const ALL_BRACKETS: BracketCode[] = ["E", "W", "N", "S", "NE", "SE", "NW", "SW"];

export function getCrownedChampions(matches: MatchDTO[]): CrownedChampion[] {
  return ALL_BRACKETS.map((bracket) => {
    const final = matches.find((m) => m.bracket === bracket && m.isBracketFinal);
    const decided = final?.status === "completed" && final.winnerId;
    const championName = decided ? (final!.winnerId === final!.player1?.id ? final!.player1?.name : final!.player2?.name) ?? null : null;
    const runnerUpName = decided ? (final!.winnerId === final!.player1?.id ? final!.player2?.name : final!.player1?.name) ?? null : null;
    return { bracket, label: BRACKET_LABELS[bracket], championName, runnerUpName };
  });
}
