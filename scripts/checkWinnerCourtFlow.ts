// Winner court end to end against the real database: one match at a time, the
// winning pair holding the court, losers going to the back of the queue, and
// undo taking back a match the queue was derived from.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkWinnerCourtFlow.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint, undoLastPoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
import { participantIds, type MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

/**
 * RESTART `npm run dev:db` BEFORE EACH RUN of this script.
 *
 * PGlite serves every connection from one shared session, and a run of this
 * size leaves that session unusable: the next connection is closed immediately
 * with "Server has closed the connection". Restarting the database process is
 * the fix; the data in `.pglite-dev/` is untouched by it.
 */
async function finish() {
  await prisma.$disconnect();
}

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PLAYERS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const ROUNDS = 8;
const TARGET = 16;

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; amRounds: number };
  };
}

async function playMatch(id: string, side1Wins: boolean) {
  const winner = side1Wins ? 1 : 2;
  const loser = side1Wins ? 2 : 1;
  for (let i = 0; i < 4; i++) await scorePoint(prisma, id, loser);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, winner);
    if (r.completed) return;
  }
}

const namesOf = (side: { name: string }[] | null) => (side ?? []).map((p) => p.name);

async function main() {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, PLAYERS, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    serveEvery: 4,
    amRounds: ROUNDS,
    pin: "1234",
    format: "winner-court",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is winner-court", s.tournament.format === "winner-court");

  let am = s.matches.filter((m) => m.bracket === "AM");
  check("only the opening match exists", am.length === 1 && am[0].round === 1, `${am.length}`);
  check(
    "the first four open the court",
    JSON.stringify([...namesOf(am[0].player1Members), ...namesOf(am[0].player2Members)]) ===
      JSON.stringify(["P1", "P2", "P3", "P4"]),
    JSON.stringify([...namesOf(am[0].player1Members), ...namesOf(am[0].player2Members)])
  );
  check("one match at a time uses one court", s.matches.filter((m) => m.courtId !== null).length === 1);

  // --- the holders hold ----------------------------------------------------
  // P1 & P2 win the first three, so they should still be on for round 4 while
  // the challengers cycle through the queue.
  const expectedChallengers = [
    ["P3", "P4"], // round 1
    ["P5", "P6"], // round 2
    ["P7", "P8"], // round 3
    ["P3", "P4"], // round 4 — the first losers have come back round
  ];
  for (let round = 1; round <= 4; round++) {
    s = await snap();
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`round ${round}: exactly one match`, live.length === 1, `${live.length}`);
    const m = live[0];
    check(`round ${round}: P1 & P2 are still holding`, JSON.stringify(namesOf(m.player1Members)) === JSON.stringify(["P1", "P2"]), JSON.stringify(namesOf(m.player1Members)));
    check(
      `round ${round}: challengers are ${expectedChallengers[round - 1].join(" & ")}`,
      JSON.stringify(namesOf(m.player2Members)) === JSON.stringify(expectedChallengers[round - 1]),
      JSON.stringify(namesOf(m.player2Members))
    );
    check(`round ${round}: four on court, all different`, new Set(participantIds(m)).size === 4);
    await playMatch(m.id, true); // side 1 (the holders) wins
  }

  // --- losing the court ----------------------------------------------------
  s = await snap();
  const r5 = s.matches.find((m) => m.bracket === "AM" && m.round === 5)!;
  check("round 5: the unbeaten pair is still on", JSON.stringify(namesOf(r5.player1Members)) === JSON.stringify(["P1", "P2"]));
  await playMatch(r5.id, false); // the challengers win this one

  s = await snap();
  const r6 = s.matches.find((m) => m.bracket === "AM" && m.round === 6)!;
  const newHolders = namesOf(r6.player1Members);
  check("round 6: the pair that just won now holds the court", JSON.stringify(newHolders) === JSON.stringify(namesOf(r5.player2Members)), `${newHolders.join(" & ")}`);
  check(
    "round 6: the beaten holders are not on court",
    !participantIds(r6).some((id) => (r5.player1Members ?? []).some((p) => p.id === id)),
    namesOf(r6.player2Members).join(" & ")
  );

  // --- the field keeps turning over ---------------------------------------
  for (let round = 6; round <= ROUNDS; round++) {
    s = await snap();
    const live = s.matches.find((m) => m.bracket === "AM" && m.round === round);
    if (!live) break;
    await playMatch(live.id, round % 2 === 0);
  }

  s = await snap();
  am = s.matches.filter((m) => m.bracket === "AM");
  check("stops at the configured number of matches", am.length === ROUNDS, `${am.length}`);
  check("every match played", am.every((m) => m.status === "completed"));

  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length, `${table.length}`);
  check("everyone got on court", table.every((r) => r.played > 0), table.map((r) => `${r.name}:${r.played}`).join(","));
  check("ranked on points, highest first", table.every((r, i) => i === 0 || table[i - 1].pointsFor >= r.pointsFor));

  // --- undo ----------------------------------------------------------------
  const last = am.find((m) => m.round === ROUNDS)!;
  await undoLastPoint(prisma, last.id);
  s = await snap();
  check("undo reopens the match", s.matches.find((m) => m.id === last.id)!.status !== "completed");

  const earlier = s.matches.find((m) => m.bracket === "AM" && m.round === ROUNDS - 1)!;
  let threw = "";
  try {
    await undoLastPoint(prisma, earlier.id);
  } catch (e) {
    threw = e instanceof Error ? e.message : "?";
  }
  check("undo refuses while a later match is under way", threw.includes("later round"), threw || "(did not throw)");

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
