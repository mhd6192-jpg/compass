/**
 * Which of the chosen courts an event can actually fill.
 *
 * A rotating-partner format plays strictly one round at a time, and a round is
 * only ever `floor(players / 4)` matches — four people to a match, the
 * remainder sitting out. Nothing may be pulled forward from a later round
 * (`openNextRotatingRound` holds it back on purpose), so if the organiser ticks
 * more courts than a round has matches, the surplus ones are not idle between
 * matches: they are never used at all, for the whole evening.
 *
 * That went unsaid anywhere. Ten players on three courts is a legal field, the
 * setup screen said "matches fill these automatically", and Court 3 then showed
 * "awaiting the next match" from the first ball to the last — so the coach
 * standing on it had no way to tell a scheduling rule from a broken screen.
 *
 * Both the screens and the setup form ask the question here rather than each
 * doing the division, because they reach it from different directions: the form
 * knows the player count before anything is drawn, the court screens know the
 * draw but not the field. One rule, two ways in.
 */

/** Courts that will never see a match. `perRound` 0 = unbounded, so none are. */
export function surplusCourts(perRound: number, courtIds: number[]): number[] {
  if (perRound <= 0) return [];
  // Courts are handed out in id order by `rebalanceCourts`, so it is always the
  // highest-numbered ones that go without.
  return [...courtIds].sort((a, b) => a - b).slice(perRound);
}

/**
 * One line for the organiser, or null when every chosen court gets used.
 *
 * Says nothing on an empty form: "0 players make 1 match at a time" is a
 * complaint about a field nobody has typed yet, and a winner court hit it the
 * instant the format was tapped, because its limit is one match whatever the
 * field is.
 *
 * `canGrow` is what makes the advice honest. Adding players is the fix where
 * the limit is a quarter of the field; on a winner court it never is — only one
 * match is ever on — so telling an organiser to add players there would send
 * them after something that cannot work.
 */
export function surplusCourtNote(
  perRound: number,
  courtIds: number[],
  playerCount: number,
  canGrow = true
): string | null {
  if (playerCount <= 0) return null;
  const spare = surplusCourts(perRound, courtIds);
  if (spare.length === 0) return null;
  const names = spare.map((c) => `Court ${c}`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const it = spare.length === 1 ? "it" : "them";
  const remedy = canGrow ? `Untick ${it}, or add more players.` : `Untick ${it} — this format only ever has one match on.`;
  return `${playerCount} players make ${perRound} match${perRound === 1 ? "" : "es"} at a time, so ${list} would stand empty all night. ${remedy}`;
}

/**
 * The most matches this draw ever has on at once, read off the draw itself —
 * for a screen that has the fixtures but not the field size. 0 where the format
 * has no such limit, which is every bracket draw: those have many matches ready
 * together and will fill any number of courts.
 */
export function simultaneousMatches(matches: Array<{ bracket: string; round: number }>): number {
  const perRound = new Map<number, number>();
  for (const m of matches) {
    if (m.bracket !== "AM") continue;
    perRound.set(m.round, (perRound.get(m.round) ?? 0) + 1);
  }
  return perRound.size === 0 ? 0 : Math.max(...perRound.values());
}
