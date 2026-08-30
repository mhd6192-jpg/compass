// Winner court as pure logic: winners hold the court, losers go to the back of
// the queue, the queue keeps its size, the streak counts, and everyone gets a
// turn however the results fall.
// Run: npx tsx scripts/checkWinnerCourt.ts
import {
  defaultWinnerCourtRounds,
  isValidWinnerCourtField,
  nextRound,
  openingRound,
  replay,
  waitingCount,
  type WinnerCourtResult,
} from "../src/lib/bracket/winnerCourt";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const P8 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

// --- field validation --------------------------------------------------------
check("6 players is a valid field", isValidWinnerCourtField(6));
check("4 players is refused (nobody would be waiting)", !isValidWinnerCourtField(4));
check("7 players is fine — the queue need not be even", isValidWinnerCourtField(7));
check("waitingCount(8) is 4", waitingCount(8) === 4);
check("default rounds give everyone several turns", defaultWinnerCourtRounds(8) === 12, `${defaultWinnerCourtRounds(8)}`);

// --- the opening match -------------------------------------------------------
const open = openingRound(P8);
check("the first four open the court", JSON.stringify([...open.team1, ...open.team2]) === JSON.stringify(["p1", "p2", "p3", "p4"]));
check("the rest are queued in entry order", JSON.stringify(open.queue) === JSON.stringify(["p5", "p6", "p7", "p8"]));
check("no streak on the opening match", open.streak === 0);

// --- winners stay, losers go to the back ------------------------------------
{
  const r1: WinnerCourtResult = { winners: ["p1", "p2"], losers: ["p3", "p4"] };
  const next = nextRound(P8, [r1])!;
  check("the winning pair stays on, together", JSON.stringify(next.team1) === JSON.stringify(["p1", "p2"]), JSON.stringify(next.team1));
  check("the next pair waiting comes on", JSON.stringify(next.team2) === JSON.stringify(["p5", "p6"]), JSON.stringify(next.team2));
  check("the losers join the back of the queue", JSON.stringify(next.queue) === JSON.stringify(["p7", "p8", "p3", "p4"]), JSON.stringify(next.queue));
  check("holding the court starts a streak", next.streak === 1, `${next.streak}`);
}

// --- a streak builds, and is broken -----------------------------------------
{
  const results: WinnerCourtResult[] = [
    { winners: ["p1", "p2"], losers: ["p3", "p4"] },
    { winners: ["p1", "p2"], losers: ["p5", "p6"] },
    { winners: ["p1", "p2"], losers: ["p7", "p8"] },
  ];
  const next = nextRound(P8, results)!;
  check("three wins in a row is a streak of three", next.streak === 3, `${next.streak}`);
  check("the holders are still the same pair", JSON.stringify(next.team1) === JSON.stringify(["p1", "p2"]));

  const broken = nextRound(P8, [...results, { winners: next.team2, losers: ["p1", "p2"] }])!;
  check("losing the court resets the streak to one", broken.streak === 1, `${broken.streak}`);
  check("the new holders are the pair that just won", JSON.stringify(broken.team1) === JSON.stringify(next.team2), JSON.stringify(broken.team1));
}

// --- the queue is an invariant ----------------------------------------------
for (const n of [6, 7, 8, 9, 12, 16]) {
  const ids = Array.from({ length: n }, (_, i) => `q${i + 1}`);
  const want = waitingCount(n);

  // Three different ways the night could go.
  const patterns: Array<{ name: string; decide: (r: unknown, i: number) => "team1" | "team2" }> = [
    { name: "holders always win", decide: () => "team1" },
    { name: "challengers always win", decide: () => "team2" },
    { name: "alternating", decide: (_r, i) => (i % 2 === 0 ? "team1" : "team2") },
  ];

  for (const pat of patterns) {
    const rounds = replay(ids, pat.decide as never, 25);
    check(`n=${n}, ${pat.name}: every round was playable`, rounds.length === 25, `${rounds.length}`);

    let bad = "";
    const appearances = new Map<string, number>();
    for (const r of rounds) {
      const onCourt = [...r.team1, ...r.team2];
      if (new Set(onCourt).size !== 4) bad ||= "a player is on court twice";
      if (r.queue.length !== want) bad ||= `queue is ${r.queue.length}, expected ${want}`;
      if (onCourt.some((p) => r.queue.includes(p))) bad ||= "someone is on court and in the queue";
      if (new Set([...onCourt, ...r.queue]).size !== n) bad ||= "the field is not all accounted for";
      for (const p of onCourt) appearances.set(p, (appearances.get(p) ?? 0) + 1);
    }
    check(`n=${n}, ${pat.name}: the court and queue stay consistent`, bad === "", bad);

    // "Challengers always win" is the fairest possible run; "holders always
    // win" is the harshest, and even then the queue must keep turning over.
    check(`n=${n}, ${pat.name}: everyone got on court`, appearances.size === n, `${appearances.size} of ${n}`);
  }
}

// --- the harshest case, examined --------------------------------------------
// If one pair never loses, everyone else should still cycle through evenly.
{
  const rounds = replay(P8, () => "team1", 13);
  const challengerCounts = new Map<string, number>();
  for (const r of rounds.slice(1)) for (const p of r.team2) challengerCounts.set(p, (challengerCounts.get(p) ?? 0) + 1);
  const counts = ["p3", "p4", "p5", "p6", "p7", "p8"].map((p) => challengerCounts.get(p) ?? 0);
  check(
    "an unbeaten pair still faces everyone else in turn",
    Math.max(...counts) - Math.min(...counts) <= 1,
    counts.join(",")
  );
}

// --- determinism --------------------------------------------------------------
const a = JSON.stringify(replay(P8, (_r, i) => (i % 3 === 0 ? "team2" : "team1"), 10));
const b = JSON.stringify(replay(P8, (_r, i) => (i % 3 === 0 ? "team2" : "team1"), 10));
check("replaying the same results gives the same queue", a === b);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
