/**
 * King of the court: a ladder of courts, climbed two players at a time.
 *
 * The courts are ranked — court 1 is the king court — and every round each one
 * plays its own 2 v 2. Then the winners of each court move UP one rung and the
 * losers move DOWN one, so the standard of play on a court sorts itself out
 * over the evening and the last round on the king court is the closest thing
 * the night has to a final.
 *
 * The movement is what makes this a different format rather than a variation on
 * the other two. An americano's rotation is decided before anyone arrives; a
 * mexicano re-ranks the whole field on points after every round. Here nothing
 * is global: you move relative to the people you just played, which is why a
 * player can climb all night without ever being top of the points table.
 *
 * Two consequences worth stating plainly, because they are the questions people
 * ask when they first meet the format:
 *
 *   - Winners on the king court have nowhere to go, so they stay. Losers on the
 *     bottom court likewise. Everyone else swaps rungs with the players coming
 *     the other way.
 *   - Every court therefore receives exactly two players from each direction,
 *     and they are deliberately split up into opposing pairs — so your partner
 *     is always someone who arrived from the other end of the ladder, and you
 *     never partner the person you just came up (or went down) with.
 *
 * The field has to divide into fours: a rung with three players on it cannot
 * play, and a floating bench would break the promotion/relegation that is the
 * entire point. Eight is the practical minimum, since one court is a ladder
 * with nothing to climb.
 */

export const MIN_KING_COURT_PLAYERS = 8;
export const MAX_KING_COURT_PLAYERS = 32;

export interface CourtResult {
  /** The two players who won this court's match, in no particular order. */
  winners: [string, string];
  losers: [string, string];
}

export interface CourtPairing {
  /** 0 = the king court. */
  level: number;
  team1: [string, string];
  team2: [string, string];
}

/** Whether a field can play this format at all. */
export function isValidKingCourtField(playerCount: number): boolean {
  return playerCount >= MIN_KING_COURT_PLAYERS && playerCount <= MAX_KING_COURT_PLAYERS && playerCount % 4 === 0;
}

export function courtCount(playerCount: number): number {
  return Math.floor(playerCount / 4);
}

/** "King court", then plain numbers down the ladder. */
export function courtLevelName(level: number): string {
  return level === 0 ? "King court" : `Court ${level + 1}`;
}

/**
 * Who is on each court next round, given how every court just finished.
 *
 * Each entry comes back as four players in a deliberate order: the first two
 * arrived from one direction and the last two from the other, which is what
 * `pairOccupants` relies on to split them across the net.
 */
export function nextRoundOccupants(results: CourtResult[]): string[][] {
  const levels = results.length;
  const out: string[][] = [];

  for (let i = 0; i < levels; i++) {
    // From above: the players relegated onto this court (or, on the king court,
    // the winners who held their place).
    const fromAbove = i === 0 ? results[0].winners : results[i - 1].losers;
    // From below: the players promoted onto this court (or, on the bottom
    // court, the losers with nowhere further to fall).
    const fromBelow = i === levels - 1 ? results[levels - 1].losers : results[i + 1].winners;
    out.push([...fromAbove, ...fromBelow]);
  }

  return out;
}

/**
 * Splits a court's four players into two teams.
 *
 * Index 0 and 1 came from one direction, 2 and 3 from the other, so pairing
 * across that boundary puts one climber and one faller on each side of the net.
 * Pairing within it would send the two who just won together straight back out
 * as the same team, which is the one thing this format should never do.
 */
export function pairOccupants(four: string[]): { team1: [string, string]; team2: [string, string] } {
  return { team1: [four[0], four[2]], team2: [four[1], four[3]] };
}

/**
 * The opening ladder, straight down the entry order: the first four start on
 * the king court. Returns positions rather than ids, like the other formats'
 * seeding helpers, so the caller maps them onto whatever it created.
 */
export function openingLadder(playerCount: number): Array<{ level: number; team1: [number, number]; team2: [number, number] }> {
  const out: Array<{ level: number; team1: [number, number]; team2: [number, number] }> = [];
  for (let level = 0; level < courtCount(playerCount); level++) {
    const base = level * 4;
    // Seeded like the other formats: strongest with weakest, so the opening
    // match on each rung is as even as the entry order can make it.
    out.push({ level, team1: [base, base + 3], team2: [base + 1, base + 2] });
  }
  return out;
}

/** The next round's pairings, from the results of the round just played. */
export function nextLadder(results: CourtResult[]): CourtPairing[] {
  return nextRoundOccupants(results).map((four, level) => ({ level, ...pairOccupants(four) }));
}
