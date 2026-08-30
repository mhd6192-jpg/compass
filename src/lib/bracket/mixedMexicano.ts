/**
 * Mixed mexicano: the standings redraw every round, but pairs still cross the
 * two groups.
 *
 * It is exactly what the name says — a mexicano whose pairings are constrained
 * the way a mixicano's are. The field is entered as two equal groups, and after
 * every round each group is ranked on points separately. The top two of each
 * group meet on the first court, the next two of each on the second, and so on
 * down; inside every four the pairs are made across the groups, strongest with
 * the other group's second so the match is as even as the ranking allows.
 *
 * So both things people like about the parent formats survive: winning moves
 * you up into tougher company (the mexicano part) and every partnership is one
 * player from each group (the mixicano part). Neither parent gives you both — a
 * mexicano ranks the whole field as one list and will happily pair two players
 * from the same group, and a mixicano's rotation is fixed in advance and takes
 * no notice of who is winning.
 *
 * Ranking the groups separately, rather than ranking everyone and then
 * repairing the pairs, is what keeps it honest: it means "the top court" holds
 * the best two of each group, which is the thing a player can actually see and
 * aim at.
 */

export const MIN_MIXED_MEXICANO_PLAYERS = 4;
export const MAX_MIXED_MEXICANO_PLAYERS = 32;

export interface MixedPairing<T> {
  posIndex: number;
  team1: [T, T];
  team2: [T, T];
}

/** Two equal groups that between them divide into whole matches. */
export function isValidMixedMexicanoField(playerCount: number): boolean {
  return (
    playerCount >= MIN_MIXED_MEXICANO_PLAYERS && playerCount <= MAX_MIXED_MEXICANO_PLAYERS && playerCount % 4 === 0
  );
}

export function groupSize(playerCount: number): number {
  return playerCount / 2;
}

export function matchesPerRound(playerCount: number): number {
  return playerCount / 4;
}

export function defaultMixedMexicanoRounds(playerCount: number): number {
  return Math.max(1, Math.min(groupSize(playerCount), 8));
}

/** Which group a player is in, from their position in the entry list. */
export function groupOf(index: number, playerCount: number): 1 | 2 {
  return index < groupSize(playerCount) ? 1 : 2;
}

/**
 * One round, from each group already in ranking order (best first).
 *
 * Court k takes ranks 2k and 2k+1 from both groups. Within those four the
 * pairing crosses the groups AND crosses the ranks — group A's better player
 * partners group B's weaker one — which is the same balancing idea as the
 * mexicano's "leader partners the fourth", expressed under the constraint that
 * a pair must have one from each side.
 *
 * Generic over the element type so the seeder can pass positions and the live
 * draw can pass player ids, both getting the identical rule.
 */
export function pairAcrossRanked<T>(rankedA: T[], rankedB: T[]): MixedPairing<T>[] {
  const courts = Math.floor(Math.min(rankedA.length, rankedB.length) / 2);
  const out: MixedPairing<T>[] = [];
  for (let k = 0; k < courts; k++) {
    const a1 = rankedA[k * 2];
    const a2 = rankedA[k * 2 + 1];
    const b1 = rankedB[k * 2];
    const b2 = rankedB[k * 2 + 1];
    out.push({ posIndex: k, team1: [a1, b2], team2: [a2, b1] });
  }
  return out;
}

/** The opening round, straight off the entry order within each group. */
export function openingRound(playerCount: number): MixedPairing<number>[] {
  const size = groupSize(playerCount);
  const a = Array.from({ length: size }, (_, i) => i);
  const b = Array.from({ length: size }, (_, i) => size + i);
  return pairAcrossRanked(a, b);
}
