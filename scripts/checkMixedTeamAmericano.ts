// The mixed team americano schedule as pure logic: two fixed sides, partners
// always from your own team but the other half of it, opponents always from the
// other team, and no repeated partners.
// Run: npx tsx scripts/checkMixedTeamAmericano.ts
import {
  defaultMixedTeamRounds,
  generateMixedTeamAmericano,
  halfSize,
  isValidMixedTeamField,
  matchesPerRound,
  maxMixedTeamRounds,
  mixedTeamScheduleQuality,
  pairGroupOf,
  teamOf,
  teamSize,
} from "../src/lib/bracket/mixedTeamAmericano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- field validation --------------------------------------------------------
check("8 players is a valid field", isValidMixedTeamField(8));
check("16 players is a valid field", isValidMixedTeamField(16));
check("4 players is refused (halves of one cannot rotate)", !isValidMixedTeamField(4));
check("12 players is valid (two teams of six, halves of three)", isValidMixedTeamField(12));
check("10 players is refused", !isValidMixedTeamField(10));
check("teamSize(16) is 8, halfSize 4", teamSize(16) === 8 && halfSize(16) === 4);
check("matchesPerRound(16) is 4", matchesPerRound(16) === 4);

// --- the quarters ------------------------------------------------------------
// 8 players: A-half1 = 0,1  A-half2 = 2,3  B-half1 = 4,5  B-half2 = 6,7
check("first quarter is team 1, half 1", teamOf(0, 8) === 1 && pairGroupOf(0, 8) === 1 && pairGroupOf(1, 8) === 1);
check("second quarter is team 1, half 2", teamOf(2, 8) === 1 && pairGroupOf(2, 8) === 2 && pairGroupOf(3, 8) === 2);
check("third quarter is team 2, half 1", teamOf(4, 8) === 2 && pairGroupOf(4, 8) === 1 && pairGroupOf(5, 8) === 1);
check("fourth quarter is team 2, half 2", teamOf(6, 8) === 2 && pairGroupOf(6, 8) === 2 && pairGroupOf(7, 8) === 2);

// --- the schedule ------------------------------------------------------------
for (const n of [8, 12, 16, 20, 24, 32]) {
  const rounds = defaultMixedTeamRounds(n);
  const matches = generateMixedTeamAmericano(n, rounds);
  const q = mixedTeamScheduleQuality(matches, n);
  const label = `n=${n} (2x${teamSize(n)}, halves of ${halfSize(n)}), ${rounds} rounds`;

  check(`${label}: right number of matches`, matches.length === rounds * matchesPerRound(n), `${matches.length}`);

  // A pair shares a team but never a half — that is the whole format.
  const badPairs = matches.filter((m) =>
    [m.team1, m.team2].some(
      (t) => teamOf(t[0], n) !== teamOf(t[1], n) || pairGroupOf(t[0], n) === pairGroupOf(t[1], n)
    )
  );
  check(`${label}: partners share a team but cross its halves`, badPairs.length === 0, `${badPairs.length} bad`);

  // Opponents are always the other team.
  const badSides = matches.filter((m) => teamOf(m.team1[0], n) === teamOf(m.team2[0], n));
  check(`${label}: opponents are always the other team`, badSides.length === 0, `${badSides.length} bad`);
  const wrongSide = matches.filter((m) => teamOf(m.team1[0], n) !== 1 || teamOf(m.team2[0], n) !== 2);
  check(`${label}: team A is always side 1`, wrongSide.length === 0, `${wrongSide.length} bad`);

  // Nobody twice in a round, everyone out every round.
  let clash = "";
  for (let r = 1; r <= rounds; r++) {
    const inRound = matches.filter((m) => m.round === r).flatMap((m) => [...m.team1, ...m.team2]);
    if (new Set(inRound).size !== inRound.length) clash ||= `round ${r}: double-booked`;
    if (inRound.length !== n) clash ||= `round ${r}: ${inRound.length} of ${n} on court`;
  }
  check(`${label}: everyone plays every round, once`, clash === "", clash);

  check(`${label}: nobody repeats a partner`, q.repeatedPartnerships === 0, `${q.repeatedPartnerships} repeats`);
  check(`${label}: everyone plays the same number of matches`, q.minMatches === q.maxMatches, `${q.minMatches}-${q.maxMatches}`);
}

// --- a full run uses every cross-half pairing once --------------------------
for (const n of [8, 16]) {
  const half = halfSize(n);
  const matches = generateMixedTeamAmericano(n, maxMixedTeamRounds(n));
  const pairs = new Set<string>();
  for (const m of matches) for (const t of [m.team1, m.team2]) pairs.add(`${t[0]}-${t[1]}`);
  check(
    `n=${n}: a full run (${maxMixedTeamRounds(n)} rounds) uses every in-team mixed pairing exactly once`,
    pairs.size === half * half * 2,
    `${pairs.size} of ${half * half * 2}`
  );
}

// --- opponents vary -----------------------------------------------------------
{
  const matches = generateMixedTeamAmericano(16, 4);
  const firstOpponents = new Set(matches.filter((m) => m.posIndex === 0).map((m) => m.team2.join("-")));
  check("opponents rotate as well as partners", firstOpponents.size > 1, `${firstOpponents.size} distinct`);
}

// --- guards -------------------------------------------------------------------
let threw = "";
try {
  generateMixedTeamAmericano(10, 3);
} catch (e) {
  threw = e instanceof Error ? e.message : "?";
}
check("an unsplittable field is rejected", threw.includes("multiple of four"), threw);

check(
  "the schedule is deterministic",
  JSON.stringify(generateMixedTeamAmericano(12, 3)) === JSON.stringify(generateMixedTeamAmericano(12, 3))
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
