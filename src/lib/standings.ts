import { isGroupRanked, isPointsRace, isTeamScored, type MatchDTO } from "./types";
import { mixicanoGroupName } from "./bracket/mixicano";
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
 * What a match is worth to each side's tally.
 *
 * Normally that is the sum of its completed sets. A RETIREMENT is the exception,
 * and it used to be worth nothing at all: the engine only pushes a set when its
 * own win condition fires, so a match ended by the Retire button keeps its whole
 * score in the set still in progress and leaves `completedSets` empty. The row
 * was still marked completed with a winner, so all four players were credited a
 * win or a loss and zero points — in the column that ranks an americano, a
 * mexicano, king of the court and a winner court, and that a mexicano then draws
 * its next round from. Measured: a match retired at 14-9 put four people on the
 * board with "0 pts".
 *
 * The unfinished set is therefore counted too, but only for a forced end. A
 * match that finished on its own has already had its last set pushed, and adding
 * the leftovers would count the winning points twice.
 */
function matchTally(m: MatchDTO): [number, number] {
  let p1 = 0;
  let p2 = 0;
  for (const set of m.state.completedSets) {
    p1 += pointsInSet(set, 0);
    p2 += pointsInSet(set, 1);
  }
  if (m.forcedEnd) {
    // A race keeps its score in the running game; set play counts games, and the
    // points inside the game in progress are not games yet.
    if (isPointsRace(m.state.config.tiebreakMode)) {
      const pts = m.state.currentGame?.points;
      if (pts) {
        p1 += pts[0];
        p2 += pts[1];
      }
    } else {
      const games = m.state.currentSet?.games;
      if (games) {
        p1 += games[0];
        p2 += games[1];
      }
    }
  }
  return [p1, p2];
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

    const [tally1, tally2] = matchTally(m);
    const winnerPts = p1IsWinner ? tally1 : tally2;
    const loserPts = p1IsWinner ? tally2 : tally1;

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
    const [p1Pts, p2Pts] = matchTally(m);

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

/**
 * How this format's field divides into tables.
 *
 * This lives here, beside the tables themselves, because three different
 * screens need the same answer and used to each have their own. The big board
 * and the court TVs split a mixed event into its two groups; the phone card did
 * not, and ranked a player against the whole field — so somebody standing third
 * in Group B read "11th of 16" on their own phone while the TV two metres away
 * had them third. Same shape as the entrant-word drift: one screen knew the
 * rule and the others were written without it.
 *
 * The groups of a mixed event are carried on each player's `team`, never on the
 * bracket — every rotating match is bracket "AM" — which is why looking for a
 * GA/GB bracket found nothing. Note that `team` is non-zero for the team and
 * mixicano formats too, so it is only read once `isGroupRanked` says the format
 * ranks by group.
 */
export function standingsTables(
  matches: MatchDTO[],
  format?: string
): Array<{ key: string; label: string | null; rows: StandingsRow[] }> {
  // The team formats are decided by the two team totals, so that is the table —
  // with the individual scorers beside it, since people still want to see who
  // is actually winning the points for their side.
  if (isTeamScored(format)) {
    return [
      { key: "teams", label: "Teams", rows: computeTeamStandings(matches) },
      { key: "players", label: "Players", rows: computeStandings(matches) },
    ].filter((t) => t.rows.length > 0);
  }
  // Two tables, one per group. A mixed mexicano needs them because they are how
  // the next round is drawn; a mixed americano because giving each group its own
  // winner is the reason for running it that way at all.
  if (isGroupRanked(format)) {
    const rows = computeStandings(matches);
    const inGroup = (g: number) =>
      rows.filter((r) =>
        matches.some((m) =>
          [...(m.player1Members ?? []), ...(m.player2Members ?? [])].some((p) => p.id === r.id && p.team === g)
        )
      );
    return [
      { key: "g1", label: mixicanoGroupName(1), rows: inGroup(1) },
      { key: "g2", label: mixicanoGroupName(2), rows: inGroup(2) },
    ].filter((t) => t.rows.length > 0);
  }
  if (format === "two-group") {
    return [
      { key: "GA", label: "Group A", rows: computeStandings(matches.filter((m) => m.bracket === "GA")) },
      { key: "GB", label: "Group B", rows: computeStandings(matches.filter((m) => m.bracket === "GB")) },
    ].filter((t) => t.rows.length > 0);
  }
  return [{ key: "all", label: null, rows: computeStandings(matches) }];
}

/**
 * The table one entrant is actually ranked in, and what it is called.
 *
 * Searching the tables for the person rather than deciding from the format
 * keeps the phone card and the wall screens on the same answer by construction.
 * A team format's first table is keyed by team, so a person falls through it to
 * the individual scorers beside it, which is the table their rank belongs to.
 */
export function tableContaining(
  matches: MatchDTO[],
  entrantId: string,
  format?: string
): { rows: StandingsRow[]; label: string | null } {
  const tables = standingsTables(matches, format);
  const mine = tables.find((t) => t.rows.some((r) => r.id === entrantId));
  if (mine) return { rows: mine.rows, label: mine.label };
  return { rows: computeStandings(matches), label: null };
}
