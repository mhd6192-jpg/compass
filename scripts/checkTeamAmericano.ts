// The team americano schedule as pure logic: two fixed sides, partners drawn
// only from your own team, opponents only from the other, no repeated
// team-mates, and everyone playing every round.
// Run: npx tsx scripts/checkTeamAmericano.ts
import {
  defaultTeamRounds,
  generateTeamAmericano,
  isValidTeamField,
  matchesPerRound,
  maxTeamRounds,
  teamName,
  teamOf,
  teamScheduleQuality,
  teamSize,
} from "../src/lib/bracket/teamAmericano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- field validation --------------------------------------------------------
check("8 players is a valid field", isValidTeamField(8));
check("16 players is a valid field", isValidTeamField(16));
check("4 players is refused (teams of two cannot rotate)", !isValidTeamField(4));
check("12 players is valid (two teams of six)", isValidTeamField(12));
check("10 players is refused (teams would not split into pairs)", !isValidTeamField(10));
check("teamSize(16) is 8", teamSize(16) === 8);
check("matchesPerRound(16) is 4", matchesPerRound(16) === 4);
check("teams are named", teamName(1) === "Team A" && teamName(2) === "Team B");

// --- the split ---------------------------------------------------------------
check("the first half is team A", teamOf(0, 8) === 1 && teamOf(3, 8) === 1);
check("the second half is team B", teamOf(4, 8) === 2 && teamOf(7, 8) === 2);

// --- the schedule ------------------------------------------------------------
for (const n of [8, 12, 16, 20, 24, 32]) {
  const size = teamSize(n);
  const rounds = defaultTeamRounds(n);
  const matches = generateTeamAmericano(n, rounds);
  const q = teamScheduleQuality(matches, n);
  const label = `n=${n} (2x${size}), ${rounds} rounds`;

  check(`${label}: right number of matches`, matches.length === rounds * matchesPerRound(n), `${matches.length}`);

  // Every match is one team against the other, never a team against itself.
  const sameTeamSides = matches.filter((m) => {
    const t1 = new Set(m.team1.map((i) => teamOf(i, n)));
    const t2 = new Set(m.team2.map((i) => teamOf(i, n)));
    return t1.size !== 1 || t2.size !== 1 || [...t1][0] === [...t2][0];
  });
  check(`${label}: partners share a team, opponents never do`, sameTeamSides.length === 0, `${sameTeamSides.length} bad`);

  // Side 1 is always team A, so the scoreboard's sides mean something.
  const wrongSide = matches.filter((m) => m.team1.some((i) => teamOf(i, n) !== 1) || m.team2.some((i) => teamOf(i, n) !== 2));
  check(`${label}: team A is always side 1`, wrongSide.length === 0, `${wrongSide.length} bad`);

  // Nobody is in two places in a round, and everyone plays every round.
  let clash = "";
  for (let r = 1; r <= rounds; r++) {
    const inRound = matches.filter((m) => m.round === r).flatMap((m) => [...m.team1, ...m.team2]);
    if (new Set(inRound).size !== inRound.length) clash ||= `round ${r}: double-booked`;
    if (inRound.length !== n) clash ||= `round ${r}: ${inRound.length} of ${n} on court`;
  }
  check(`${label}: everyone plays every round, once`, clash === "", clash);

  check(`${label}: nobody repeats a team-mate`, q.repeatedPartnerships === 0, `${q.repeatedPartnerships} repeats`);
  check(`${label}: everyone plays the same number of matches`, q.minMatches === q.maxMatches, `${q.minMatches}-${q.maxMatches}`);
}

// --- a full run partners everyone on your side exactly once ------------------
for (const n of [8, 16]) {
  const size = teamSize(n);
  const matches = generateTeamAmericano(n, maxTeamRounds(n));
  const q = teamScheduleQuality(matches, n);
  check(
    `n=${n}: a full run (${maxTeamRounds(n)} rounds) uses every team-mate exactly once`,
    q.repeatedPartnerships === 0 && matches.length === maxTeamRounds(n) * matchesPerRound(n),
    `${matches.length} matches, team of ${size}`
  );
}

// --- opponents vary as well ---------------------------------------------------
// With the pairs offset each round, pair 1 of team A should not spend the whole
// evening playing the same pair of team B.
{
  const n = 16;
  const matches = generateTeamAmericano(n, 4);
  const firstPairOpponents = new Set(
    matches.filter((m) => m.posIndex === 0).map((m) => [...m.team2].sort((a, b) => a - b).join("-"))
  );
  check("opponents rotate as well as partners", firstPairOpponents.size > 1, `${firstPairOpponents.size} distinct`);
}

// --- guards -------------------------------------------------------------------
let threw = "";
try {
  generateTeamAmericano(10, 4);
} catch (e) {
  threw = e instanceof Error ? e.message : "?";
}
check("an unsplittable field is rejected", threw.includes("multiple of four"), threw);

// --- determinism --------------------------------------------------------------
check(
  "the schedule is deterministic",
  JSON.stringify(generateTeamAmericano(12, 5)) === JSON.stringify(generateTeamAmericano(12, 5))
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
