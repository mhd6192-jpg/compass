// The app has to be honest about what it is going to do.
//
// An audit of every setup path turned up one recurring shape: a screen that
// describes a tournament the app will not actually run. A field the form calls
// legal and the seeder throws on. A rounds count the copy promises and the input
// refuses. A "match tiebreak" announced on every wall for a match that has no
// decider to replace. A podium that ranks two separately-ranked groups as one.
// A 7-6 set reported as its breaker points.
//
// None of them are crashes; all of them are the app saying something untrue to
// somebody standing in a sports hall. This pins down the fixes.
//
//   npx tsx scripts/checkSetupGuards.ts
export {};

import { computePodium } from "../src/lib/v2/podium";
import { scoreLine } from "../src/lib/v3/venue";
import { scoreLine as scoreLineV2 } from "../src/lib/v2/venue";
import { describeField, maxRoundsFor, validateField, FORMAT_IDS, formatSpec } from "../src/lib/bracket/formats";
import { MAX_AMERICANO_PLAYERS, MAX_AMERICANO_ROUNDS } from "../src/lib/bracket/americano";
import { matchFormatLabel, type MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const p = (id: string, name: string, team = 0) => ({ id, name, seed: 0, team });

function m(opts: {
  id: string;
  s1: Array<{ id: string; name: string; seed: number; team: number }>;
  s2: Array<{ id: string; name: string; seed: number; team: number }>;
  score: [number, number];
  /** Set play instead of a race: the score is games, and a breaker may sit behind it. */
  sets?: { games: [number, number]; tiebreak?: [number, number] }[];
  tiebreakMode?: string;
}): MatchDTO {
  const [a, b] = opts.score;
  const mode = opts.tiebreakMode ?? "race-to-16";
  const completedSets = opts.sets ?? [{ games: [1, 0] as [number, number], tiebreak: [a, b] as [number, number] }];
  const s1Wins = opts.sets ? completedSets[0].games[0] > completedSets[0].games[1] : a >= b;
  return {
    id: opts.id,
    bracket: "AM",
    round: 1,
    roundName: "Round 1",
    posIndex: 0,
    player1: p(opts.s1[0].id, opts.s1.map((x) => x.name).join(" & ")),
    player2: p(opts.s2[0].id, opts.s2.map((x) => x.name).join(" & ")),
    player1Members: opts.s1.length > 1 ? opts.s1 : null,
    player2Members: opts.s2.length > 1 ? opts.s2 : null,
    winnerId: s1Wins ? opts.s1[0].id : opts.s2[0].id,
    loserId: s1Wins ? opts.s2[0].id : opts.s1[0].id,
    status: "completed",
    courtId: 1,
    courtSlot: null,
    forcedEnd: false,
    forcedEndReason: null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: "2026-09-17T10:00:00.000Z",
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: mode as never, ...(mode === "race-to-16" ? { raceTarget: 16 } : {}) },
      setsWon: s1Wins ? [1, 0] : [0, 1],
      completedSets,
      currentSet: null,
      currentGame: null,
      isMatchTiebreakSet: false,
      matchWinnerSlot: null,
      totalPoints: a + b,
    },
  } as unknown as MatchDTO;
}

// =============================================================================
// A field the form accepts must be one the seeder can actually build
// =============================================================================
check(
  "mixed americano refuses a field above the americano ceiling",
  validateField("mixed-americano", MAX_AMERICANO_PLAYERS + 2) !== null,
  String(validateField("mixed-americano", MAX_AMERICANO_PLAYERS + 2))
);
check("mixed americano still accepts the ceiling itself", validateField("mixed-americano", MAX_AMERICANO_PLAYERS) === null);
check(
  "...and the refusal names both bounds",
  (validateField("mixed-americano", 34) ?? "").includes(String(MAX_AMERICANO_PLAYERS)),
  validateField("mixed-americano", 34) ?? ""
);

// =============================================================================
// A rounds count the copy promises must be one the app will accept
// =============================================================================
for (const id of FORMAT_IDS) {
  const spec = formatSpec(id);
  if (!spec.maxRounds) continue;
  const worst = [4, 8, 12, 16, 24, 28, 32].map((n) => maxRoundsFor(id, n));
  check(
    `${id}: never promises more rounds than the app accepts`,
    worst.every((r) => r >= 1 && r <= MAX_AMERICANO_ROUNDS),
    worst.join(",")
  );
}
check("a 28-player americano is promised the cap, not 27", maxRoundsFor("americano", 28) === MAX_AMERICANO_ROUNDS, String(maxRoundsFor("americano", 28)));
check("a 12-player americano is still promised 11", maxRoundsFor("americano", 12) === 11, String(maxRoundsFor("americano", 12)));

// =============================================================================
// Every format describes the field it was actually given
// =============================================================================
for (const id of FORMAT_IDS) {
  const spec = formatSpec(id);
  if (!spec.describeField) continue;
  // Well below any minimum: the sentence must be the refusal, not a confident
  // promise computed from a field nobody entered.
  const tiny = describeField(id, 2);
  check(`${id}: a field below the minimum reads as illegal`, !tiny.ok, tiny.message.slice(0, 60));
}
{
  const four = describeField("two-group", 4);
  check("two groups: four teams is refused, not quoted a match count", !four.ok, four.message);
  // The old form clamped the count up to the minimum before doing the
  // arithmetic, so four teams were promised the NINE matches of six. Asserting
  // the absence of "9 matches" alone would also pass on a merely-different
  // wrong number, so the real property is asserted: a refusal quotes the field
  // it was given and never a match count at all.
  check("...the refusal quotes the field it was given", four.message.includes("(got 4)"), four.message);
  check("...and quotes no match count", !/\d+ matches/.test(four.message), four.message);
  const six = describeField("two-group", 6);
  check("two groups: six teams is described", six.ok && six.message.includes("6 teams"), six.message);
  const rr = describeField("round-robin", 5);
  check("round robin: five entrants means ten matches", rr.ok && rr.message.includes("10 matches"), rr.message);
  const rrShort = describeField("round-robin", 2);
  check("round robin: two entrants is refused", !rrShort.ok, rrShort.message);
}
check(
  "mixed americano warns about sit-outs like every other rotating format",
  describeField("mixed-americano", 10).message.includes("sitting out"),
  describeField("mixed-americano", 10).message
);

// =============================================================================
// A match tiebreak is only claimed where there is a decider to replace
// =============================================================================
check(
  "best of 1 does not claim a match tiebreak",
  matchFormatLabel(1, { tiebreakMode: "match-tiebreak" }) === "Best of 1",
  matchFormatLabel(1, { tiebreakMode: "match-tiebreak" })
);
check(
  "best of 3 does",
  matchFormatLabel(3, { tiebreakMode: "match-tiebreak" }) === "Best of 3 · match tiebreak",
  matchFormatLabel(3, { tiebreakMode: "match-tiebreak" })
);

// =============================================================================
// The board reports a set as games, and a race as points
// =============================================================================
{
  const race = m({ id: "r", s1: [p("a", "Ana")], s2: [p("b", "Ben")], score: [16, 9] });
  check("a race is reported as its points", scoreLine(race).a === "16" && scoreLine(race).b === "9", JSON.stringify(scoreLine(race)));

  // A 7-6 set carries a breaker too, and reading it reported the set as "7-4".
  const set = m({
    id: "s",
    s1: [p("a", "Ana")],
    s2: [p("b", "Ben")],
    score: [7, 6],
    tiebreakMode: "standard",
    sets: [{ games: [7, 6], tiebreak: [7, 4] }],
  });
  check("a 7-6 set is reported as 7-6, not as its breaker", scoreLine(set).a === "7" && scoreLine(set).b === "6", JSON.stringify(scoreLine(set)));
  check("v2 says the same thing", scoreLineV2(set).a === "7" && scoreLineV2(set).b === "6", JSON.stringify(scoreLineV2(set)));

  const shortSet = m({
    id: "t",
    s1: [p("a", "Ana")],
    s2: [p("b", "Ben")],
    score: [5, 4],
    tiebreakMode: "standard",
    sets: [{ games: [5, 4], tiebreak: [7, 5] }],
  });
  check("a short set won on a breaker reads 5-4", scoreLine(shortSet).a === "5", JSON.stringify(scoreLine(shortSet)));
}

// =============================================================================
// A podium's `place` is unique, because three other things depend on it
// =============================================================================
//
// `buildAwards` picks ONE award per place, `FinalStandingsScreen` names
// podium[0] the champion, and `archive.finalPlacings` sorts the archived
// standings and every MemberResult.rank by it. Announcing both groups' winners
// by giving them the same place breaks all three, which is why the podium is
// still one combined table and why that is pinned down here rather than left to
// be rediscovered.
{
  const A = ["Ana", "Bea", "Cara", "Dee"].map((n, i) => p(`a${i}`, n, 1));
  const B = ["Ivan", "Jon", "Kai", "Leo"].map((n, i) => p(`b${i}`, n, 2));
  const matches = [
    m({ id: "m1", s1: [A[0], A[1]], s2: [A[2], A[3]], score: [16, 14] }),
    m({ id: "m2", s1: [B[0], B[1]], s2: [B[2], B[3]], score: [9, 7] }),
    m({ id: "m3", s1: [A[0], A[2]], s2: [A[1], A[3]], score: [16, 13] }),
    m({ id: "m4", s1: [B[0], B[2]], s2: [B[1], B[3]], score: [8, 6] }),
  ];
  const groupOf = (id: string) => (id.startsWith("a") ? 1 : 2);

  for (const format of ["americano", "mixed-americano", "mixed-mexicano", "mixicano"]) {
    const podium = computePodium(matches, format, "race-to-16");
    const places = podium.map((a) => a.place);
    check(`${format}: every podium place is distinct`, new Set(places).size === places.length, places.join(","));
    check(`${format}: places run 1..n in order`, places.every((pl, i) => pl === i + 1), places.join(","));
    const ids = podium.map((a) => a.playerId);
    check(`${format}: nobody is on the podium twice`, new Set(ids).size === ids.length);
  }

  // The medal line names the group for a grouped format, and does not invent
  // one for a plain americano. Asserting the prefix itself, not just that the
  // line is non-empty — the record behind it is always there either way.
  const grouped = computePodium(matches, "mixed-americano", "race-to-16");
  check("a grouped format names the group on the medal line", (grouped[0].detail ?? "").startsWith("Group "), grouped[0]?.detail);
  check(
    "...and names the right one",
    (grouped[0].detail ?? "").startsWith(groupOf(grouped[0].playerId) === 1 ? "Group A" : "Group B"),
    `${grouped[0].name} -> ${grouped[0].detail}`
  );
  check("the leader is the top scorer overall", groupOf(grouped[0].playerId) === 1, grouped[0].name);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
