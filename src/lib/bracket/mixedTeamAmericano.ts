/**
 * Mixed team americano: two sides, and every pair mixed within its side.
 *
 * The team americano's shape — two fixed teams, partners rotating inside your
 * own team, every point landing on your team's total — with the mixicano's
 * constraint laid on top: a pair must be one player from each half of the team.
 * At a mixed club event that is the format people actually mean by "our team
 * against yours": you play with your own side, but always in a mixed pair.
 *
 * It is the only format here that needs TWO divisions per player, and they do
 * different jobs. `team` is the side you score for. `pairGroup` is the half of
 * that side you may partner across. Every other format needs one or the other,
 * never both, which is why this one gets its own column rather than trying to
 * encode two things in one number.
 *
 * The entry list is therefore read in quarters: team A's first half, team A's
 * second half, team B's first half, team B's second half. Inside each team the
 * partner rotation is the mixicano's Latin square — one half steps round the
 * other — so over `half` rounds you partner everyone on the far side of your
 * own team exactly once, and never anyone from your own half.
 */

export const MIN_MIXED_TEAM_PLAYERS = 8;
export const MAX_MIXED_TEAM_PLAYERS = 32;

export interface MixedTeamMatch {
  round: number; // 1-based
  posIndex: number;
  /** Indexes into the full player list. team1 is drawn from team A, team2 from team B. */
  team1: [number, number];
  team2: [number, number];
}

/** Two equal teams, each splitting into two equal halves that pair across. */
export function isValidMixedTeamField(playerCount: number): boolean {
  return playerCount >= MIN_MIXED_TEAM_PLAYERS && playerCount <= MAX_MIXED_TEAM_PLAYERS && playerCount % 4 === 0;
}

export function teamSize(playerCount: number): number {
  return playerCount / 2;
}

/** How many players are in each half of a team — and so how many pairs it fields. */
export function halfSize(playerCount: number): number {
  return playerCount / 4;
}

export function matchesPerRound(playerCount: number): number {
  return halfSize(playerCount);
}

/** Rounds before someone has to repeat a partner: a half of H has H partners across it. */
export function maxMixedTeamRounds(playerCount: number): number {
  return Math.max(1, halfSize(playerCount));
}

export function defaultMixedTeamRounds(playerCount: number): number {
  return Math.max(1, Math.min(maxMixedTeamRounds(playerCount), 8));
}

/** The side this player scores for, from their position in the entry list. */
export function teamOf(index: number, playerCount: number): 1 | 2 {
  return index < teamSize(playerCount) ? 1 : 2;
}

/** The half within their team that they pair across from. */
export function pairGroupOf(index: number, playerCount: number): 1 | 2 {
  const withinTeam = index % teamSize(playerCount);
  return withinTeam < halfSize(playerCount) ? 1 : 2;
}

/**
 * The whole schedule, drawn up front.
 *
 * Inside each team, half 1's player i partners half 2's player (i + round - 1),
 * stepping round together — the Latin square that guarantees no repeated
 * partner for `half` rounds. Team A's pairs are then offset against team B's by
 * the round, so the same two pairs do not meet every time.
 */
export function generateMixedTeamAmericano(playerCount: number, rounds: number): MixedTeamMatch[] {
  if (!isValidMixedTeamField(playerCount)) {
    throw new Error(
      `A mixed team americano needs two equal teams that each split into two halves — a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS} (got ${playerCount})`
    );
  }

  const size = teamSize(playerCount);
  const half = halfSize(playerCount);
  const out: MixedTeamMatch[] = [];

  // Positions of each team's two halves in the full entry list.
  const teamBase = [0, size];

  for (let round = 1; round <= rounds; round++) {
    const pairsFor = (base: number): [number, number][] => {
      const pairs: [number, number][] = [];
      for (let i = 0; i < half; i++) {
        pairs.push([base + i, base + half + ((i + round - 1) % half)]);
      }
      return pairs;
    };
    const aPairs = pairsFor(teamBase[0]);
    const bPairs = pairsFor(teamBase[1]);

    for (let i = 0; i < half; i++) {
      out.push({
        round,
        posIndex: i,
        team1: aPairs[i],
        team2: bPairs[(i + round - 1) % half],
      });
    }
  }

  return out;
}

/** How varied the schedule turned out — shown to the organiser before they commit. */
export function mixedTeamScheduleQuality(matches: MixedTeamMatch[], playerCount: number) {
  const partnerCount = new Map<string, number>();
  const played = new Array(playerCount).fill(0);
  for (const m of matches) {
    for (const t of [m.team1, m.team2]) {
      partnerCount.set(`${t[0]}-${t[1]}`, (partnerCount.get(`${t[0]}-${t[1]}`) ?? 0) + 1);
    }
    for (const p of [...m.team1, ...m.team2]) played[p] += 1;
  }
  let repeatedPartnerships = 0;
  for (const c of partnerCount.values()) if (c > 1) repeatedPartnerships += c - 1;
  return {
    repeatedPartnerships,
    minMatches: Math.min(...played),
    maxMatches: Math.max(...played),
    halfSize: halfSize(playerCount),
  };
}
