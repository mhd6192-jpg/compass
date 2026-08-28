export interface Comeback {
  /** How many points behind the eventual winner was at their worst moment. */
  deficit: number;
  /** The score at that moment, winner's tally first. */
  from: [number, number];
}

/**
 * The largest deficit the winner clawed back.
 *
 * Replays the match point by point and remembers the worst position the
 * eventual winner was ever in. "Came back from 4–11 down" is the one statistic
 * players tell each other about afterwards, and it cannot be recovered from a
 * final score — only from the order the points were actually won.
 *
 * Meaningful only where the whole match is a single race of points. Across sets
 * a raw point tally lies: a team can lose one set 0–6, win the next two
 * comfortably, and never have been in trouble at all.
 */
export function biggestDeficitRecovered(slots: Array<1 | 2>, winnerSlot: 1 | 2): Comeback | null {
  let a = 0;
  let b = 0;
  let worst = 0;
  let at: [number, number] = [0, 0];

  for (const slot of slots) {
    if (slot === 1) a += 1;
    else b += 1;

    const mine = winnerSlot === 1 ? a : b;
    const theirs = winnerSlot === 1 ? b : a;
    if (theirs - mine > worst) {
      worst = theirs - mine;
      at = [mine, theirs];
    }
  }

  return worst > 0 ? { deficit: worst, from: at } : null;
}
