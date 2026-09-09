// Points or games, wherever a screen says it out loud.
//
// The tally column counts POINTS in a race and GAMES in set play. `tallyUnit`
// has always known that, and the standings and the leader card have always used
// it — but three screens said "points" whatever the event was scored in:
//
//  - the phone card's three-stat row, labelled "Points";
//  - the idle screen's "Most points won" card, right beside a leader card that
//    got it right;
//  - every line of the podium, so a best-of-three announced its medals as
//    "18 points" when it meant 18 games — on the screen players photograph.
//
// The same drift as the entrant word: one helper knew, and the screens were
// written without it.

export {};

import { readFileSync } from "node:fs";
import { computePodium } from "../src/lib/v2/podium";
import { tallyUnit, type MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

check("a race counts points", tallyUnit("race-to-16").long === "points");
check("set play counts games", tallyUnit("standard").long === "games");
check("a fast deciding set counts games too", tallyUnit("match-tiebreak").long === "games");

const p = (id: string, name: string) => ({ id, name, seed: 0 });

function played(id: string, mode: string): MatchDTO {
  return {
    id,
    bracket: "RR",
    round: 1,
    roundName: "Group Stage",
    posIndex: 0,
    player1: p("a", "Ana"),
    player2: p("b", "Ben"),
    player1Members: null,
    player2Members: null,
    winnerId: "a",
    loserId: "b",
    status: "completed",
    courtId: 1,
    courtSlot: null,
    forcedEnd: false,
    forcedEndReason: null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: "2026-09-09T10:00:00.000Z",
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: mode as never, raceTarget: 16 },
      setsWon: [1, 0],
      completedSets: [mode === "standard" ? { games: [6, 4] as [number, number] } : { games: [1, 0] as [number, number], tiebreak: [16, 9] as [number, number] }],
      currentSet: null,
      currentGame: null,
      isMatchTiebreakSet: false,
      matchWinnerSlot: 1,
      totalPoints: 25,
    },
  } as unknown as MatchDTO;
}

// --- the podium says what the column counts ----------------------------------

const racePodium = computePodium([played("m1", "race-to-16")], "round-robin", "race-to-16");
check("a race podium reads in points", racePodium.some((a) => /\bpoints\b/.test(a.detail)), racePodium[0]?.detail ?? "");
check("...and not in games", !racePodium.some((a) => /\bgames\b/.test(a.detail)));

const setsPodium = computePodium([played("m2", "standard")], "round-robin", "standard");
check("a set-play podium reads in games", setsPodium.some((a) => /\bgames\b/.test(a.detail)), setsPodium[0]?.detail ?? "");
check("...and not in points", !setsPodium.some((a) => /\bpoints\b/.test(a.detail)));

// Told nothing, it keeps saying points — the historical wording, and right for
// the races the older screens were built around.
const untold = computePodium([played("m3", "race-to-16")], "round-robin");
check("a caller that says nothing still gets points", untold.some((a) => /\bpoints\b/.test(a.detail)));

// --- and no screen hardcodes the word ----------------------------------------
// Comments stripped: these files explain the trap, and the explanation must not
// be what trips the check.

const SCREENS: Array<[string, string]> = [
  ["src/lib/v2/podium.ts", "the podium"],
  ["src/lib/v3/stats.ts", "the idle screen's stat cards"],
  ["src/app/v3/player/page.tsx", "the phone card"],
];

for (const [file, what] of SCREENS) {
  const code = readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const hard = [...code.matchAll(/["'`][^"'`]*\b[Pp]oints\b[^"'`]*["'`]/g)]
    .map((m) => m[0])
    // A field NAME is not wording: `pointsFor` and friends keep their spelling.
    .filter((t) => !/^["']points?["']$/.test(t))
    // "Points played today" counts the RALLIES actually tapped, which are
    // points in any format — it is not the tally column and must not follow
    // it. Set play still plays points; it just does not rank on them.
    .filter((t) => !/Points played today/.test(t));
  check(`${what} does not hardcode the word`, hard.length === 0, hard.join(" | "));
  check(`${what} asks tallyUnit for it`, /tallyUnit/.test(code));
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
