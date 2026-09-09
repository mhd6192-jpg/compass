// The table a person is ranked in, on the phone and on the wall.
//
// The big board and the court TVs split a mixed event into its two groups. The
// phone card did not: it looked for a GA/GB bracket, which only the two-group
// format has. Every rotating match is bracket "AM" and a mixed event carries
// its groups on the PLAYER, so the lookup found nothing and the card ranked
// everybody against the whole field. Somebody standing third in Group B read
// "11th of 16" on their own phone while the television two metres away had
// them third — and in a mixed mexicano that per-group table is the thing the
// next round is drawn from.
//
// The same shape as the entrant-word drift: one screen held the rule and the
// others were written without it. So both now ask `standingsTables`, and this
// pins down that they cannot answer differently.
//
// A trap worth naming: `team` is non-zero for the mixicano and the two team
// formats as well, none of which rank by group. Splitting on `team` alone would
// break three formats to fix two, which is why the split is gated on
// `isGroupRanked`.

export {};

import { standingsTables, tableContaining } from "../src/lib/standings";
import type { MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const p = (id: string, name: string, team = 0) => ({ id, name, seed: 0, team });

function m(opts: {
  id: string;
  bracket?: string;
  s1: Array<{ id: string; name: string; seed: number; team: number }>;
  s2: Array<{ id: string; name: string; seed: number; team: number }>;
  score: [number, number];
}): MatchDTO {
  const [a, b] = opts.score;
  return {
    id: opts.id,
    bracket: opts.bracket ?? "AM",
    round: 1,
    roundName: "Round 1",
    posIndex: 0,
    player1: p(opts.s1[0].id, opts.s1.map((x) => x.name).join(" & ")),
    player2: p(opts.s2[0].id, opts.s2.map((x) => x.name).join(" & ")),
    player1Members: opts.s1.length > 1 ? opts.s1 : null,
    player2Members: opts.s2.length > 1 ? opts.s2 : null,
    winnerId: a >= b ? opts.s1[0].id : opts.s2[0].id,
    loserId: a >= b ? opts.s2[0].id : opts.s1[0].id,
    status: "completed",
    courtId: 1,
    courtSlot: null,
    forcedEnd: false,
    forcedEndReason: null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: "2026-09-09T10:00:00.000Z",
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: "race-to-16" as never, raceTarget: 16 },
      setsWon: [0, 0],
      completedSets: [{ games: [1, 0] as [number, number], tiebreak: [a, b] as [number, number] }],
      currentSet: null,
      currentGame: null,
      isMatchTiebreakSet: false,
      matchWinnerSlot: null,
      totalPoints: a + b,
    },
  } as unknown as MatchDTO;
}

// --- a mixed event: every pair is one player from each group ------------------

const A = ["Ana", "Bea", "Cara", "Dee"].map((n, i) => p(`a${i}`, n, 1));
const B = ["Ivan", "Jon", "Kai", "Leo"].map((n, i) => p(`b${i}`, n, 2));
const mixed = [
  m({ id: "m1", s1: [A[0], B[0]], s2: [A[1], B[1]], score: [16, 9] }),
  m({ id: "m2", s1: [A[2], B[2]], s2: [A[3], B[3]], score: [16, 9] }),
];

const mixedTables = standingsTables(mixed, "mixed-americano");
check("a mixed americano is two tables", mixedTables.length === 2, mixedTables.map((t) => t.label).join(" / "));
check("...one per group, nobody in both", mixedTables[0].rows.every((r) => !mixedTables[1].rows.some((x) => x.id === r.id)));
check("...and everybody in one", mixedTables[0].rows.length + mixedTables[1].rows.length === 8);

for (const person of [...A, ...B]) {
  const mine = tableContaining(mixed, person.id, "mixed-americano");
  const board = mixedTables.find((t) => t.rows.some((r) => r.id === person.id))!;
  const samePeople = mine.rows.length === board.rows.length && mine.rows.every((r, i) => r.id === board.rows[i].id);
  if (!samePeople) check(`${person.name} is ranked in the table the board shows them in`, false);
}
check("every player's card table is the board's table", true);

const ivan = tableContaining(mixed, "b0", "mixed-americano");
check("a mixed player is ranked out of their group, not the field", ivan.rows.length === 4, `${ivan.rows.length} rows`);
check("...and the card can name the group", ivan.label !== null, String(ivan.label));

// Without the format there is nothing to split on, which is exactly the old bug.
const blind = tableContaining(mixed, "b0", undefined);
check("the old behaviour really was one merged table", blind.rows.length === 8);

// --- the formats that must NOT be split by team ------------------------------
// `team` is set for these too; only `isGroupRanked` may split on it.

for (const format of ["mixicano", "americano", "mexicano"]) {
  const t = standingsTables(mixed, format);
  check(`${format} stays one table`, t.length === 1 && t[0].rows.length === 8, `${t.length} table(s)`);
}

// --- a team format ranks the sides, and a person in the scorers beside them ---

const T1 = ["Ana", "Bea"].map((n, i) => p(`t1${i}`, n, 1));
const T2 = ["Ivan", "Jon"].map((n, i) => p(`t2${i}`, n, 2));
const teamEvent = [m({ id: "t1", s1: T1, s2: T2, score: [16, 9] })];
const teamTables = standingsTables(teamEvent, "team-americano");
check("a team format shows the teams and the scorers", teamTables.length === 2 && teamTables[0].label === "Teams");
const ana = tableContaining(teamEvent, "t10", "team-americano");
check("a person in a team format is ranked among the people", ana.label === "Players", String(ana.label));

// --- two groups feeding semifinals -------------------------------------------

const GA = ["Alpha", "Bravo"].map((n, i) => p(`ga${i}`, n));
const GB = ["Charlie", "Delta"].map((n, i) => p(`gb${i}`, n));
const twoGroup = [
  m({ id: "g1", bracket: "GA", s1: [GA[0]], s2: [GA[1]], score: [6, 3] }),
  m({ id: "g2", bracket: "GB", s1: [GB[0]], s2: [GB[1]], score: [6, 3] }),
];
const tg = tableContaining(twoGroup, "ga0", "two-group");
check("a two-group entrant is still ranked in their own group", tg.rows.length === 2 && tg.label === "Group A", String(tg.label));

// --- somebody the tables do not know -----------------------------------------

const stranger = tableContaining(mixed, "nobody", "mixed-americano");
check("an unknown id falls back to the whole field rather than throwing", stranger.rows.length === 8);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
