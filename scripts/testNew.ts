import { arrangeDraw, seedSlots } from "../src/lib/bracket/seedArrange";
import { synthPoints } from "../src/lib/scoring/synth";
import { computeMatchState, ScoringConfig } from "../src/lib/scoring/engine";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("ok:", msg);
  }
}

// ---- Seeding ----
console.log("\n=== seedSlots(16) ===");
const slots = seedSlots(16);
console.log(slots.join(","));
assert(slots.length === 16, "16 slots");
assert(slots[0] === 1, "slot 0 is seed 1");
assert(slots.includes(2) && slots.includes(16), "contains all seeds");
// seeds 1 and 2 in opposite halves
const half1 = slots.slice(0, 8);
const half2 = slots.slice(8, 16);
assert(half1.includes(1) && half2.includes(2), "seed 1 & 2 in opposite halves");
// seeds 1-4 in separate quarters
const quarters = [slots.slice(0, 4), slots.slice(4, 8), slots.slice(8, 12), slots.slice(12, 16)];
const topSeedQuarter = [1, 2, 3, 4].map((s) => quarters.findIndex((q) => q.includes(s)));
assert(new Set(topSeedQuarter).size === 4, "seeds 1-4 each in a different quarter");

console.log("\n=== Alhayat draw ===");
const alhayat = [
  { name: "Player One", seed: null },
  { name: "Player Two", seed: null },
  { name: "Player Three", seed: 16 },
  { name: "Player Four", seed: 13 },
  { name: "Player Five", seed: null },
  { name: "Player Six", seed: 1 },
  { name: "Player Seven", seed: null },
  { name: "Player Eight", seed: null },
  { name: "Player Nine", seed: 2 },
  { name: "Player Ten", seed: null },
  { name: "Player Eleven", seed: 4 },
  { name: "Player Twelve", seed: null },
  { name: "Player Thirteen", seed: 3 },
  { name: "Player Fourteen", seed: 14 },
  { name: "Player Fifteen", seed: 15 },
  { name: "Player Sixteen", seed: null },
];
const order = arrangeDraw(alhayat);
const pairs: [string, string][] = [];
for (let i = 0; i < 8; i++) pairs.push([order[i * 2], order[i * 2 + 1]]);
console.log("R16 pairings:");
pairs.forEach((p, i) => console.log(`  M${i + 1}: ${p[0]} vs ${p[1]}`));

// pros = PlayerSix(1), PlayerNine(2), Player Thirteen(3), Player Eleven(4). Each should be in a different quarter.
const pros = ["Player Six", "Player Nine", "Player Thirteen", "Player Eleven"];
const proQuarter = pros.map((name) => {
  const slotIdx = order.indexOf(name);
  return Math.floor(slotIdx / 4);
});
console.log("pro quarters:", pros.map((p, i) => `${p}=Q${proQuarter[i]}`).join(", "));
assert(new Set(proQuarter).size === 4, "all 4 pros in separate quarters");

// Each pro should face a non-pro in R16 (their R16 opponent is not another pro)
for (const name of pros) {
  const slotIdx = order.indexOf(name);
  const oppIdx = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1;
  const opp = order[oppIdx];
  assert(!pros.includes(opp), `${name} does not face a pro in R16 (faces ${opp})`);
}

// Predicted SF pairings if seeds hold: quarters 0&1 -> SF top, 2&3 -> SF bottom.
// The quarter winners (by seed) meet: Q0 vs Q1, Q2 vs Q3.
const seedOf: Record<string, number> = { "Player Six": 1, "Player Nine": 2, "Player Thirteen": 3, "Player Eleven": 4 };
const topSF = [pros.find((p) => proQuarter[pros.indexOf(p)] === 0), pros.find((p) => proQuarter[pros.indexOf(p)] === 1)];
const botSF = [pros.find((p) => proQuarter[pros.indexOf(p)] === 2), pros.find((p) => proQuarter[pros.indexOf(p)] === 3)];
console.log("Predicted SF (if seeds hold):", topSF.join(" vs "), "|", botSF.join(" vs "));
// final would be top-half winner vs bottom-half winner; seeds 1 & 2 should be in opposite halves
const playerSixHalf = Math.floor(order.indexOf("Player Six") / 8);
const playerNineHalf = Math.floor(order.indexOf("Player Nine") / 8);
assert(playerSixHalf !== playerNineHalf, "PlayerSix (1) and PlayerNine (2) in opposite halves -> only meet in final");

// ---- Synthetic scores ----
console.log("\n=== synthPoints ===");
function checkScore(config: ScoringConfig, input: Parameters<typeof synthPoints>[0], expectWinner: 1 | 2 | null, desc: string) {
  const { slots: s, matchWinnerSlot } = synthPoints(input, config);
  const state = computeMatchState(s, config);
  const setStr = state.sets.map((x) => `${x.games[0]}-${x.games[1]}`).join(", ");
  assert(matchWinnerSlot === expectWinner, `${desc} -> winner ${matchWinnerSlot} (expected ${expectWinner}) [${setStr}]`);
}

const std3: ScoringConfig = { bestOfSets: 3, tiebreakMode: "standard" };
checkScore(std3, { completedSets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] }, 1, "6-4 6-3 finishes for p1");
checkScore(std3, { completedSets: [{ a: 4, b: 6 }, { a: 2, b: 6 }] }, 2, "4-6 2-6 finishes for p2");
checkScore(std3, { completedSets: [{ a: 7, b: 6 }, { a: 7, b: 5 }] }, 1, "7-6 7-5 finishes for p1");
checkScore(std3, { completedSets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 6, b: 2 }] }, 1, "three-set 6-4 4-6 6-2 for p1");
checkScore(std3, { completedSets: [{ a: 6, b: 4 }] }, null, "one set 6-4 does not finish (partial)");
checkScore(std3, { completedSets: [{ a: 6, b: 4 }], currentSetGames: [3, 2] }, null, "6-4 + current 3-2 stays live");

const mtb3: ScoringConfig = { bestOfSets: 3, tiebreakMode: "match-tiebreak" };
checkScore(mtb3, { completedSets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 10, b: 7 }] }, 1, "match-tiebreak decider 10-7 for p1");
checkScore(mtb3, { completedSets: [{ a: 4, b: 6 }, { a: 6, b: 3 }, { a: 8, b: 10 }] }, 2, "match-tiebreak decider 8-10 for p2");

// illegal inputs should throw
function expectThrow(fn: () => void, desc: string) {
  try {
    fn();
    console.error("FAIL: expected throw:", desc);
    failures++;
  } catch {
    console.log("ok (threw):", desc);
  }
}
expectThrow(() => synthPoints({ completedSets: [{ a: 6, b: 6 }] }, std3), "6-6 is not a valid completed set");
expectThrow(() => synthPoints({ completedSets: [{ a: 5, b: 3 }] }, std3), "5-3 is not a finished set");
expectThrow(() => synthPoints({ completedSets: [{ a: 6, b: 0 }, { a: 6, b: 0 }, { a: 6, b: 0 }] }, std3), "too many sets");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
