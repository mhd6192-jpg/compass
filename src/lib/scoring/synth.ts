import { gamesPerSetOf, isPointsRace, raceTargetOf, raceTotalPoints, raceWinByOf } from "../types";
import { computeMatchState, ScoringConfig, setsToWin } from "./engine";

export interface SetInput {
  a: number; // games (or tiebreak points for a match-tiebreak decider) for player 1
  b: number; // ...for player 2
  /**
   * The LOSER's points in a 7-6 set's tiebreak, where one was played and the
   * coach knows it — the number the score line shows in brackets.
   *
   * Without it a hand-entered 7-6 had to invent a breaker, and it invented 7-0,
   * which the score line then printed as "7-6(0)" on the winner screen, in the
   * archive and in the message sent to the group chat: a specific claim about a
   * set nobody had made.
   */
  tb?: number;
}

export interface ScoreInput {
  completedSets: SetInput[];
  currentSetGames?: [number, number]; // in-progress set, must NOT be a set-ending score
}

function other(slot: 1 | 2): 1 | 2 {
  return slot === 1 ? 2 : 1;
}

function pushGames(slots: (1 | 2)[], count: number, winnerSlot: 1 | 2) {
  for (let g = 0; g < count; g++) {
    for (let p = 0; p < 4; p++) slots.push(winnerSlot);
  }
}

/** Feed tiebreak points so the winner ends on (wPts,lPts). Works for both the 7-point set tiebreak and the 10-point match tiebreak. */
function pushTiebreak(slots: (1 | 2)[], winnerSlot: 1 | 2, wPts: number, lPts: number) {
  const loserSlot = other(winnerSlot);
  for (let k = 0; k < lPts; k++) {
    slots.push(winnerSlot);
    slots.push(loserSlot);
  }
  for (let k = 0; k < wPts - lPts; k++) slots.push(winnerSlot);
}

/** Feed games up to (a,b) without triggering a set close (used for the in-progress set). */
function pushPartialGames(slots: (1 | 2)[], a: number, b: number) {
  const min = Math.min(a, b);
  for (let k = 0; k < min; k++) {
    pushGames(slots, 1, 1);
    pushGames(slots, 1, 2);
  }
  pushGames(slots, a - min, 1);
  pushGames(slots, b - min, 2);
}

export function isMatchTiebreakDecider(config: ScoringConfig, priorSetsWon: [number, number]): boolean {
  if (config.tiebreakMode !== "match-tiebreak" || config.bestOfSets < 3) return false;
  const needed = setsToWin(config.bestOfSets);
  return priorSetsWon[0] === needed - 1 && priorSetsWon[1] === needed - 1;
}

/**
 * The highest number ONE row of the hand-entry editor may reach.
 *
 * Not a property of the match — a property of the row. Under "fast deciding
 * set" the last row is not a set at all but a 10-point match tiebreak, entered
 * in the same column as 6-4 and 7-5, so a single match-wide ceiling cannot
 * serve both. Capping every row at the set length made a 10-8 decider
 * impossible to enter, and snapped an already-recorded one down to 7-8 on the
 * first tap of either arrow. (The ceiling before that was a flat 15, which
 * covered the decider only by accident and was far too generous for a set.)
 *
 * `priorRows` is the completed sets ABOVE this one, which is what decides
 * whether this row is the decider.
 */
export function rowCeiling(config: ScoringConfig, priorRows: Array<{ a: number; b: number }>, perSet: number): number {
  const priorSetsWon: [number, number] = [0, 0];
  for (const { a, b } of priorRows) {
    if (a === b) continue;
    priorSetsWon[a > b ? 0 : 1] += 1;
  }
  // A 10-point breaker won by two, with no cap — allow a wide margin above it.
  if (isMatchTiebreakDecider(config, priorSetsWon)) return 25;
  // An advantage set runs on past N-all until somebody is two clear; every
  // other set stops one game past it, at the breaker.
  return config.tiebreakMode === "advantage" ? perSet + 12 : perSet + 1;
}

/**
 * Legality check for one completed set. Returns the winner slot, or throws.
 *
 * `advantage` has no tiebreak, so a set runs past N-all until somebody is two
 * clear: 8-6, 9-7, 10-8. The rules here allowed 6-0..6-4, 7-5 and 7-6 only, so
 * an advantage set that went beyond 7-5 could not be entered AT ALL — the one
 * mode where long sets are the point of choosing it.
 *
 * `perSet` is the games needed to take a set, six unless the organiser chose
 * otherwise. Every bound below is derived from it rather than written out, so a
 * club playing short sets can type 4-2 and a club playing pro sets can type 9-7.
 */
export function validateCompletedSet(a: number, b: number, isDecider: boolean, advantage = false, perSet = 6): 1 | 2 {
  if (a < 0 || b < 0 || !Number.isInteger(a) || !Number.isInteger(b)) throw new Error("Scores must be whole numbers");
  if (a === b) throw new Error("A completed set can't be a tie");
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const winner: 1 | 2 = a > b ? 1 : 2;

  if (isDecider) {
    // 10-point match tiebreak, win by 2 — and it STOPS the moment both are
    // true. So the winner has exactly 10 against 0-8, or, past 10, a margin of
    // exactly two: 11-9, 12-10. "hi >= 10 && margin >= 2" alone also accepted
    // 11-8 and 15-0, scores the engine can never reach, and `synthPoints` then
    // quietly stored the nearest thing it could build instead of the score the
    // coach typed.
    const legal = hi >= 10 && hi - lo >= 2 && (hi === 10 || hi - lo === 2);
    if (!legal) {
      throw new Error(
        `Deciding tiebreak must reach 10 and win by 2, and past 10 the margin is exactly two (got ${a}-${b})`
      );
    }
    return winner;
  }
  if (advantage) {
    // No tiebreak: N-0..N-(N-2), then two clear games — (N+1)-(N-1), (N+2)-N, and so on.
    if (hi === perSet && lo <= perSet - 2) return winner;
    if (hi >= perSet + 1 && hi - lo === 2) return winner;
    throw new Error(`Illegal set score ${a}-${b} — past ${perSet}-${perSet} an advantage set is won by two clear games`);
  }
  // normal set: N-0..N-(N-2), then (N+1)-(N-1) or the tiebreak's (N+1)-N
  if (hi === perSet && lo <= perSet - 2) return winner;
  if (hi === perSet + 1 && (lo === perSet - 1 || lo === perSet)) return winner;
  throw new Error(`Illegal set score ${a}-${b} — a set is first to ${perSet}, two clear`);
}

/**
 * Turns a described score into the point-by-point slot sequence the engine will
 * reconstruct into exactly that score. Validates legality and match structure,
 * then verifies the generated points actually reproduce the input before
 * returning (defensive — never persist a wrong score).
 */
export function synthPoints(input: ScoreInput, config: ScoringConfig): { slots: (1 | 2)[]; matchWinnerSlot: 1 | 2 | null } {
  const slots: (1 | 2)[] = [];

  // The points-race formats play every point out, so a match is described as a
  // single "completed set" whose (a,b) *is* the final score. With target T:
  //   race-to-9  (points total): totals 2T-2 (T=9: 16, e.g. 9-7, 16-0), or one
  //              more with a 1-point margin if it reached the sudden-death decider.
  //   race-to-16 (first to T): the winner has exactly T and the loser 0..T-1;
  //              there is no win-by-2, so T-(T-1) is a legal sudden-death finish.
  if (isPointsRace(config.tiebreakMode)) {
    if (input.completedSets.length !== 1 || input.currentSetGames) {
      throw new Error("A points-race match is described as a single final score, e.g. 9-7");
    }
    const { a, b } = input.completedSets[0];
    if (a < 0 || b < 0 || !Number.isInteger(a) || !Number.isInteger(b)) throw new Error("Scores must be whole numbers");
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    const target = raceTargetOf(config);
    if (config.tiebreakMode === "race-to-16") {
      if (raceWinByOf(config) === 2) {
        // Win by two: the race runs on past the target, but it stops the moment
        // someone is two clear — so a score beyond the target must be exactly a
        // two-point margin, and one AT the target can be any margin of two or more.
        const legal = hi >= target && hi - lo >= 2 && (hi === target || hi - lo === 2);
        if (!legal) {
          throw new Error(
            `First to ${target}, win by 2 — the winner needs ${target} or more and a two-point lead, and past ${target} the margin is exactly two (got ${a}-${b})`
          );
        }
      } else if (hi !== target || lo > target - 1) {
        throw new Error(`First to ${target} wins — the winner must have exactly ${target} and the loser 0-${target - 1} (got ${a}-${b})`);
      }
    } else {
      const raceTotal = raceTotalPoints(config);
      const total = hi + lo;
      const validTotal = total === raceTotal && hi !== lo;
      const validDecider = total === raceTotal + 1 && hi - lo === 1;
      if (!validTotal && !validDecider) {
        throw new Error(
          `Score must total ${raceTotal} points (e.g. ${target}-${target - 2}), or ${raceTotal + 1} with a 1-point margin if it reached ${target - 1}-${target - 1} (e.g. ${target}-${target - 1}) — got ${a}-${b}`
        );
      }
    }
    const winner: 1 | 2 = a > b ? 1 : 2;
    pushTiebreak(slots, winner, hi, lo);
    const state = computeMatchState(slots, config);
    return { slots, matchWinnerSlot: state.matchWinnerSlot };
  }

  const setsWon: [number, number] = [0, 0];
  const needed = setsToWin(config.bestOfSets);
  const perSet = gamesPerSetOf(config);

  for (let i = 0; i < input.completedSets.length; i++) {
    if (setsWon[0] >= needed || setsWon[1] >= needed) {
      throw new Error("There are more sets than needed — the match was already decided");
    }
    const { a, b, tb } = input.completedSets[i];
    const decider = isMatchTiebreakDecider(config, setsWon);
    const winner = validateCompletedSet(a, b, decider, config.tiebreakMode === "advantage", perSet);

    if (decider) {
      pushTiebreak(slots, winner, Math.max(a, b), Math.min(a, b));
    } else {
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      if (hi === perSet + 1 && lo === perSet) {
        // N-all, then the tiebreak. The loser's points come from `tb` when the
        // coach entered them; a winner needs seven, or two clear once the
        // breaker has gone past six. Without `tb` this has to invent something,
        // and whatever it invents the score line will print as fact — which is
        // why the editor asks for it as soon as a set reads N+1 to N.
        const loserTb = Number.isInteger(tb) && (tb as number) >= 0 ? (tb as number) : 0;
        pushPartialGames(slots, perSet, perSet);
        pushTiebreak(slots, winner, Math.max(7, loserTb + 2), loserTb);
      } else {
        pushPartialGames(slots, a, b);
      }
    }
    setsWon[winner - 1] += 1;
  }

  const matchDecided = setsWon[0] >= needed || setsWon[1] >= needed;

  if (input.currentSetGames) {
    if (matchDecided) throw new Error("Can't add an in-progress set — the match is already decided");
    const [a, b] = input.currentSetGames;
    if (a < 0 || b < 0 || !Number.isInteger(a) || !Number.isInteger(b)) throw new Error("Games must be whole numbers");
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    // Two clear games always ends a set. Everything else about the ceiling
    // depends on the tiebreak: with one, a live set can never get past N-all,
    // because N-all starts the breaker and the set ends on the next game. An
    // ADVANTAGE set has no breaker, so 7-6, 8-7, 12-11 are all perfectly normal
    // things for a coach to be looking at mid-set — the old ceiling of six
    // refused to record any of them, in the one mode chosen for long sets.
    const advantage = config.tiebreakMode === "advantage";
    const ending = (hi >= perSet && hi - lo >= 2) || (!advantage && hi === perSet + 1);
    if (ending) throw new Error(`${a}-${b} is a finished set — put it in completed sets, not the current set`);
    if (!advantage && hi > perSet) throw new Error(`Games can't exceed ${perSet} in an unfinished set (got ${a}-${b})`);
    pushPartialGames(slots, a, b);
  }

  // Verify the generated points reproduce exactly what was described.
  const state = computeMatchState(slots, config);
  const gotSets = state.sets.map((s) => `${s.games[0]}-${s.games[1]}`).join(",");
  const wantSets = input.completedSets
    .map((s, idx) => (isMatchTiebreakDeciderAt(input, config, idx) ? (s.a > s.b ? "1-0" : "0-1") : `${s.a}-${s.b}`))
    .join(",");
  if (gotSets !== wantSets) {
    throw new Error(`Internal: generated score ${gotSets} did not match requested ${wantSets}`);
  }

  return { slots, matchWinnerSlot: state.matchWinnerSlot };
}

/** Whether the set at index idx is the match-tiebreak decider, given the sets before it. */
function isMatchTiebreakDeciderAt(input: ScoreInput, config: ScoringConfig, idx: number): boolean {
  const needed = setsToWin(config.bestOfSets);
  const prior: [number, number] = [0, 0];
  for (let i = 0; i < idx; i++) {
    const { a, b } = input.completedSets[i];
    if (a > b) prior[0] += 1;
    else prior[1] += 1;
  }
  return isMatchTiebreakDecider(config, prior);
}
