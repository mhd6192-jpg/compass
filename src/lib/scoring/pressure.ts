import { MatchStateDTO } from "../types";
import { ScoringConfig, applyPoint, stateFromDTO } from "./engine";

export interface PressureInfo {
  /** The side that wins the match if the next point ends it, or null during sudden death. */
  matchPointFor: 1 | 2 | null;
  /** True when the next point decides the match AND either side could be the winner. */
  suddenDeath: boolean;
}

/**
 * Whether the next point can end the match, asked of the engine itself.
 *
 * Rather than re-deriving "is this match point?" per format (deuce, tiebreaks,
 * the two race rules, sudden death…), each side's next point is simply played
 * into a copy of the state and the answer read off the result. The engine is
 * the single owner of the rules, so this can never disagree with what a tap
 * would actually do — including the race formats' quirk that the *trailing*
 * side's point can end the match under the points-total rule.
 *
 * "Sudden death" is stricter than "the next point ends it": under the
 * points-total rule the last point of the race ends the match whichever side
 * scores it, but the leader wins either way — that is match point for the
 * leader, not sudden death. Sudden death is when the winner genuinely depends
 * on who takes the point.
 */
export function pressureInfo(state: MatchStateDTO, config: ScoringConfig): PressureInfo | null {
  if (state.matchWinnerSlot) return null;
  const base = stateFromDTO(state);

  const winnerIf = (slot: 1 | 2): 1 | 2 | null => {
    const r = applyPoint(base, slot, config);
    return r.tier === "match" ? r.state.matchWinnerSlot : null;
  };
  const w1 = winnerIf(1);
  const w2 = winnerIf(2);

  if (w1 && w2) {
    if (w1 !== w2) return { matchPointFor: null, suddenDeath: true };
    return { matchPointFor: w1, suddenDeath: false };
  }
  if (w1) return { matchPointFor: w1, suddenDeath: false };
  if (w2) return { matchPointFor: w2, suddenDeath: false };
  return null;
}
