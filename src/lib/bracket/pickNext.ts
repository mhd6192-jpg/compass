/** Minimal shape of a match needed to choose what to put on a court next. */
export interface Candidate {
  id: string;
  bracket: string;
  player1Id: string | null;
  player2Id: string | null;
  /** Americano only: the second person on each side. Null in every other format. */
  player1PartnerId?: string | null;
  player2PartnerId?: string | null;
  readyAt: Date | null;
}

/** Everyone who would be on court for this match — two entrants, or four people in an americano. */
function playersOf(m: Candidate): string[] {
  return [m.player1Id, m.player2Id, m.player1PartnerId, m.player2PartnerId].filter((x): x is string => !!x);
}

/**
 * Brackets that should be spread across the courts rather than allowed to stack
 * on one. The two-group format runs its groups side by side — filling both
 * courts from Group A leaves Group B standing still and the two groups then
 * finish hours apart. Compass brackets are sequential by nature, and a single
 * round robin only has one bracket, so neither is affected.
 */
const SPREAD_BRACKETS = new Set(["GA", "GB"]);

export interface PlayerLoad {
  /** ms timestamp this player most recently FINISHED a match (0 = never played). */
  lastFinishedAt: Map<string, number>;
  /** how many matches this player has already completed. */
  playedCount: Map<string, number>;
}

/**
 * Chooses which ready match goes onto a freed court slot.
 *
 * Beyond "don't double-book" (handled by `busy`), this spreads playing time so
 * one pair doesn't get called straight back on after finishing. Preference:
 *   1. the group with fewer matches already on a court (two-group format only)
 *   2. the pair that has been resting longest (oldest last-finish wins)
 *   3. then whoever has played the fewest matches so far
 *   4. then plain FIFO on readiness, so the order stays predictable
 *
 * A court is never left idle for the sake of rest: if only one legal candidate
 * exists it is still selected.
 */
export function pickNextMatch(
  candidates: Candidate[],
  busy: Set<string>,
  load: PlayerLoad,
  /** How many matches of each bracket are already occupying a court. */
  bracketOnCourt: Map<string, number> = new Map()
): Candidate | null {
  const eligible = candidates.filter((m) => playersOf(m).every((id) => !busy.has(id)));
  if (eligible.length === 0) return null;

  const rank = (m: Candidate) => {
    const ids = playersOf(m);
    // The pair is only as rested as its *most recently* finished member.
    const lastFinish = ids.reduce((acc, id) => Math.max(acc, load.lastFinishedAt.get(id) ?? 0), 0);
    const played = ids.reduce((acc, id) => acc + (load.playedCount.get(id) ?? 0), 0);
    // How many OTHER matches could still start alongside this one. Picking a
    // match that strands every remaining fixture leaves a court standing empty
    // — the late-stage deadlock where the last few matches all share a team.
    const opensUp = candidates.filter((o) => {
      if (o.id === m.id) return false;
      const theirs = playersOf(o);
      if (theirs.some((id) => ids.includes(id))) return false; // shares a player with this one
      return theirs.every((id) => !busy.has(id));
    }).length;
    // Groups take turns: whichever of them has fewer matches on court goes next,
    // so the two never end up sharing both courts while the other one waits.
    const stacked = SPREAD_BRACKETS.has(m.bracket) ? bracketOnCourt.get(m.bracket) ?? 0 : 0;
    return { opensUp, stacked, lastFinish, played, ready: m.readyAt ? m.readyAt.getTime() : 0 };
  };

  return [...eligible].sort((a, b) => {
    const A = rank(a);
    const B = rank(b);
    // Keep the other courts busy first — an idle court costs the event far more
    // than a slightly shorter rest for one pair.
    if (A.opensUp !== B.opensUp) return B.opensUp - A.opensUp;
    if (A.stacked !== B.stacked) return A.stacked - B.stacked; // keep both groups running
    if (A.lastFinish !== B.lastFinish) return A.lastFinish - B.lastFinish; // rested longest first
    if (A.played !== B.played) return A.played - B.played; // then least-used
    return A.ready - B.ready; // then FIFO
  })[0];
}
