import type { MatchDTO } from "./types";

export interface StandingsRow {
  /** Player/team id — stable across renders, unlike the display name. */
  id: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * The play-off created when the group ends level on wins at the top. It settles
 * first and second place but is deliberately NOT part of anyone's group record:
 * counting it would give the winner an extra win and the loser an extra loss,
 * which could drop the runner-up below an untied third team.
 */
export function isDeciderMatch(m: MatchDTO): boolean {
  return m.bracket === "RR" && m.round > 1;
}

/** Semifinals and the final of the two-group format. Like the play-off, they
 * decide placings rather than group records, so they never touch the tables. */
export function isKnockoutMatch(m: MatchDTO): boolean {
  return m.bracket === "SF" || m.bracket === "F";
}

/** The play-off match, if one has been created for this tournament. */
export function findDecider(matches: MatchDTO[]): MatchDTO | undefined {
  return matches.find(isDeciderMatch);
}

/** Points scored in one completed set by the player in slot `mySlot` (0 or 1). Uses
 * the tiebreak score when the set is a points-race decider (race-to-9, or a
 * within-set 7-6 breaker), otherwise the games score. */
function pointsInSet(set: { games: [number, number]; tiebreak?: [number, number] }, mySlot: 0 | 1): number {
  const isWholeMatchRace = !!set.tiebreak && set.games[0] + set.games[1] === 1;
  if (isWholeMatchRace) return set.tiebreak![mySlot];
  return set.games[mySlot];
}

/**
 * Standings ranked by wins, then total points scored (tiebreaker), then fewest
 * losses, then name. If a play-off was played, its winner and loser are lifted
 * to first and second regardless of that ordering — the match settles the title.
 */
export function computeStandings(matches: MatchDTO[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  const ensure = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { id, name, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 });
    return rows.get(id)!;
  };
  for (const m of matches) {
    if (!m.player1 || !m.player2) continue;
    ensure(m.player1.id, m.player1.name);
    ensure(m.player2.id, m.player2.name);
    if (isDeciderMatch(m) || isKnockoutMatch(m)) continue; // settle placings, not the group record
    if (m.status !== "completed" || !m.winnerId) continue;

    const winnerId = m.winnerId;
    const loserId = m.winnerId === m.player1.id ? m.player2.id : m.player1.id;
    const winnerRow = ensure(winnerId, m.winnerId === m.player1.id ? m.player1.name : m.player2.name);
    const loserRow = ensure(loserId, loserId === m.player1.id ? m.player1.name : m.player2.name);
    winnerRow.won++;
    loserRow.lost++;
    winnerRow.played++;
    loserRow.played++;

    const p1IsWinner = winnerId === m.player1.id;
    for (const set of m.state.completedSets) {
      const winnerPts = pointsInSet(set, p1IsWinner ? 0 : 1);
      const loserPts = pointsInSet(set, p1IsWinner ? 1 : 0);
      winnerRow.pointsFor += winnerPts;
      winnerRow.pointsAgainst += loserPts;
      loserRow.pointsFor += loserPts;
      loserRow.pointsAgainst += winnerPts;
    }
  }

  const ranked = [...rows.values()].sort(
    (a, b) => b.won - a.won || b.pointsFor - a.pointsFor || a.lost - b.lost || a.name.localeCompare(b.name)
  );

  const decider = matches.find((m) => isDeciderMatch(m) && m.status === "completed" && m.winnerId);
  if (!decider) return ranked;

  const winnerId = decider.winnerId!;
  const loserId = decider.loserId ?? (winnerId === decider.player1?.id ? decider.player2?.id : decider.player1?.id);
  const first = ranked.find((r) => r.id === winnerId);
  const second = ranked.find((r) => r.id === loserId);
  if (!first || !second) return ranked;
  return [first, second, ...ranked.filter((r) => r !== first && r !== second)];
}
