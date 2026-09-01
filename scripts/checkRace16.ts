// Verifies the race-to-16 scoring rules end to end (engine, hand-entered scores,
// score line, standings) plus a race-to-9 regression. Run: npx tsx scripts/checkRace16.ts
import { applyPoint, createInitialState, toDTO, type ScoringConfig } from "../src/lib/scoring/engine";
import { synthPoints } from "../src/lib/scoring/synth";
import { computeStandings } from "../src/lib/standings";
import { formatMatchScoreLine } from "../src/lib/scoring/format";
import type { MatchDTO, TiebreakMode } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

function play(seq: (1 | 2)[], mode: TiebreakMode) {
  const config: ScoringConfig = { bestOfSets: 1, tiebreakMode: mode };
  let s = createInitialState(config);
  let tier = "point";
  let endedAt = -1;
  seq.forEach((slot, i) => {
    const before = s.matchWinnerSlot;
    const r = applyPoint(s, slot, config);
    s = r.state;
    tier = r.tier;
    if (before === null && s.matchWinnerSlot !== null) endedAt = i + 1;
  });
  return { state: s, tier, endedAt, dto: toDTO(s, config) };
}

const R16: TiebreakMode = "race-to-16";
const R9: TiebreakMode = "race-to-9";

// --- race-to-16 -------------------------------------------------------------
const whitewash = play(Array<1 | 2>(20).fill(1), R16);
check("16-0 ends at exactly 16 points", whitewash.endedAt === 16, `ended at ${whitewash.endedAt}`);
check("16-0 winner is slot 1", whitewash.state.matchWinnerSlot === 1);
check("16-0 recorded as tiebreak 16-0", JSON.stringify(whitewash.state.sets[0]?.tiebreak) === "[16,0]", JSON.stringify(whitewash.state.sets[0]));

// alternate to 15-15, nothing decided yet
const alt: (1 | 2)[] = [];
for (let i = 0; i < 15; i++) {
  alt.push(1, 2);
}
const at1515 = play(alt, R16);
check("15-15 is not a win", at1515.state.matchWinnerSlot === null, JSON.stringify(at1515.state.curGamePoints));
check("15-15 scoreboard reads 15-15", JSON.stringify(at1515.state.curGamePoints) === "[15,15]");

const suddenDeath = play([...alt, 2], R16);
check("15-15 sudden death: next point wins", suddenDeath.state.matchWinnerSlot === 2);
check("sudden death score is 15-16", JSON.stringify(suddenDeath.state.sets[0]?.tiebreak) === "[15,16]", JSON.stringify(suddenDeath.state.sets[0]));
check("sudden death fires the match tier", suddenDeath.tier === "match");

// no win-by-2 anywhere: 16-14 ends immediately
const lead: (1 | 2)[] = [];
for (let i = 0; i < 14; i++) {
  lead.push(1, 2);
}
for (let i = 0; i < 2; i++) {
  lead.push(1);
}
const at1614 = play(lead, R16);
check("16-14 ends without a 2-point cushion rule", at1614.state.matchWinnerSlot === 1 && at1614.endedAt === 30, `ended at ${at1614.endedAt}`);

// nothing ends early
const midMatch = play([...Array<1 | 2>(10).fill(1), ...Array<1 | 2>(2).fill(2)], R16);
check("10-2 is still live", midMatch.state.matchWinnerSlot === null);

// points after the finish are ignored
const overrun = play([...Array<1 | 2>(20).fill(1), 2, 2], R16);
check("points after 16 are ignored", JSON.stringify(overrun.state.sets[0]?.tiebreak) === "[16,0]");

// --- synth (entering a final score by hand) ---------------------------------
const cfg16: ScoringConfig = { bestOfSets: 1, tiebreakMode: R16 };
function synthOk(a: number, b: number) {
  try {
    const { matchWinnerSlot } = synthPoints({ completedSets: [{ a, b }] }, cfg16);
    return matchWinnerSlot;
  } catch (e) {
    return `ERR: ${(e as Error).message}`;
  }
}
check("synth 16-14 valid, slot 1 wins", synthOk(16, 14) === 1, String(synthOk(16, 14)));
check("synth 16-15 valid (sudden death)", synthOk(16, 15) === 1, String(synthOk(16, 15)));
check("synth 3-16 valid, slot 2 wins", synthOk(3, 16) === 2, String(synthOk(3, 16)));
check("synth 16-0 valid", synthOk(16, 0) === 1, String(synthOk(16, 0)));
check("synth 15-13 rejected", String(synthOk(15, 13)).startsWith("ERR"), String(synthOk(15, 13)));
check("synth 17-15 rejected", String(synthOk(17, 15)).startsWith("ERR"), String(synthOk(17, 15)));
check("synth 16-16 rejected", String(synthOk(16, 16)).startsWith("ERR"), String(synthOk(16, 16)));
check("synth 9-7 rejected under race-to-16", String(synthOk(9, 7)).startsWith("ERR"), String(synthOk(9, 7)));

// --- downstream: score line + standings --------------------------------------
function fakeMatch(tb: [number, number], mode: TiebreakMode): MatchDTO {
  const p1WinnerFirst = tb[0] > tb[1];
  return {
    id: "m1",
    bracket: "RR",
    round: 1,
    roundName: "Group Stage",
    posIndex: 0,
    player1: { id: "a", name: "A", seed: 1 },
    player2: { id: "b", name: "B", seed: 2 },
  player1Members: null,
  player2Members: null,
    winnerId: p1WinnerFirst ? "a" : "b",
    loserId: p1WinnerFirst ? "b" : "a",
    status: "completed",
    courtId: null,
    courtSlot: null,
    isBracketFinal: false,
    isChampionshipFinal: false,
    forcedEnd: false,
    forcedEndReason: null,
    calledAt: null,
    startedAt: null,
    completedAt: null,
    comeback: null,
    longestPointMs: null,
    state: {
      config: { bestOfSets: 1, tiebreakMode: mode },
      setsWon: p1WinnerFirst ? [1, 0] : [0, 1],
      completedSets: [{ games: p1WinnerFirst ? [1, 0] : [0, 1], tiebreak: tb }],
      currentSet: null,
      currentGame: null,
      isMatchTiebreakSet: false,
      matchWinnerSlot: p1WinnerFirst ? 1 : 2,
      totalPoints: tb[0] + tb[1],
    },
  };
}
const m = fakeMatch([16, 14], R16);
check("score line reads 16-14", formatMatchScoreLine(m) === "16-14", formatMatchScoreLine(m));
const st = computeStandings([m]);
check("standings count 16 points for the winner", st[0].pointsFor === 16 && st[0].pointsAgainst === 14, JSON.stringify(st[0]));
check("standings count 14 points for the loser", st[1].pointsFor === 14 && st[1].pointsAgainst === 16, JSON.stringify(st[1]));

// --- race-to-9 regression ----------------------------------------------------
const r9lead: (1 | 2)[] = [];
for (let i = 0; i < 7; i++) {
  r9lead.push(1, 2);
}
r9lead.push(1, 1);
const r9 = play(r9lead, R9);
check("race-to-9: 9-7 still ends at 16 total", r9.state.matchWinnerSlot === 1 && JSON.stringify(r9.state.sets[0]?.tiebreak) === "[9,7]", JSON.stringify(r9.state.sets[0]));

const r9tie: (1 | 2)[] = [];
for (let i = 0; i < 8; i++) {
  r9tie.push(1, 2);
}
const r9at88 = play(r9tie, R9);
check("race-to-9: 8-8 is not a win", r9at88.state.matchWinnerSlot === null);
const r9dec = play([...r9tie, 2], R9);
check("race-to-9: 8-9 sudden death decides", r9dec.state.matchWinnerSlot === 2 && JSON.stringify(r9dec.state.sets[0]?.tiebreak) === "[8,9]");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
