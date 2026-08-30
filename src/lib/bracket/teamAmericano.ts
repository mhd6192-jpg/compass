/**
 * Team americano: two sides, one scoreboard each.
 *
 * The players are split into two fixed teams. Every round you partner someone
 * else from YOUR team and play two players from the other one, and every point
 * you win is added to your team's total. So the individual rotation is an
 * americano — you never partner the same team-mate twice — but the result that
 * matters at the end is a single number per team.
 *
 * That combination is what makes it worth having alongside the plain americano:
 * it is the format for "our club against yours" or "the Tuesday group against
 * the Thursday group", where people want to rotate partners all evening and
 * still have a side to belong to.
 *
 * Both teams are the same size and that size must be even, so each team splits
 * cleanly into pairs — which makes the whole field a multiple of four. The
 * partner rotation inside each team is the same circle method the plain
 * americano uses, so nobody repeats a team-mate until the team has run out of
 * combinations, and the opponent pairing is rotated on top so the two teams'
 * pairs meet in a different arrangement each round.
 */

import { circlePairs } from "./americano";

export const MIN_TEAM_AMERICANO_PLAYERS = 8;
export const MAX_TEAM_AMERICANO_PLAYERS = 32;
export const TEAM_COUNT = 2;

export interface TeamMatch {
  round: number; // 1-based
  posIndex: number;
  /** Indexes into the full player list. team1 is drawn from team A, team2 from team B. */
  team1: [number, number];
  team2: [number, number];
}

/** A field has to split into two equal teams that each divide into pairs. */
export function isValidTeamField(playerCount: number): boolean {
  return (
    playerCount >= MIN_TEAM_AMERICANO_PLAYERS &&
    playerCount <= MAX_TEAM_AMERICANO_PLAYERS &&
    playerCount % 4 === 0
  );
}

export function teamSize(playerCount: number): number {
  return playerCount / TEAM_COUNT;
}

export function matchesPerRound(playerCount: number): number {
  return teamSize(playerCount) / 2;
}

/**
 * How many rounds can be played before someone has to repeat a team-mate.
 * A team of S has S-1 distinct partner rotations.
 */
export function maxTeamRounds(playerCount: number): number {
  return Math.max(1, teamSize(playerCount) - 1);
}

export function defaultTeamRounds(playerCount: number): number {
  return Math.max(1, Math.min(maxTeamRounds(playerCount), 8));
}

/**
 * Which team a player is on, from their position in the entry list.
 *
 * The first half is team A and the second half team B, so an organiser who
 * already knows their two sides can simply type one after the other. Splitting
 * alternately would be friendlier to a single seeded list, but it would also
 * quietly break up the sides someone had just entered on purpose.
 */
export function teamOf(index: number, playerCount: number): 1 | 2 {
  return index < teamSize(playerCount) ? 1 : 2;
}

export const TEAM_NAMES = ["Team A", "Team B"] as const;

export function teamName(team: number): string {
  return TEAM_NAMES[team - 1] ?? `Team ${team}`;
}

/**
 * The whole schedule, drawn up front.
 *
 * Inside each team the circle method rotates the partnerships; across the two
 * teams the pairs are then offset by the round number, so pair 1 of team A does
 * not spend the whole evening playing pair 1 of team B.
 */
export function generateTeamAmericano(playerCount: number, rounds: number): TeamMatch[] {
  if (!isValidTeamField(playerCount)) {
    throw new Error(
      `Team americano needs an even split into two teams that each divide into pairs — a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS} (got ${playerCount})`
    );
  }

  const size = teamSize(playerCount);
  const perRound = matchesPerRound(playerCount);
  const out: TeamMatch[] = [];

  for (let round = 1; round <= rounds; round++) {
    // Partnerships inside each team, as positions within that team.
    const aPairs = circlePairs(size, round - 1);
    const bPairs = circlePairs(size, round - 1);

    for (let i = 0; i < perRound; i++) {
      const a = aPairs[i];
      // Offsetting by the round is what stops the same two pairs meeting again
      // and again once the partner rotation has come back round.
      const b = bPairs[(i + round - 1) % perRound];
      out.push({
        round,
        posIndex: i,
        team1: [a[0], a[1]],
        // Team B's positions sit after team A's in the player list.
        team2: [b[0] + size, b[1] + size],
      });
    }
  }

  return out;
}

/** How varied the schedule turned out — shown to the organiser before they commit. */
export function teamScheduleQuality(matches: TeamMatch[], playerCount: number) {
  const size = teamSize(playerCount);
  const partnerCount = new Map<string, number>();
  const played = new Array(playerCount).fill(0);
  for (const m of matches) {
    for (const t of [m.team1, m.team2]) {
      const key = [t[0], t[1]].sort((x, y) => x - y).join("-");
      partnerCount.set(key, (partnerCount.get(key) ?? 0) + 1);
    }
    for (const p of [...m.team1, ...m.team2]) played[p] += 1;
  }
  let repeatedPartnerships = 0;
  for (const c of partnerCount.values()) if (c > 1) repeatedPartnerships += c - 1;
  return {
    repeatedPartnerships,
    minMatches: Math.min(...played),
    maxMatches: Math.max(...played),
    teamSize: size,
  };
}
