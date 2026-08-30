// Mixed mexicano as pure logic: courts taken two ranks at a time from each
// group, pairs always crossing the groups, and the balance rule inside a four.
// Run: npx tsx scripts/checkMixedMexicano.ts
import {
  defaultMixedMexicanoRounds,
  groupOf,
  groupSize,
  isValidMixedMexicanoField,
  matchesPerRound,
  openingRound,
  pairAcrossRanked,
} from "../src/lib/bracket/mixedMexicano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- field validation --------------------------------------------------------
check("4 players is a valid field", isValidMixedMexicanoField(4));
check("8 players is a valid field", isValidMixedMexicanoField(8));
check("6 players is refused", !isValidMixedMexicanoField(6));
check("10 players is refused", !isValidMixedMexicanoField(10));
check("groupSize(12) is 6", groupSize(12) === 6);
check("matchesPerRound(12) is 3", matchesPerRound(12) === 3);
check("default rounds are capped", defaultMixedMexicanoRounds(32) === 8, `${defaultMixedMexicanoRounds(32)}`);

// --- the balance rule inside one four ---------------------------------------
{
  const pairs = pairAcrossRanked(["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]);
  check("two courts from four ranks in each group", pairs.length === 2, `${pairs.length}`);
  check(
    "top court: A's best with B's second, against A's second with B's best",
    JSON.stringify(pairs[0]) === JSON.stringify({ posIndex: 0, team1: ["a1", "b2"], team2: ["a2", "b1"] }),
    JSON.stringify(pairs[0])
  );
  check(
    "second court takes the next two ranks of each group",
    JSON.stringify(pairs[1]) === JSON.stringify({ posIndex: 1, team1: ["a3", "b4"], team2: ["a4", "b3"] }),
    JSON.stringify(pairs[1])
  );
  check(
    "the top court holds the best two of each group",
    new Set([...pairs[0].team1, ...pairs[0].team2]).size === 4 &&
      ["a1", "a2", "b1", "b2"].every((p) => [...pairs[0].team1, ...pairs[0].team2].includes(p))
  );
}

// --- the opening round -------------------------------------------------------
for (const n of [4, 8, 12, 16, 20, 24, 32]) {
  const size = groupSize(n);
  const round = openingRound(n);
  const label = `n=${n} (2x${size})`;

  check(`${label}: one match per court`, round.length === matchesPerRound(n), `${round.length}`);

  const badSides = round.filter((m) => [m.team1, m.team2].some((t) => groupOf(t[0], n) === groupOf(t[1], n)));
  check(`${label}: every pair is one from each group`, badSides.length === 0, `${badSides.length} bad`);

  const wrongOrder = round.filter((m) => [m.team1, m.team2].some((t) => groupOf(t[0], n) !== 1));
  check(`${label}: the group A player is listed first`, wrongOrder.length === 0, `${wrongOrder.length} bad`);

  const all = round.flatMap((m) => [...m.team1, ...m.team2]);
  check(`${label}: everyone is on court, once`, new Set(all).size === n && all.length === n, `${new Set(all).size}`);
}

// --- ranking really drives the draw ------------------------------------------
// Re-rank the groups and the courts must follow, not the entry order.
{
  const rankedA = ["a3", "a1", "a4", "a2"]; // a3 leading group A
  const rankedB = ["b2", "b4", "b1", "b3"];
  const pairs = pairAcrossRanked(rankedA, rankedB);
  check(
    "the top court follows the standings, not the entry order",
    JSON.stringify([...pairs[0].team1, ...pairs[0].team2].sort()) === JSON.stringify(["a1", "a3", "b2", "b4"].sort()),
    JSON.stringify([...pairs[0].team1, ...pairs[0].team2])
  );
  check(
    "the leaders of each group are opponents, not partners",
    (pairs[0].team1[0] === "a3" && pairs[0].team2[1] === "b2") || (pairs[0].team2[0] === "a3" && pairs[0].team1[1] === "b2"),
    JSON.stringify(pairs[0])
  );
}

// --- an odd group is simply not served ---------------------------------------
{
  const pairs = pairAcrossRanked(["a1", "a2", "a3"], ["b1", "b2", "b3"]);
  check("a spare rank in each group makes no half-match", pairs.length === 1, `${pairs.length}`);
}

check(
  "the rule is deterministic",
  JSON.stringify(openingRound(12)) === JSON.stringify(openingRound(12))
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
