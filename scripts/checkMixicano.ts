// The mixicano schedule as pure logic: every pair is one player from each
// group, partners rotate across the divide without repeats, opponents vary,
// and everyone plays every round.
// Run: npx tsx scripts/checkMixicano.ts
import {
  defaultMixicanoRounds,
  generateMixicano,
  groupOf,
  groupSize,
  isValidMixicanoField,
  matchesPerRound,
  maxMixicanoRounds,
  mixicanoGroupName,
  mixicanoScheduleQuality,
} from "../src/lib/bracket/mixicano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- field validation --------------------------------------------------------
check("4 players is a valid field (2 v 2 mixed)", isValidMixicanoField(4));
check("8 players is a valid field", isValidMixicanoField(8));
check("6 players is refused (groups would not make whole matches)", !isValidMixicanoField(6));
check("10 players is refused", !isValidMixicanoField(10));
check("groupSize(12) is 6", groupSize(12) === 6);
check("matchesPerRound(12) is 3", matchesPerRound(12) === 3);
check("groups are named", mixicanoGroupName(1) === "Group A" && mixicanoGroupName(2) === "Group B");

// --- the split ---------------------------------------------------------------
check("the first half is group A", groupOf(0, 8) === 1 && groupOf(3, 8) === 1);
check("the second half is group B", groupOf(4, 8) === 2 && groupOf(7, 8) === 2);

// --- rounds available --------------------------------------------------------
// A group of G has G partners across the divide — one more than the G-1 a
// same-group rotation gets, since there is no "cannot partner yourself".
check("a group of 4 has 4 partner rounds", maxMixicanoRounds(8) === 4);
check("default is capped for a long night", defaultMixicanoRounds(32) === 8, `${defaultMixicanoRounds(32)}`);

// --- the schedule ------------------------------------------------------------
for (const n of [4, 8, 12, 16, 20, 24, 32]) {
  const size = groupSize(n);
  const rounds = defaultMixicanoRounds(n);
  const matches = generateMixicano(n, rounds);
  const q = mixicanoScheduleQuality(matches, n);
  const label = `n=${n} (2x${size}), ${rounds} rounds`;

  check(`${label}: right number of matches`, matches.length === rounds * matchesPerRound(n), `${matches.length}`);

  // Every side is one player from each group — that is the whole format.
  const badSides = matches.filter((m) =>
    [m.team1, m.team2].some((t) => groupOf(t[0], n) === groupOf(t[1], n))
  );
  check(`${label}: every pair is one from each group`, badSides.length === 0, `${badSides.length} bad`);

  // Group A's player is listed first on each side, so the sides read consistently.
  const wrongOrder = matches.filter((m) => [m.team1, m.team2].some((t) => groupOf(t[0], n) !== 1));
  check(`${label}: group A is listed first on each side`, wrongOrder.length === 0, `${wrongOrder.length} bad`);

  // Nobody in two places at once, and everyone out every round.
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

// --- a full run pairs everyone with everyone across the divide ---------------
for (const n of [8, 12, 16]) {
  const size = groupSize(n);
  const matches = generateMixicano(n, maxMixicanoRounds(n));
  const pairs = new Set<string>();
  for (const m of matches) for (const t of [m.team1, m.team2]) pairs.add(`${t[0]}-${t[1]}`);
  check(
    `n=${n}: a full run (${maxMixicanoRounds(n)} rounds) uses every cross-group pairing exactly once`,
    pairs.size === size * size && mixicanoScheduleQuality(matches, n).repeatedPartnerships === 0,
    `${pairs.size} of ${size * size}`
  );
}

// --- opponents vary too -------------------------------------------------------
{
  const n = 16;
  const matches = generateMixicano(n, 4);
  const firstOpponents = new Set(matches.filter((m) => m.posIndex === 0).map((m) => m.team2.join("-")));
  check("opponents rotate as well as partners", firstOpponents.size > 1, `${firstOpponents.size} distinct`);
}

// --- guards -------------------------------------------------------------------
let threw = "";
try {
  generateMixicano(6, 3);
} catch (e) {
  threw = e instanceof Error ? e.message : "?";
}
check("an unsplittable field is rejected", threw.includes("multiple of four"), threw);

check(
  "the schedule is deterministic",
  JSON.stringify(generateMixicano(12, 5)) === JSON.stringify(generateMixicano(12, 5))
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
