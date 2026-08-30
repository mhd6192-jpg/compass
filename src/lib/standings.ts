import type { MatchDTO } from "./types";
import { teamName } from "./bracket/teamAmericano";

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
 *
 * Americano is ranked the other way up — by points first — and credits the
 * FOUR individuals in each match rather than the two rows. Partners rotate
 * every round there, so a result belongs to people, not to a side; ranking on
 * wins would also be close to meaningless when everybody wins about half their
 * matches with different partners. Both cases are handled here rather than in a
 * parallel function so that every table, podium and player card in the app
 * gets americano right without knowing it exists.
 */
export function computeStandings(matches: MatchDTO[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  const ensure = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { id, name, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 });
    return rows.get(id)!;
  };
  // Set by any match whose sides are pairs of individuals — i.e. an americano.
  let byIndividual = false;

  for (const m of matches) {
    if (!m.player1 || !m.player2) continue;
    const side1 = m.player1Members ?? [m.player1];
    const side2 = m.player2Members ?? [m.player2];
    if (m.player1Members || m.player2Members) byIndividual = true;
    for (const p of [...side1, ...side2]) ensure(p.id, p.name);

    if (isDeciderMatch(m) || isKnockoutMatch(m)) continue; // settle placings, not the group record
    if (m.status !== "completed" || !m.winnerId) continue;

    const p1IsWinner = m.winnerId === m.player1.id;
    const winners = p1IsWinner ? side1 : side2;
    const losers = p1IsWinner ? side2 : side1;

    let winnerPts = 0;
    let loserPts = 0;
    for (const set of m.state.completedSets) {
      winnerPts += pointsInSet(set, p1IsWinner ? 0 : 1);
      loserPts += pointsInSet(set, p1IsWinner ? 1 : 0);
    }

    for (const p of winners) {
      const row = ensure(p.id, p.name);
      row.won++;
      row.played++;
      row.pointsFor += winnerPts;
      row.pointsAgainst += loserPts;
    }
    for (const p of losers) {
      const row = ensure(p.id, p.name);
      row.lost++;
      row.played++;
      row.pointsFor += loserPts;
      row.pointsAgainst += winnerPts;
    }
  }

  const ranked = [...rows.values()].sort((a, b) =>
    byIndividual
      ? b.pointsFor - a.pointsFor || b.won - a.won || a.pointsAgainst - b.pointsAgainst || a.name.localeCompare(b.name)
      : b.won - a.won || b.pointsFor - a.pointsFor || a.lost - b.lost || a.name.localeCompare(b.name)
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

/**
 * The two team totals of a team americano.
 *
 * Every point a player wins belongs to their side, so this is the individual
 * table added up by team — and it is the table that decides the event. A match
 * always has one team on each side of the net (that is how the schedule is
 * built), so a side's whole score goes to exactly one team.
 *
 * `won`/`lost` count MATCHES, not players: a 2-0 round for team A is one win
 * per match played, which is what people mean when they ask the score.
 */
export function computeTeamStandings(matches: MatchDTO[]): StandingsRow[] {
  const rows = new Map<number, StandingsRow>();
  const ensure = (team: number) => {
    if (!rows.has(team)) {
      rows.set(team, { id: `team-${team}`, name: teamName(team), played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 });
    }
    return rows.get(team)!;
  };

  for (const m of matches) {
    const side1 = m.player1Members ?? [];
    const side2 = m.player2Members ?? [];
    const t1 = side1[0]?.team ?? 0;
    const t2 = side2[0]?.team ?? 0;
    if (!t1 || !t2 || t1 === t2) continue; // not a team fixture
    ensure(t1);
    ensure(t2);
    if (m.status !== "completed" || !m.winnerId) continue;

    const p1Won = m.winnerId === m.player1?.id;
    let p1Pts = 0;
    let p2Pts = 0;
    for (const set of m.state.completedSets) {
      p1Pts += pointsInSet(set, 0);
      p2Pts += pointsInSet(set, 1);
    }

    const r1 = ensure(t1);
    const r2 = ensure(t2);
    r1.played++;
    r2.played++;
    r1.pointsFor += p1Pts;
    r1.pointsAgainst += p2Pts;
    r2.pointsFor += p2Pts;
    r2.pointsAgainst += p1Pts;
    if (p1Won) {
      r1.won++;
      r2.lost++;
    } else {
      r1.lost++;
      r2.won++;
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.pointsFor - a.pointsFor || b.won - a.won || a.pointsAgainst - b.pointsAgainst || a.name.localeCompare(b.name)
  );
}
