import { MatchStateDTO, isPointsRace } from "../types";

/** House rule for the points-race formats: four serves each, then it changes hands. */
export const SERVES_PER_TURN = 4;

export interface ServeInfo {
  /** Which side serves the next point. */
  slot: 1 | 2;
  /** Which of this turn's four serves the next point is, 1–4. */
  serveInTurn: number;
  /** Serves this side has left, counting the one about to be played. */
  servesLeft: number;
  /** After the next point the serve passes to the other side. */
  lastOfTurn: boolean;
}

/**
 * Who serves the next point.
 *
 * Derived entirely from the number of points already played, so there is
 * nothing to store and nothing to keep in sync: undo a point and the serve
 * rewinds with it, reload the TV and it lands on the same answer as the
 * coach's phone. Slot 1 opens the match, and the turn flips every four points.
 *
 * Only the points races work this way — in a normal set the serve changes with
 * the game, which the scoreboard already shows — so everything else returns
 * null and the indicator stays off screen.
 */
export function serveInfo(state: MatchStateDTO): ServeInfo | null {
  if (!isPointsRace(state.config.tiebreakMode)) return null;
  if (state.matchWinnerSlot) return null;

  const played = state.totalPoints;
  const intoTurn = played % SERVES_PER_TURN;
  const slot: 1 | 2 = Math.floor(played / SERVES_PER_TURN) % 2 === 0 ? 1 : 2;

  return {
    slot,
    serveInTurn: intoTurn + 1,
    servesLeft: SERVES_PER_TURN - intoTurn,
    lastOfTurn: intoTurn === SERVES_PER_TURN - 1,
  };
}
