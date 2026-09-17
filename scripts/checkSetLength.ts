// Sets of a length the club chose.
//
// A set was six games everywhere: in the engine that closes it, in the tiebreak
// that starts at 6-6, in the 7-6 it writes afterwards, and in the validator that
// decides whether a coach may type a score in by hand. A club that plays short
// sets (first to four) or a pro set (first to eight or nine) could not run one
// at all. The number is now a setting, and everything above is derived from it.
//
// The important property is that NOTHING changes for the six-game default: a
// tournament seeded before this existed stores 0 and must score exactly as it
// always did, or every archived result becomes unreadable.
//
//   npx tsx scripts/checkSetLength.ts
import { applyPoint, computeMatchState, createInitialState, ScoringConfig } from "../src/lib/scoring/engine";
import { synthPoints, validateCompletedSet } from "../src/lib/scoring/synth";
import { gamesPerSetOf, matchFormatLabel, tallyUnit } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const cfg = (over: Partial<ScoringConfig> = {}): ScoringConfig => ({
  bestOfSets: 1,
  tiebreakMode: "standard",
  ...over,
});

/** Plays games (not points) by feeding four straight points to a side at a time. */
function playGames(config: ScoringConfig, pattern: (1 | 2)[]) {
  let s = createInitialState(config);
  for (const winner of pattern) {
    for (let p = 0; p < 4 && s.matchWinnerSlot === null; p++) s = applyPoint(s, winner, config).state;
  }
  return s;
}

/** A side that wins `a` games and loses `b`, alternating so the set runs its course. */
function alternate(a: number, b: number): (1 | 2)[] {
  const out: (1 | 2)[] = [];
  const min = Math.min(a, b);
  for (let i = 0; i < min; i++) {
    out.push(1);
    out.push(2);
  }
  for (let i = 0; i < a - min; i++) out.push(1);
  for (let i = 0; i < b - min; i++) out.push(2);
  return out;
}

// --- the default is untouched ---------------------------------------------
check("no setting means six games", gamesPerSetOf({ tiebreakMode: "standard" }) === 6);
check("0 means six games", gamesPerSetOf({ tiebreakMode: "standard", gamesPerSet: 0 }) === 6);
check("a stored length is honoured", gamesPerSetOf({ tiebreakMode: "standard", gamesPerSet: 4 }) === 4);

{
  const s = playGames(cfg(), [1, 1, 1, 1, 1, 1]);
  check("default: 6-0 takes the set", s.matchWinnerSlot === 1 && s.sets[0].games.join("-") === "6-0", s.sets[0]?.games.join("-"));
}
{
  const s = playGames(cfg(), alternate(5, 5).concat([1, 1]));
  check("default: 7-5 takes the set", s.sets[0]?.games.join("-") === "7-5", s.sets[0]?.games.join("-"));
}
{
  // 6-6 then a breaker: seven straight tiebreak points.
  let s = playGames(cfg(), alternate(6, 6));
  check("default: the breaker starts at 6-6", s.isTiebreakGame && s.curSetGames.join("-") === "6-6", s.curSetGames.join("-"));
  for (let p = 0; p < 7; p++) s = applyPoint(s, 1, cfg()).state;
  check("default: the breaker finishes 7-6", s.sets[0]?.games.join("-") === "7-6", s.sets[0]?.games.join("-"));
}

// --- a short set: first to four -------------------------------------------
const short = cfg({ gamesPerSet: 4 });
{
  const s = playGames(short, [1, 1, 1, 1]);
  check("short: 4-0 takes the set", s.sets[0]?.games.join("-") === "4-0", s.sets[0]?.games.join("-"));
}
{
  const s = playGames(short, alternate(2, 2).concat([1, 1]));
  check("short: 4-2 takes the set", s.sets[0]?.games.join("-") === "4-2", s.sets[0]?.games.join("-"));
}
{
  const s = playGames(short, alternate(3, 3).concat([1]));
  check("short: 4-3 does NOT take it — two clear still applies", s.sets.length === 0 && s.curSetGames.join("-") === "4-3", s.curSetGames.join("-"));
}
{
  let s = playGames(short, alternate(4, 4));
  check("short: the breaker starts at 4-4", s.isTiebreakGame && s.curSetGames.join("-") === "4-4", s.curSetGames.join("-"));
  for (let p = 0; p < 7; p++) s = applyPoint(s, 2, short).state;
  check("short: the breaker finishes 5-4, not 7-6", s.sets[0]?.games.join("-") === "4-5", s.sets[0]?.games.join("-"));
  check("short: the breaker's points are kept", s.sets[0]?.tiebreak?.join("-") === "0-7", String(s.sets[0]?.tiebreak));
}
{
  const s = playGames(short, alternate(3, 3).concat([1, 1]));
  check("short: 5-3 takes the set", s.sets[0]?.games.join("-") === "5-3", s.sets[0]?.games.join("-"));
}

// --- a pro set: first to nine ---------------------------------------------
const pro = cfg({ gamesPerSet: 9 });
{
  const s = playGames(pro, alternate(7, 7).concat([1, 1]));
  check("pro: 9-7 takes the set", s.sets[0]?.games.join("-") === "9-7", s.sets[0]?.games.join("-"));
}
{
  let s = playGames(pro, alternate(9, 9));
  check("pro: the breaker starts at 9-9", s.isTiebreakGame, s.curSetGames.join("-"));
  for (let p = 0; p < 7; p++) s = applyPoint(s, 1, pro).state;
  check("pro: the breaker finishes 10-9", s.sets[0]?.games.join("-") === "10-9", s.sets[0]?.games.join("-"));
}

// --- best of three short sets ---------------------------------------------
{
  const config = cfg({ bestOfSets: 3, gamesPerSet: 4 });
  const s = playGames(config, [1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1]);
  check("best of 3 short sets ends 2-1 in sets", s.matchWinnerSlot === 1 && s.setsWon.join("-") === "2-1", s.setsWon.join("-"));
  check("all three sets recorded", s.sets.length === 3, String(s.sets.length));
}

// --- a match tiebreak decider is still ten points, whatever the set length --
{
  const config = cfg({ bestOfSets: 3, tiebreakMode: "match-tiebreak", gamesPerSet: 4 });
  let s = playGames(config, [1, 1, 1, 1, 2, 2, 2, 2]);
  check("decider: the third set becomes a match tiebreak", s.isMatchTiebreakSet, `${s.setsWon.join("-")}`);
  for (let p = 0; p < 10; p++) s = applyPoint(s, 1, config).state;
  check("decider: ten points wins it, not five games", s.matchWinnerSlot === 1, String(s.matchWinnerSlot));
  check("decider: recorded as a one-game set", s.sets[2]?.games.join("-") === "1-0", s.sets[2]?.games.join("-"));
}

// --- hand-typed scores ------------------------------------------------------
const legal = (a: number, b: number, perSet: number, adv = false) => {
  try {
    validateCompletedSet(a, b, false, adv, perSet);
    return true;
  } catch {
    return false;
  }
};

check("typed default: 6-4 legal", legal(6, 4, 6));
check("typed default: 7-5 legal", legal(7, 5, 6));
check("typed default: 7-6 legal", legal(7, 6, 6));
check("typed default: 6-5 illegal", !legal(6, 5, 6));
check("typed default: 8-6 illegal without advantage", !legal(8, 6, 6));
check("typed default: 4-2 illegal", !legal(4, 2, 6));

check("typed short: 4-2 legal", legal(4, 2, 4));
check("typed short: 4-0 legal", legal(4, 0, 4));
check("typed short: 5-3 legal", legal(5, 3, 4));
check("typed short: 5-4 legal (the breaker)", legal(5, 4, 4));
check("typed short: 4-3 illegal", !legal(4, 3, 4));
check("typed short: 6-4 illegal", !legal(6, 4, 4));
check("typed short: 7-6 illegal", !legal(7, 6, 4));

check("typed pro: 9-7 legal", legal(9, 7, 9));
check("typed pro: 10-9 legal", legal(10, 9, 9));
check("typed pro: 9-8 illegal", !legal(9, 8, 9));

check("typed advantage short: 6-4 legal past 4-4", legal(6, 4, 4, true));
check("typed advantage short: 5-4 illegal — no breaker to make it", !legal(5, 4, 4, true));
check("typed advantage default: 10-8 legal", legal(10, 8, 6, true));

// --- every legal typed score round-trips through the engine -----------------
// synthPoints verifies its own output, so a mismatch throws rather than lying.
for (const perSet of [2, 3, 4, 6, 8, 9]) {
  const config = cfg({ bestOfSets: 1, gamesPerSet: perSet });
  const scores: [number, number][] = [];
  for (let lo = 0; lo <= perSet - 2; lo++) scores.push([perSet, lo]);
  scores.push([perSet + 1, perSet - 1]);
  scores.push([perSet + 1, perSet]);
  let ok = 0;
  for (const [a, b] of scores) {
    try {
      const out = synthPoints({ completedSets: [{ a, b, tb: 5 }] }, config);
      if (out.matchWinnerSlot === 1) ok++;
    } catch (e) {
      check(`perSet=${perSet}: ${a}-${b} round-trips`, false, e instanceof Error ? e.message : String(e));
    }
  }
  check(`perSet=${perSet}: every legal set score round-trips`, ok === scores.length, `${ok}/${scores.length}`);
}

// --- the match-tiebreak decider is a 10-point breaker, not a set -------------
//
// It is typed into the same column as 6-4 and 7-5, so anything that reasons
// about "the set length" has to leave this row alone. Capping it at the set
// length made a 10-8 decider impossible to enter at all.
{
  const config = cfg({ bestOfSets: 3, tiebreakMode: "match-tiebreak" });
  const typed = (sets: Array<[number, number]>) => {
    try {
      const out = synthPoints({ completedSets: sets.map(([a, b]) => ({ a, b })) }, config);
      return out.matchWinnerSlot !== null;
    } catch {
      return false;
    }
  };
  check("decider: 6-4, 4-6, 10-8 can be typed in", typed([[6, 4], [4, 6], [10, 8]]));
  check("decider: 6-4, 4-6, 10-0 can be typed in", typed([[6, 4], [4, 6], [10, 0]]));
  check("decider: 12-10 can be typed in", typed([[6, 4], [4, 6], [12, 10]]));
  check("decider: 7-5 is refused — it is a breaker, not a set", !typed([[6, 4], [4, 6], [7, 5]]));
  check("decider: 10-9 is refused — two clear", !typed([[6, 4], [4, 6], [10, 9]]));
  // Reachable-score check: the breaker stops the instant somebody is 10+ and
  // two clear, so a margin wider than two past 10 never happened.
  check("decider: 11-8 is refused — the engine can never reach it", !typed([[6, 4], [4, 6], [11, 8]]));
  check("decider: 15-0 is refused for the same reason", !typed([[6, 4], [4, 6], [15, 0]]));
  // And with a short set length, the decider is still ten points.
  const shortCfg = cfg({ bestOfSets: 3, tiebreakMode: "match-tiebreak", gamesPerSet: 4 });
  const shortTyped = (sets: Array<[number, number]>) => {
    try {
      return synthPoints({ completedSets: sets.map(([a, b]) => ({ a, b })) }, shortCfg).matchWinnerSlot !== null;
    } catch {
      return false;
    }
  };
  check("decider: a short-set match still ends on a 10-point breaker", shortTyped([[4, 2], [2, 4], [10, 8]]));
  check("decider: ...and 5-4 is refused there", !shortTyped([[4, 2], [2, 4], [5, 4]]));
}

// --- an unfinished set ------------------------------------------------------
const unfinished = (a: number, b: number, config: ScoringConfig) => {
  try {
    synthPoints({ completedSets: [], currentSetGames: [a, b] }, config);
    return true;
  } catch {
    return false;
  }
};
check("in progress: 3-3 accepted in a six-game set", unfinished(3, 3, cfg({ bestOfSets: 3 })));
check("in progress: 6-6 accepted (the breaker is on)", unfinished(6, 6, cfg({ bestOfSets: 3 })));
check("in progress: 6-4 refused — that set is over", !unfinished(6, 4, cfg({ bestOfSets: 3 })));
check("in progress: 3-2 accepted in a short set", unfinished(3, 2, cfg({ bestOfSets: 3, gamesPerSet: 4 })));
check("in progress: 4-2 refused in a short set", !unfinished(4, 2, cfg({ bestOfSets: 3, gamesPerSet: 4 })));
check("in progress: 5-5 refused in a short set", !unfinished(5, 5, cfg({ bestOfSets: 3, gamesPerSet: 4 })));
// Advantage has no breaker, so a long unfinished set is exactly what it is for.
// The old ceiling of six refused every one of these.
const adv = cfg({ bestOfSets: 3, tiebreakMode: "advantage" });
check("in progress: 6-6 accepted in an advantage set", unfinished(6, 6, adv));
check("in progress: 7-6 accepted in an advantage set", unfinished(7, 6, adv));
check("in progress: 9-8 accepted in an advantage set", unfinished(9, 8, adv));
check("in progress: 8-6 refused in an advantage set — two clear ended it", !unfinished(8, 6, adv));

// --- what the screens say ---------------------------------------------------
check(
  "label: six games says nothing extra",
  matchFormatLabel(3, { tiebreakMode: "standard" }) === "Best of 3",
  matchFormatLabel(3, { tiebreakMode: "standard" })
);
check(
  "label: a short set is named",
  matchFormatLabel(3, { tiebreakMode: "standard", gamesPerSet: 4 }) === "Best of 3 · first to 4 games",
  matchFormatLabel(3, { tiebreakMode: "standard", gamesPerSet: 4 })
);
check(
  "label: the set length comes before the tiebreak rule",
  matchFormatLabel(3, { tiebreakMode: "match-tiebreak", gamesPerSet: 4 }) === "Best of 3 · first to 4 games · match tiebreak",
  matchFormatLabel(3, { tiebreakMode: "match-tiebreak", gamesPerSet: 4 })
);
check(
  "label: a race ignores the set length entirely",
  matchFormatLabel(1, { tiebreakMode: "race-to-16", raceTarget: 21, gamesPerSet: 4 }) === "First to 21 points",
  matchFormatLabel(1, { tiebreakMode: "race-to-16", raceTarget: 21, gamesPerSet: 4 })
);
check("tally: set play still counts games", tallyUnit("standard").short === "gms");

// --- the old default is bit-for-bit unchanged --------------------------------
// The strongest guarantee available: play the same 400 points with no setting
// and with an explicit 6, and the two states must be identical.
{
  const a = computeMatchState(
    Array.from({ length: 400 }, (_, i) => ((i % 3 === 0 ? 2 : 1) as 1 | 2)),
    cfg({ bestOfSets: 5 })
  );
  const b = computeMatchState(
    Array.from({ length: 400 }, (_, i) => ((i % 3 === 0 ? 2 : 1) as 1 | 2)),
    cfg({ bestOfSets: 5, gamesPerSet: 6 })
  );
  check("an explicit 6 scores identically to no setting at all", JSON.stringify(a) === JSON.stringify(b));
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
