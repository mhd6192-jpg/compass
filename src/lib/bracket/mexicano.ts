/**
 * Mexicano: americano's competitive cousin.
 *
 * Same shape — individuals, rotating partners, everyone scoring for themselves
 * — but the pairings are not drawn in advance. Every round is made from the
 * CURRENT standings: the players are ranked on points, taken four at a time,
 * and within each four the leader partners the fourth against the second and
 * third. So the top four play each other on the first court, the next four on
 * the next, and a good round moves you up the sheet into tougher company.
 *
 * That is the whole point of the format, and it is why the schedule cannot be
 * generated at seeding time the way an americano's is: round three depends on
 * what happened in round two. Only the first round is fixed (off the entry
 * order, which is the only ranking that exists yet); every later round is built
 * when the previous one finishes.
 *
 * The pairing rule is deliberately NOT adjusted to avoid repeat partners. In a
 * mexicano, partnering the same person twice means you are both still near the
 * same place on the table — that is the format telling you something true, and
 * "fixing" it would quietly turn the draw back into an americano.
 */

export interface MexicanoPairing {
  posIndex: number;
  team1: [number, number]; // indexes into the ranked list passed in
  team2: [number, number];
}

export const MIN_MEXICANO_PLAYERS = 4;
export const MAX_MEXICANO_PLAYERS = 32;

/**
 * One round's matches, from players already in ranking order (best first).
 *
 * Returns positions within the given array, so the caller can hand this either
 * a standings order or an entry order without the rule caring which it was.
 */
export function pairByRank(rankedCount: number): MexicanoPairing[] {
  const out: MexicanoPairing[] = [];
  const groups = Math.floor(rankedCount / 4);
  for (let g = 0; g < groups; g++) {
    const [a, b, c, d] = [g * 4, g * 4 + 1, g * 4 + 2, g * 4 + 3];
    // 1st with 4th against 2nd with 3rd — the pairing that makes the four as
    // even as their current standings allow.
    out.push({ posIndex: g, team1: [a, d], team2: [b, c] });
  }
  return out;
}

/**
 * Who sits out this round, when the field is not a multiple of four.
 *
 * Chosen on byes taken so far rather than on standing: resting the bottom of
 * the table would be the app deciding that the people having the worst night
 * should also play the least. `byes` is how many rounds each player has already
 * sat out, indexed alongside `ranked`.
 */
export function chooseSitters(rankedIds: string[], byes: Map<string, number>, sitCount: number): Set<string> {
  if (sitCount <= 0) return new Set();
  const order = [...rankedIds].sort((a, b) => {
    const byeDiff = (byes.get(a) ?? 0) - (byes.get(b) ?? 0);
    if (byeDiff !== 0) return byeDiff; // fewest byes so far sits first
    // Then the lower-ranked of the two, so a bye costs the leader least.
    return rankedIds.indexOf(b) - rankedIds.indexOf(a);
  });
  return new Set(order.slice(0, sitCount));
}
