import { MatchDTO, isPointsRace } from "../types";

interface CompletedSet {
  games: [number, number];
  tiebreak?: [number, number];
}

export function formatSetScore(set: CompletedSet, winnerSlot: 1 | 2): string {
  const g: [number, number] = winnerSlot === 1 ? set.games : [set.games[1], set.games[0]];
  if (set.tiebreak) {
    const isMatchTiebreakDecider = set.games[0] + set.games[1] === 1;
    const tb: [number, number] = winnerSlot === 1 ? set.tiebreak : [set.tiebreak[1], set.tiebreak[0]];
    if (isMatchTiebreakDecider) {
      return `[${tb[0]}-${tb[1]}]`;
    }
    return `${g[0]}-${g[1]}(${tb[1]})`;
  }
  return `${g[0]}-${g[1]}`;
}

export function formatMatchScoreLine(match: MatchDTO): string {
  if (!match.winnerId || !match.player1 || !match.player2) return "";
  const winnerSlot: 1 | 2 = match.winnerId === match.player1.id ? 1 : 2;
  if (isPointsRace(match.state.config.tiebreakMode)) {
    const s = match.state.completedSets[0];
    if (s?.tiebreak) {
      const tb: [number, number] = winnerSlot === 1 ? s.tiebreak : [s.tiebreak[1], s.tiebreak[0]];
      return `${tb[0]}-${tb[1]}`;
    }
  }
  return match.state.completedSets.map((s) => formatSetScore(s, winnerSlot)).join(", ");
}
