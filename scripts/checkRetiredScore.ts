// What a retirement is worth on the table.
//
// A match ended with the Retire button never closes its set: the engine pushes
// a set only when its own win condition fires, so the score sits in the set
// still in progress and `completedSets` stays empty. The row is nevertheless
// completed with a winner, so computeStandings credited all four players a win
// or a loss and ZERO points.
//
// That column is not decoration. It is what ranks an americano, a mexicano,
// king of the court and a winner court, it is the round-robin tiebreak, and a
// mexicano draws its next round from it. Measured before the fix: a match
// retired at 14-9 put four people on the board reading "0 pts".
//
// A match that ends on its own must NOT get the same treatment — its last set
// has already been pushed, and adding the leftovers would count the winning
// points twice. So the partial is counted only for a forced end.

export {};

import { computeStandings, computeTeamStandings } from "../src/lib/standings";
import type { MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const p = (id: string, name: string, team = 0) => ({ id, name, seed: 0, team });

/** An americano match: four people, two drawn sides, scored per person. */
function match(opts: {
  id?: string;
  completedSets?: Array<{ games: [number, number]; tiebreak?: [number, number] }>;
  currentGame?: [number, number] | null;
  currentSet?: [number, number] | null;
  forcedEnd?: boolean;
  tiebreakMode?: string;
  winner?: 1 | 2;
  teams?: boolean;
}): MatchDTO {
  const t = opts.teams ?? false;
  return {
    id: opts.id ?? "m1",
    bracket: "AM",
    round: 1,
    roundName: "Round 1",
    posIndex: 0,
    player1: p("ana", "Ana & Ben"),
    player2: p("cara", "Cara & Dan"),
    player1Members: [p("ana", "Ana", t ? 1 : 0), p("ben", "Ben", t ? 1 : 0)],
    player2Members: [p("cara", "Cara", t ? 2 : 0), p("dan", "Dan", t ? 2 : 0)],
    winnerId: (opts.winner ?? 1) === 1 ? "ana" : "cara",
    loserId: (opts.winner ?? 1) === 1 ? "cara" : "ana",
    status: "completed",
    courtId: 1,
    courtSlot: null,
    forcedEnd: opts.forcedEnd ?? false,
    forcedEndReason: opts.forcedEnd ? "Rolled an ankle" : null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: "2026-09-09T10:00:00.000Z",
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: (opts.tiebreakMode ?? "race-to-16") as never, raceTarget: 16 },
      setsWon: [0, 0],
      completedSets: opts.completedSets ?? [],
      currentSet: opts.currentSet ? { games: opts.currentSet } : null,
      currentGame: opts.currentGame
        ? { points: opts.currentGame, display: [String(opts.currentGame[0]), String(opts.currentGame[1])], isTiebreak: true }
        : null,
      isMatchTiebreakSet: false,
      matchWinnerSlot: null,
      totalPoints: 0,
    },
  } as unknown as MatchDTO;
}

const by = (rows: ReturnType<typeof computeStandings>, name: string) => rows.find((r) => r.name === name);

// --- the defect itself -------------------------------------------------------

const retired = computeStandings([match({ forcedEnd: true, currentGame: [14, 9], winner: 1 })]);
check("a retirement credits the winners the points they actually scored", by(retired, "Ana")?.pointsFor === 14);
check("...both of them, not just the one the side is named after", by(retired, "Ben")?.pointsFor === 14);
check("a retirement credits the losers theirs too", by(retired, "Cara")?.pointsFor === 9 && by(retired, "Dan")?.pointsFor === 9);
check("...and records what they conceded", by(retired, "Ana")?.pointsAgainst === 9 && by(retired, "Cara")?.pointsAgainst === 14);
check("the win and the loss are still recorded", by(retired, "Ana")?.won === 1 && by(retired, "Cara")?.lost === 1);

// --- a walkover: retired with nothing played ---------------------------------

const walkover = computeStandings([match({ forcedEnd: true, currentGame: null, winner: 1 })]);
check("a walkover scores nobody anything", by(walkover, "Ana")?.pointsFor === 0 && by(walkover, "Cara")?.pointsFor === 0);
check("...but still counts as played", by(walkover, "Ana")?.played === 1);

// --- the case that must NOT change -------------------------------------------
// A match that ended on its own has its last set pushed already. Counting the
// leftovers as well would double the winning points.

const normal = computeStandings([
  match({ forcedEnd: false, completedSets: [{ games: [1, 0], tiebreak: [16, 9] }], currentGame: [16, 9], winner: 1 }),
]);
check("a match that finished on its own counts its sets once", by(normal, "Ana")?.pointsFor === 16, `got ${by(normal, "Ana")?.pointsFor}`);
check("...and the loser's once", by(normal, "Cara")?.pointsFor === 9);

// --- set play ----------------------------------------------------------------
// The tally counts games there, and the points inside the game in progress are
// not games yet, so only the completed games of the unfinished set count.

const sets = computeStandings([
  match({
    forcedEnd: true,
    tiebreakMode: "standard",
    completedSets: [{ games: [6, 4] }],
    currentSet: [3, 2],
    currentGame: [2, 1],
    winner: 1,
  }),
]);
check("a retirement in set play adds the games of the unfinished set", by(sets, "Ana")?.pointsFor === 9, `got ${by(sets, "Ana")?.pointsFor}`);
check("...and not the points inside the game in progress", by(sets, "Cara")?.pointsFor === 6, `got ${by(sets, "Cara")?.pointsFor}`);

// --- what a set is worth, which is not the same as what it says --------------
// A points race and a match-tiebreak deciding set are both stored as one game
// plus a tiebreak, so the shape cannot tell them apart. Reading the tiebreak in
// both counted a 10-8 breaker as ten GAMES in a column where an ordinary set is
// worth six — and that column is the round-robin tiebreak and what decides which
// two level teams meet in a play-off.

const raceMatch = computeStandings([
  match({ tiebreakMode: "race-to-16", completedSets: [{ games: [1, 0], tiebreak: [16, 9] }], winner: 1 }),
]);
check("a points race is worth its points", by(raceMatch, "Ana")?.pointsFor === 16, `got ${by(raceMatch, "Ana")?.pointsFor}`);

const decider = computeStandings([
  match({
    tiebreakMode: "match-tiebreak",
    completedSets: [{ games: [6, 4] }, { games: [4, 6] }, { games: [1, 0], tiebreak: [10, 8] }],
    winner: 1,
  }),
]);
check("a match-tiebreak decider is worth the set it replaces", by(decider, "Ana")?.pointsFor === 11, `got ${by(decider, "Ana")?.pointsFor}`);
check("...and the loser gets the games they actually won", by(decider, "Cara")?.pointsFor === 10, `got ${by(decider, "Cara")?.pointsFor}`);

// A within-set 7-6 breaker was never the problem: its games are 7-6, not 1-0.
const sevenSix = computeStandings([
  match({ tiebreakMode: "standard", completedSets: [{ games: [7, 6], tiebreak: [7, 5] }], winner: 1 }),
]);
check("a 7-6 set is still worth seven games", by(sevenSix, "Ana")?.pointsFor === 7, `got ${by(sevenSix, "Ana")?.pointsFor}`);

// --- the team table reads the same match the same way ------------------------

const teams = computeTeamStandings([match({ forcedEnd: true, currentGame: [14, 9], winner: 1, teams: true })]);
check("the team table counts a retirement too", teams[0]?.pointsFor === 14 && teams[1]?.pointsFor === 9, JSON.stringify(teams.map((t) => t.pointsFor)));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
