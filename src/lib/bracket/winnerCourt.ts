/**
 * Winner court: hold the court, or go to the back of the queue.
 *
 * One court and a waiting line. The pair that wins STAYS ON, the pair that
 * loses joins the back of the queue, and the next two waiting come on to
 * challenge. That is the oldest social format there is — every public court in
 * the world runs on it — and it is the one people mean by "winners stay on".
 *
 * It differs from king of the court in the thing that actually happens to you
 * when you win. There, winning moves you up a rung and your pair is broken up
 * to be re-drawn against the players coming down. Here, winning changes
 * nothing: you keep the court and you keep your partner, and the reward for a
 * run of wins is that you never leave. Losing is what moves you, and it moves
 * you to the back of a queue rather than down a ladder.
 *
 * The queue is not stored anywhere. It is replayed from the results so far,
 * which is the only way it can be right after an undo: a stored queue would
 * still hold the order produced by a result that no longer exists, and the
 * wrong two people would be called on. Replaying is cheap — a social evening is
 * a few dozen matches — and it cannot drift.
 */

export const MIN_WINNER_COURT_PLAYERS = 6; // four on court, at least one pair waiting
export const MAX_WINNER_COURT_PLAYERS = 32;

export interface WinnerCourtResult {
  /** The pair that won, and therefore stays on. */
  winners: [string, string];
  losers: [string, string];
}

export interface WinnerCourtRound {
  /** The holders — on court because they won the last one (or because they opened the night). */
  team1: [string, string];
  /** The challengers, straight off the front of the queue. */
  team2: [string, string];
  /** Everyone waiting, in the order they will be called. */
  queue: string[];
  /** How many in a row the holders have now won. 0 for the opening match. */
  streak: number;
}

/** A court needs four players on it and a pair waiting to make this a queue at all. */
export function isValidWinnerCourtField(playerCount: number): boolean {
  return playerCount >= MIN_WINNER_COURT_PLAYERS && playerCount <= MAX_WINNER_COURT_PLAYERS;
}

/** Only one match is ever on, so a round IS a match. */
export function defaultWinnerCourtRounds(playerCount: number): number {
  // Enough for everyone to get several turns without running all night.
  return Math.min(20, Math.max(8, playerCount + 4));
}

export function waitingCount(playerCount: number): number {
  return playerCount - 4;
}

/**
 * The opening match by position: the first two hold the court against the next
 * two. Kept as positions so the seeder can use the same rule the replay does,
 * rather than restating it.
 */
export const OPENING_INDICES = { team1: [0, 1] as [number, number], team2: [2, 3] as [number, number] };

/** The opening match: the first four in the entry order, the rest queued behind. */
export function openingRound(playerIds: string[]): WinnerCourtRound {
  const pick = (i: [number, number]): [string, string] => [playerIds[i[0]], playerIds[i[1]]];
  return {
    team1: pick(OPENING_INDICES.team1),
    team2: pick(OPENING_INDICES.team2),
    queue: playerIds.slice(4),
    streak: 0,
  };
}

/**
 * Replays the queue from the start and returns the next match.
 *
 * `results` are the completed matches in the order they were played. Returns
 * null when there is nobody left to bring on, which cannot happen with a legal
 * field — the queue neither grows nor shrinks, since two join the back for
 * every two called off the front.
 */
export function nextRound(playerIds: string[], results: WinnerCourtResult[]): WinnerCourtRound | null {
  if (results.length === 0) return openingRound(playerIds);

  const queue = playerIds.slice(4);
  let holders: [string, string] = [playerIds[0], playerIds[1]];
  let challengers: [string, string] = [playerIds[2], playerIds[3]];
  let streak = 0;

  for (const r of results) {
    // Whoever just lost goes to the back; the next pair waiting comes on.
    queue.push(...r.losers);
    const next1 = queue.shift();
    const next2 = queue.shift();
    if (next1 === undefined || next2 === undefined) return null;

    // The holders' run continues only if the same pair is still on court.
    const held = holders.includes(r.winners[0]) && holders.includes(r.winners[1]);
    streak = held ? streak + 1 : 1;

    holders = r.winners;
    challengers = [next1, next2];
  }

  return { team1: holders, team2: challengers, queue: [...queue], streak };
}

/**
 * The full sequence a schedule preview needs, played out with a supplied
 * result for each match. Used by the tests and by nothing else — the live draw
 * only ever asks for one round at a time.
 */
export function replay(
  playerIds: string[],
  decide: (round: WinnerCourtRound, index: number) => "team1" | "team2",
  rounds: number
): WinnerCourtRound[] {
  const out: WinnerCourtRound[] = [];
  const results: WinnerCourtResult[] = [];
  for (let i = 0; i < rounds; i++) {
    const round = nextRound(playerIds, results);
    if (!round) break;
    out.push(round);
    const winnerSide = decide(round, i);
    results.push({
      winners: winnerSide === "team1" ? round.team1 : round.team2,
      losers: winnerSide === "team1" ? round.team2 : round.team1,
    });
  }
  return out;
}
