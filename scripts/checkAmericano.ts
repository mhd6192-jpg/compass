// Verifies the americano rotation: nobody double-booked inside a round, every
// round full, rest shared out evenly, and partners genuinely rotating.
// Run: npx tsx scripts/checkAmericano.ts
import {
  defaultRounds,
  generateAmericano,
  matchesPerRound,
  scheduleQuality,
  MAX_AMERICANO_ROUNDS,
} from "../src/lib/bracket/americano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const SIZES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 20, 24, 32];

for (const n of SIZES) {
  const rounds = defaultRounds(n);
  const s = generateAmericano(n, rounds);
  const q = scheduleQuality(s, n);

  // --- structure ---
  let dupInMatch = 0;
  const perRound = new Map<number, number[]>();
  for (const m of s.matches) {
    const four = [...m.team1, ...m.team2];
    if (new Set(four).size !== 4) dupInMatch++;
    const seen = perRound.get(m.round) ?? [];
    perRound.set(m.round, [...seen, ...four]);
  }
  const doubleBooked = [...perRound.values()].filter((ps) => new Set(ps).size !== ps.length).length;
  const wrongSize = [...perRound.values()].filter((ps) => ps.length !== matchesPerRound(n) * 4).length;

  // --- fairness ---
  const restCounts = new Map<number, number>();
  for (const r of s.sitOuts) for (const p of r) restCounts.set(p, (restCounts.get(p) ?? 0) + 1);
  const rests = [...Array(n).keys()].map((p) => restCounts.get(p) ?? 0);
  const restSpread = Math.max(...rests) - Math.min(...rests);
  const matchSpread = q.maxMatches - q.minMatches;

  const label = `n=${n} r=${rounds}`;
  check(`${label}: no player twice in one match`, dupInMatch === 0, `${dupInMatch} bad`);
  check(`${label}: nobody double-booked within a round`, doubleBooked === 0, `${doubleBooked} rounds`);
  check(`${label}: every round is full`, wrongSize === 0 && perRound.size === rounds);
  check(`${label}: rest shared evenly (spread <= 1)`, restSpread <= 1, `spread ${restSpread}`);
  check(`${label}: matches shared evenly (spread <= 1)`, matchSpread <= 1, `${q.minMatches}-${q.maxMatches}`);
  // With rounds <= n-1 there are enough distinct pairs to never need a repeat.
  check(`${label}: no repeated partnerships`, q.repeatedPartnerships === 0, `${q.repeatedPartnerships} repeats`);
}

// --- a full americano: everyone partners everyone exactly once ---
for (const n of [4, 8, 12, 16]) {
  const s = generateAmericano(n, n - 1);
  const q = scheduleQuality(s, n);
  const possible = (n * (n - 1)) / 2;
  check(
    `n=${n} full run (${n - 1} rounds): partnerships all distinct`,
    q.repeatedPartnerships === 0,
    `${q.distinctPartners}/${possible} pairs used`
  );
}

// --- over-long runs must stay legal, even once repeats are unavoidable ---
const long = generateAmericano(8, 30);
check("rounds are capped", long.matches.length / matchesPerRound(8) === MAX_AMERICANO_ROUNDS);
const longRounds = new Map<number, number[]>();
for (const m of long.matches) longRounds.set(m.round, [...(longRounds.get(m.round) ?? []), ...m.team1, ...m.team2]);
check(
  "long run: still nobody double-booked",
  [...longRounds.values()].every((ps) => new Set(ps).size === ps.length)
);

// --- determinism: the preview the organiser sees is the draw they get ---
const a = JSON.stringify(generateAmericano(11, 7));
const b = JSON.stringify(generateAmericano(11, 7));
check("schedule is deterministic", a === b);

// --- guards ---
let threw = "";
try {
  generateAmericano(3, 5);
} catch (e) {
  threw = e instanceof Error ? e.message : "?";
}
check("fewer than 4 players is rejected", threw.includes("at least 4"), threw);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
