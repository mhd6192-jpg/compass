// What the screens call the people in front of them.
//
// A club running a singles night was told "WHICH TEAM ARE YOU?" on the phone
// page, and the court TV crowned a "TEAM OF THE DAY" naming one person. The
// rule was not missing — the setup form had it, and had it right — but it was
// the ONLY copy, written inline on the one screen where the organiser picks
// singles or doubles. Every other screen had a literal "team" baked into the
// markup, so the wording could never follow the event.
//
// Two things make an entrant a person rather than a pair, and both have to be
// checked. Singles is the obvious one. The other is any rotating-partners
// format: an americano is entered as individuals and hands them a new partner
// every round, so people are what gets ranked and called even though the tennis
// on court is doubles. The remaining case, a fixed-pair doubles draw, is the
// one where "team" is the right word — and it is the common one, which is why
// the wrong default survived so long.

export {};

import { entrantWord, entrantWordCap, entrantsArePeople } from "../src/lib/types";
import { FORMATS, formatSpec } from "../src/lib/bracket/formats";
import { buildSpotlights } from "../src/lib/v3/stats";
import type { MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- the rule itself ---------------------------------------------------------

check("a singles round robin enters players", entrantWord("round-robin", "singles") === "player");
check("a doubles round robin enters teams", entrantWord("round-robin", "doubles") === "team");
check("a doubles americano still enters players", entrantWord("americano", "doubles") === "player");
check("a singles americano enters players", entrantWord("americano", "singles") === "player");
check("a doubles compass draw enters teams", entrantWord("compass", "doubles") === "team");

check("the plural follows the singular (people)", entrantWord("americano", "doubles", true) === "players");
check("the plural follows the singular (pairs)", entrantWord("compass", "doubles", true) === "teams");

check("the capital form is only a capital", entrantWordCap("round-robin", "singles") === "Player");
check("...and pluralises too", entrantWordCap("round-robin", "doubles", true) === "Teams");

// An unknown format must not silently become a person: the fixed-pair reading
// is the safe default, and the registry is what says otherwise.
check("an unknown format falls back to the doubles reading", entrantWord(undefined, "doubles") === "team");
check("...but singles still wins on its own", entrantWord(undefined, "singles") === "player");

// --- every rotating format, from the registry --------------------------------
// Listed here by reading the registry rather than by hand, so a format added
// later is covered the day it is added rather than the day somebody remembers.
const rotating = Object.keys(FORMATS).filter((key) => formatSpec(key).rotatingPartners);
check("the registry still declares rotating formats", rotating.length >= 9, `${rotating.length} found`);
const rotatingMisnamed = rotating.filter((f) => entrantWord(f, "doubles") !== "player");
check("every rotating format enters people, whatever the discipline says", rotatingMisnamed.length === 0, rotatingMisnamed.join(", "));

// The predicate and the noun cannot disagree — the noun is built from it.
const disagreeing = [...rotating, "compass", "round-robin", "two-group"].filter((f) =>
  ["singles", "doubles"].some((d) => entrantsArePeople(f, d) !== (entrantWord(f, d) === "player"))
);
check("the predicate and the word agree everywhere", disagreeing.length === 0, disagreeing.join(", "));

// --- the card that started it ------------------------------------------------
// One completed match is enough for the leader card to appear.

function finished(): MatchDTO {
  const p = (id: string, name: string) => ({ id, name, seed: 0 });
  return {
    id: "m1",
    bracket: "RR",
    round: 1,
    roundName: "Group Stage",
    posIndex: 0,
    player1: p("ana", "Ana"),
    player2: p("ben", "Ben"),
    player1Members: null,
    player2Members: null,
    winnerId: "ana",
    loserId: "ben",
    status: "completed",
    courtId: 1,
    courtSlot: "current",
    forcedEnd: null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: "2026-09-09T10:00:00.000Z",
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: 16 },
      completedSets: [{ games: [16, 9] as [number, number], tiebreak: null }],
      currentSet: { games: [0, 0] as [number, number] },
      totalPoints: 25,
      server: 1,
    },
  } as unknown as MatchDTO;
}

const eyebrowFor = (format: string, discipline: string) =>
  buildSpotlights([finished()], format, "race-to-16", discipline).find((c) => c.key === "leader")?.eyebrow;

check("a singles draw crowns a player of the day", eyebrowFor("round-robin", "singles") === "Player of the day");
check("a doubles draw still crowns a team of the day", eyebrowFor("round-robin", "doubles") === "Team of the day");
// The americano keeps its own wording — it ranks on points, not on wins, and
// the registry gives each rotating format its own line for that card.
check(
  "an americano keeps its own eyebrow rather than either noun",
  (eyebrowFor("americano", "doubles") ?? "").toLowerCase().includes("americano")
);

// --- the screens ---------------------------------------------------------------
// The bug was never in the helper; it was in the markup that never called one.
// So the last checks read the source for the exact sentences that were wrong.
//
// Deliberately a list of known-bad phrases rather than a hunt for the word
// "team": a component called `Teams`, a standings tab for the team formats and
// a comment explaining this very trap are all correct uses, and a check that
// fails on those gets switched off within a week.

import { readFileSync } from "node:fs";

const WAS_WRONG: Array<[file: string, phrase: string, where: string]> = [
  ["src/app/v3/player/page.tsx", "Which team are you", "the question on the phone page"],
  ["src/app/v3/player/page.tsx", "No teams in the draw", "the empty draw line"],
  ["src/components/v3/FinalStandingsScreen.tsx", "Congratulations to every team", "the closing line"],
  ["src/components/v3/SwapMatchSheet.tsx", "waiting on a team", "the swap sheet's empty state"],
  ["src/components/v3/SwapMatchSheet.tsx", "A team is on another court", "the swap sheet's blocked reason"],
  ["src/app/v3/control/page.tsx", "resting the teams", "the control room's queue note"],
  ["src/lib/v3/stats.ts", '"Team of the day"', "the leader card's eyebrow"],
  // v2 is still linked from the front door, so it carried the same six literals
  // and had to be corrected with it. It is listed here rather than left to rot:
  // a screen somebody can still open is a screen that has to read correctly.
  ["src/app/v2/player/page.tsx", "Which team are you", "v2's question on the phone page"],
  ["src/app/v2/player/page.tsx", "No teams in the draw", "v2's empty draw line"],
  ["src/components/v2/FinalStandingsScreen.tsx", "Congratulations to every team", "v2's closing line"],
  ["src/components/v2/SwapMatchSheet.tsx", "waiting on a team", "v2's swap sheet empty state"],
  ["src/components/v2/SwapMatchSheet.tsx", "A team is on another court", "v2's swap sheet blocked reason"],
  ["src/app/v2/control/page.tsx", "resting the teams", "v2's control room queue note"],
  ["src/lib/v2/stats.ts", '"Team of the day"', "v2's leader card eyebrow"],
];

for (const [file, phrase, where] of WAS_WRONG) {
  // Comments stripped first: these files explain the trap in prose, and the
  // explanation must not be what trips the check.
  const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(`${where} is not hardcoded`, !code.includes(phrase));
}

// And each of those files must actually ask for the word, so the check above
// cannot be satisfied by deleting the sentence instead of fixing it.
for (const file of [...new Set(WAS_WRONG.map(([f]) => f))]) {
  const code = readFileSync(file, "utf8");
  check(`${file} takes its wording from the event`, /entrantWord/.test(code));
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
