/** Minimal shape of a match needed to choose what to put on a court next. */
export interface Candidate {
  id: string;
  player1Id: string | null;
  player2Id: string | null;
  readyAt: Date | null;
}

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
 *   1. the pair that has been resting longest (oldest last-finish wins)
 *   2. then whoever has played the fewest matches so far
 *   3. then plain FIFO on readiness, so the order stays predictable
 *
 * A court is never left idle for the sake of rest: if only one legal candidate
 * exists it is still selected.
 */
export function pickNextMatch(candidates: Candidate[], busy: Set<string>, load: PlayerLoad): Candidate | null {
  const eligible = candidates.filter(
    (m) => (!m.player1Id || !busy.has(m.player1Id)) && (!m.player2Id || !busy.has(m.player2Id))
  );
  if (eligible.length === 0) return null;

  const rank = (m: Candidate) => {
    const ids = [m.player1Id, m.player2Id].filter((x): x is string => !!x);
    // The pair is only as rested as its *most recently* finished member.
    const lastFinish = ids.reduce((acc, id) => Math.max(acc, load.lastFinishedAt.get(id) ?? 0), 0);
    const played = ids.reduce((acc, id) => acc + (load.playedCount.get(id) ?? 0), 0);
    // How many OTHER matches could still start alongside this one. Picking a
    // match that strands every remaining fixture leaves a court standing empty
    // — the late-stage deadlock where the last few matches all share a team.
    const opensUp = candidates.filter(
      (o) =>
        o.id !== m.id &&
        o.player1Id !== m.player1Id && o.player1Id !== m.player2Id &&
        o.player2Id !== m.player1Id && o.player2Id !== m.player2Id &&
        (!o.player1Id || !busy.has(o.player1Id)) &&
        (!o.player2Id || !busy.has(o.player2Id))
    ).length;
    return { opensUp, lastFinish, played, ready: m.readyAt ? m.readyAt.getTime() : 0 };
  };

  return [...eligible].sort((a, b) => {
    const A = rank(a);
    const B = rank(b);
    // Keep the other courts busy first — an idle court costs the event far more
    // than a slightly shorter rest for one pair.
    if (A.opensUp !== B.opensUp) return B.opensUp - A.opensUp;
    if (A.lastFinish !== B.lastFinish) return A.lastFinish - B.lastFinish; // rested longest first
    if (A.played !== B.played) return A.played - B.played; // then least-used
    return A.ready - B.ready; // then FIFO
  })[0];
}
