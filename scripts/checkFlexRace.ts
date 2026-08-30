// Verifies the configurable race target and serve rotation added in v3:
// race-to-16 with any target, race-to-9's points total scaling with it, the
// serve changing hands every N points, and match-point/sudden-death detection.
// Run: npx tsx scripts/checkFlexRace.ts
import { applyPoint, createInitialState, toDTO, type ScoringConfig } from "../src/lib/scoring/engine";
import { synthPoints } from "../src/lib/scoring/synth";
import { serveInfo } from "../src/lib/scoring/serve";
import { pressureInfo } from "../src/lib/scoring/pressure";
import { matchFormatLabel, raceTargetOf, serveEveryOf } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

function play(seq: (1 | 2)[], config: ScoringConfig) {
  let s = createInitialState(config);
  let endedAt = -1;
  seq.forEach((slot, i) => {
    const before = s.matchWinnerSlot;
    s = applyPoint(s, slot, config).state;
    if (before === null && s.matchWinnerSlot !== null) endedAt = i + 1;
  });
  return { state: s, endedAt, dto: toDTO(s, config) };
}

// --- first to 18 ------------------------------------------------------------
const to18: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: 18, serveEvery: 3 };

const w18 = play(Array<1 | 2>(25).fill(1), to18);
check("first-to-18: 18-0 ends at exactly 18 points", w18.endedAt === 18, `ended at ${w18.endedAt}`);
check("first-to-18: recorded as 18-0", JSON.stringify(w18.state.sets[0]?.tiebreak) === "[18,0]");

const alt18: (1 | 2)[] = [];
for (let i = 0; i < 17; i++) alt18.push(1, 2); // 17-17
const sd18 = play(alt18, to18);
check("first-to-18: 17-17 is not a win", sd18.state.matchWinnerSlot === null, JSON.stringify(sd18.state.curGamePoints));
const sd18done = play([...alt18, 2], to18);
check("first-to-18: sudden death 17-18 wins", sd18done.state.matchWinnerSlot === 2, JSON.stringify(sd18done.state.sets[0]?.tiebreak));

// legacy config (no raceTarget) still means 16
const legacy = play(Array<1 | 2>(16).fill(1), { bestOfSets: 1, tiebreakMode: "race-to-16" });
check("first-to with no target still ends at 16", legacy.state.matchWinnerSlot === 1 && legacy.endedAt === 16);

// --- points total with target 11 (20 total) ---------------------------------
const total11: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-9", raceTarget: 11 };
const t = play([...Array<1 | 2>(11).fill(1), ...Array<1 | 2>(9).fill(2)], total11); // 11-9 = 20 total
check("total-11: 11-9 ends at 20 total points", t.endedAt === 20 && t.state.matchWinnerSlot === 1, `ended at ${t.endedAt}`);

const tiedSeq: (1 | 2)[] = [];
for (let i = 0; i < 10; i++) tiedSeq.push(1, 2); // 10-10 = 20 total
const tied = play(tiedSeq, total11);
check("total-11: 10-10 at 20 total is not a win", tied.state.matchWinnerSlot === null);
const decided = play([...tiedSeq, 2], total11);
check("total-11: sudden death 10-11 decides", decided.state.matchWinnerSlot === 2);

// trailing side's point can end it: 10-8, slot 2 scores -> 10-9 at 19... make 19 first
const trail = play([...Array<1 | 2>(10).fill(1), ...Array<1 | 2>(9).fill(2)], total11); // 10-9 = 19
check("total-11: 10-9 still live", trail.state.matchWinnerSlot === null);
const trailEnd = play([...Array<1 | 2>(10).fill(1), ...Array<1 | 2>(10).fill(2)], total11); // 2 scores the 20th
check("total-11: trailing side's point ends it, LEADER wins", trailEnd.state.matchWinnerSlot === null, "10-10 is the tie, not a win");
const leaderEnd = play([...Array<1 | 2>(11).fill(1), ...Array<1 | 2>(8).fill(2), 2], total11); // 11-9, last point by 2
check("total-11: loser scores the final point, winner read off the board", leaderEnd.state.matchWinnerSlot === 1);

// --- synth validation follows the target ------------------------------------
const synthOk = synthPoints({ completedSets: [{ a: 18, b: 11 }] }, to18);
check("synth: 18-11 valid at target 18", synthOk.matchWinnerSlot === 1);
let threw = "";
try {
  synthPoints({ completedSets: [{ a: 16, b: 11 }] }, to18);
} catch (e) {
  threw = e instanceof Error ? e.message : "?";
}
check("synth: 16-11 rejected at target 18", threw.includes("18"), threw);

// --- serve rotation follows serveEvery --------------------------------------
function serveAt(points: number, config: ScoringConfig) {
  let s = createInitialState(config);
  for (let i = 0; i < points; i++) s = applyPoint(s, 1, config).state;
  return serveInfo(toDTO(s, config));
}
const s0 = serveAt(0, to18);
const s2 = serveAt(2, to18);
const s3 = serveAt(3, to18);
const s6 = serveAt(6, to18);
check("serve-every-3: slot 1 opens with 3 serves", s0?.slot === 1 && s0?.servesLeft === 3 && s0?.serveEvery === 3, JSON.stringify(s0));
check("serve-every-3: point 3 of turn is the last", s2?.slot === 1 && s2?.lastOfTurn === true, JSON.stringify(s2));
check("serve-every-3: changes hands after 3", s3?.slot === 2, JSON.stringify(s3));
check("serve-every-3: back to slot 1 after 6", s6?.slot === 1, JSON.stringify(s6));
const sLegacy = serveAt(4, { bestOfSets: 1, tiebreakMode: "race-to-16" });
check("no serveEvery set: still flips every 4", sLegacy?.slot === 2 && sLegacy?.serveEvery === 4, JSON.stringify(sLegacy));

// --- pressure: match point & sudden death -----------------------------------
function pressureAfter(seq: (1 | 2)[], config: ScoringConfig) {
  const { dto } = play(seq, config);
  return pressureInfo(dto, config);
}
const mp = pressureAfter([...Array<1 | 2>(17).fill(1), ...Array<1 | 2>(3).fill(2)], to18); // 17-3
check("pressure: 17-3 is match point for slot 1", mp?.matchPointFor === 1 && !mp.suddenDeath, JSON.stringify(mp));
const sd = pressureAfter(alt18, to18); // 17-17
check("pressure: 17-17 is sudden death", sd?.suddenDeath === true, JSON.stringify(sd));
const calm = pressureAfter([1, 1, 2], to18);
check("pressure: 2-1 is nothing", calm === null);
// points-total: 10-9 at 19 of 20 — leader wins whichever side scores → match point, NOT sudden death
const totalMp = pressureAfter([...Array<1 | 2>(10).fill(1), ...Array<1 | 2>(9).fill(2)], total11);
check("pressure: total-rule last point is match point for the leader, not sudden death", totalMp?.matchPointFor === 1 && !totalMp.suddenDeath, JSON.stringify(totalMp));

// --- win by two: the race runs on past the target like a tiebreak ------------
const winBy2: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: 16, raceWinBy: 2 };

const wb0 = play(Array<1 | 2>(16).fill(1), winBy2);
check("win-by-2: 16-0 still ends at the target", wb0.endedAt === 16 && wb0.state.matchWinnerSlot === 1, `ended at ${wb0.endedAt}`);

// 15-15 then one point is 16-15 — NOT enough with win by two.
const lvl: (1 | 2)[] = [];
for (let i = 0; i < 15; i++) lvl.push(1, 2);
const at1615 = play([...lvl, 1], winBy2);
check("win-by-2: 16-15 does not win it", at1615.state.matchWinnerSlot === null, JSON.stringify(at1615.state.curGamePoints));
const at1715 = play([...lvl, 1, 1], winBy2);
check("win-by-2: 17-15 takes it", at1715.state.matchWinnerSlot === 1, JSON.stringify(at1715.state.sets[0]?.tiebreak));

// A long deuce: level at 20-20, then two in a row.
const long: (1 | 2)[] = [];
for (let i = 0; i < 20; i++) long.push(1, 2);
check("win-by-2: 20-20 is still live", play(long, winBy2).state.matchWinnerSlot === null);
check("win-by-2: 22-20 ends it", play([...long, 1, 1], winBy2).state.matchWinnerSlot === 1, JSON.stringify(play([...long, 1, 1], winBy2).state.sets[0]?.tiebreak));
check("win-by-2: 21-20 does not", play([...long, 1], winBy2).state.matchWinnerSlot === null);

// Sudden death is unchanged when win-by is not asked for.
const sudden: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: 16 };
check("sudden death still ends 16-15", play([...lvl, 1], sudden).state.matchWinnerSlot === 1);

// Hand-entered scores follow the same rule.
check("synth: 17-15 valid under win-by-2", synthPoints({ completedSets: [{ a: 17, b: 15 }] }, winBy2).matchWinnerSlot === 1);
check("synth: 16-14 valid under win-by-2", synthPoints({ completedSets: [{ a: 16, b: 14 }] }, winBy2).matchWinnerSlot === 1);
let wbThrew = "";
try {
  synthPoints({ completedSets: [{ a: 16, b: 15 }] }, winBy2);
} catch (e) {
  wbThrew = e instanceof Error ? e.message : "?";
}
check("synth: 16-15 rejected under win-by-2", wbThrew.includes("win by 2"), wbThrew);
let wbThrew2 = "";
try {
  synthPoints({ completedSets: [{ a: 19, b: 15 }] }, winBy2);
} catch (e) {
  wbThrew2 = e instanceof Error ? e.message : "?";
}
check("synth: 19-15 rejected (past the target the margin is exactly two)", wbThrew2.includes("win by 2"), wbThrew2);

// Match point reads correctly: at 16-15 either side can still only be one clear.
{
  const p = pressureInfo(play([...lvl, 1], winBy2).dto, winBy2);
  check("win-by-2: 16-15 is match point for the leader, not sudden death", p?.matchPointFor === 1 && !p.suddenDeath, JSON.stringify(p));
  const level = pressureInfo(play(lvl, winBy2).dto, winBy2);
  check("win-by-2: 15-15 is not match point at all", level === null, JSON.stringify(level));
}

check("label: win by 2 is named", matchFormatLabel(1, winBy2) === "First to 16, win by 2", matchFormatLabel(1, winBy2));

// --- labels & helpers --------------------------------------------------------
check("label: first to 18", matchFormatLabel(1, to18) === "First to 18 points", matchFormatLabel(1, to18));
check("label: total 20", matchFormatLabel(1, total11) === "20 points total", matchFormatLabel(1, total11));
check("label: legacy race-to-9 stays 16 total", matchFormatLabel(1, { tiebreakMode: "race-to-9" }) === "16 points total");
check("raceTargetOf: legacy race-to-9 -> 9", raceTargetOf({ tiebreakMode: "race-to-9" }) === 9);
check("serveEveryOf: 0 -> 4", serveEveryOf({ tiebreakMode: "race-to-16", serveEvery: 0 }) === 4);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
