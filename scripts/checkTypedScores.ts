// Scores a coach types in rather than taps out.
//
// Two faults, opposite in kind.
//
// An ADVANTAGE set has no tiebreak: past 6-6 it runs on until somebody is two
// clear, so 8-6 and 10-8 are ordinary results. The validator allowed 6-0..6-4,
// 7-5 and 7-6 only — the shape of a set played WITH a tiebreak — so in the one
// mode chosen precisely because sets can run long, a long set could not be
// entered at all. The coach's only way out was to type a score that never
// happened.
//
// And a 7-6 typed into a tiebreak mode had to invent the breaker, because a set
// cannot reach 7-6 without one. It invented 7-0, and `formatSetScore` prints the
// loser's points in brackets — so "7-6(0)" went onto the winner screen, into the
// archive and into the message sent to the group chat, asserting a whitewash
// nobody had described. The editor asks for it now, and the number typed is the
// number stored.

export {};

import { computeMatchState, type ScoringConfig } from "../src/lib/scoring/engine";
import { synthPoints, validateCompletedSet } from "../src/lib/scoring/synth";
import { formatSetScore } from "../src/lib/scoring/format";
import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const cfg = (mode: string, bestOfSets = 3): ScoringConfig =>
  ({ bestOfSets, tiebreakMode: mode, raceTarget: 0, serveEvery: 0, raceWinBy: 0 }) as unknown as ScoringConfig;

const legal = (a: number, b: number, advantage: boolean) => {
  try {
    validateCompletedSet(a, b, false, advantage);
    return true;
  } catch {
    return false;
  }
};

// --- an advantage set runs on ------------------------------------------------

check("6-4 is legal either way", legal(6, 4, false) && legal(6, 4, true));
check("7-5 is legal either way", legal(7, 5, false) && legal(7, 5, true));
check("8-6 is legal in an advantage set", legal(8, 6, true));
check("10-8 is legal in an advantage set", legal(10, 8, true));
check("...and neither is legal where a tiebreak decides it", !legal(8, 6, false) && !legal(10, 8, false));
check("7-6 is legal only where a tiebreak exists", legal(7, 6, false) && !legal(7, 6, true));
check("9-6 is refused — past 6-6 the margin is exactly two", !legal(9, 6, true));
check("6-5 is refused either way", !legal(6, 5, true) && !legal(6, 5, false));

// The whole point: a long advantage set now survives the round trip.
const adv = synthPoints({ completedSets: [{ a: 8, b: 6 }, { a: 6, b: 3 }] }, cfg("advantage"));
const advState = computeMatchState(adv.slots, cfg("advantage"));
check("an 8-6 advantage set is reproduced exactly", JSON.stringify(advState.sets[0].games) === "[8,6]", JSON.stringify(advState.sets[0].games));
check("...and the match is decided by it", advState.matchWinnerSlot === 1, String(advState.matchWinnerSlot));

// --- the breaker that used to be invented ------------------------------------

const typed = synthPoints({ completedSets: [{ a: 7, b: 6, tb: 5 }, { a: 6, b: 4 }] }, cfg("standard"));
const typedState = computeMatchState(typed.slots, cfg("standard"));
const first = typedState.sets[0];
check("a 7-6 keeps its games", JSON.stringify(first.games) === "[7,6]", JSON.stringify(first.games));
check("...and the breaker the coach typed", first.tiebreak ? Math.min(...first.tiebreak) === 5 : false, JSON.stringify(first.tiebreak));
check(
  "...so the score line reads what was entered",
  formatSetScore({ games: first.games, tiebreak: first.tiebreak } as never, 1) === "7-6(5)",
  formatSetScore({ games: first.games, tiebreak: first.tiebreak } as never, 1)
);

// A breaker that ran long is kept too: the winner needs two clear past six.
const long = synthPoints({ completedSets: [{ a: 7, b: 6, tb: 9 }, { a: 6, b: 4 }] }, cfg("standard"));
const longSet = computeMatchState(long.slots, cfg("standard")).sets[0];
check("a long breaker keeps its margin", longSet.tiebreak ? Math.max(...longSet.tiebreak) - Math.min(...longSet.tiebreak) === 2 : false, JSON.stringify(longSet.tiebreak));
check("...and the loser's number", longSet.tiebreak ? Math.min(...longSet.tiebreak) === 9 : false, JSON.stringify(longSet.tiebreak));

// Told nothing, it still has to produce something — but the editor asks, so
// this is the fallback rather than the normal path.
const untold = synthPoints({ completedSets: [{ a: 7, b: 6 }, { a: 6, b: 4 }] }, cfg("standard"));
const untoldSet = computeMatchState(untold.slots, cfg("standard")).sets[0];
check("a 7-6 with no breaker given still produces a legal set", JSON.stringify(untoldSet.games) === "[7,6]", JSON.stringify(untoldSet.games));

// --- and the editor asks -----------------------------------------------------

const editor = readFileSync("src/app/scorer/[matchId]/page.tsx", "utf8");
check("the editor asks for a breaker when a set reads 7-6", /tiebreak/i.test(editor) && /row\.tb/.test(editor));
check("...and carries it back when a result is reopened", /loserTb/.test(editor));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
