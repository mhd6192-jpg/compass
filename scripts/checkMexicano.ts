// Mexicano end to end against the real database: round 1 off the entry order,
// every later round drawn from the live standings (leader partners 4th), byes
// rotating, and undo removing a round that a changed table no longer justifies.
// Point it at the LOCAL dev database (npm run dev:db), never production:
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkMexicano.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint, undoLastPoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
import { pairByRank } from "../src/lib/bracket/mexicano";
import { participantIds, type MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

/**
 * RESTART `npm run dev:db` BEFORE EACH RUN of this script.
 *
 * PGlite serves every connection from one shared session, and a run of this
 * size leaves that session unusable: the next connection is closed immediately
 * with "Server has closed the connection". It is not a connection leak (raising
 * the server's limit changes nothing) and not the exit path (disconnecting
 * cleanly and letting node exit on its own changes nothing either) — the WASM
 * session simply does not survive being hammered and then handed to a new
 * client. Restarting the database process is the fix; the data in
 * `.pglite-dev/` is untouched by it.
 */
async function finish() {
  await prisma.$disconnect();
}

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PLAYERS = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];
const ROUNDS = 4;
const TARGET = 16;

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; amRounds: number };
  };
}

/** Side 1 wins TARGET-`loserPts`. */
async function playMatch(id: string, loserPts: number) {
  for (let i = 0; i < Math.min(loserPts, TARGET - 1); i++) await scorePoint(prisma, id, 2);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, 1);
    if (r.completed) return;
  }
}

async function main() {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, PLAYERS, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    serveEvery: 4,
    amRounds: ROUNDS,
    pin: "1234",
    format: "mexicano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is mexicano", s.tournament.format === "mexicano");

  // --- only round 1 exists at the start ------------------------------------
  let am = s.matches.filter((m) => m.bracket === "AM");
  check("only round 1 is created up front", am.length === 2 && am.every((m) => m.round === 1), `${am.length} matches`);
  check("round 1 is playable", am.every((m) => m.status !== "pending"));

  // Round 1 pairs off the entry order: 1&4 v 2&3, 5&8 v 6&7.
  const r1 = [...am].sort((a, b) => a.posIndex - b.posIndex);
  const names1 = r1.map((m) => [
    ...(m.player1Members ?? []).map((p) => p.name),
    ...(m.player2Members ?? []).map((p) => p.name),
  ]);
  check("round 1 top group is 1&4 v 2&3", JSON.stringify(names1[0]) === JSON.stringify(["Ana", "Dan", "Ben", "Cara"]), JSON.stringify(names1[0]));
  check("round 1 second group is 5&8 v 6&7", JSON.stringify(names1[1]) === JSON.stringify(["Eve", "Hugo", "Finn", "Gia"]), JSON.stringify(names1[1]));

  // --- each later round is drawn from the standings ------------------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`round ${round}: exists and is playable`, live.length === 2 && live.every((m) => m.status !== "pending"), `${live.length}`);

    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: nobody is in two matches`, new Set(people).size === people.length);

    // The table as it stands BEFORE this round is what should have drawn it.
    if (round > 1) {
      const before = computeStandings(s.matches.filter((m) => m.bracket === "AM" && m.round < round));
      const ranked = before.map((r) => r.id);
      const expected = pairByRank(ranked.length).map((p) => [
        ranked[p.team1[0]],
        ranked[p.team1[1]],
        ranked[p.team2[0]],
        ranked[p.team2[1]],
      ]);
      const actual = [...live]
        .sort((a, b) => a.posIndex - b.posIndex)
        .map((m) => [
          ...(m.player1Members ?? []).map((p) => p.id),
          ...(m.player2Members ?? []).map((p) => p.id),
        ]);
      check(`round ${round}: drawn from the standings (leader partners 4th)`, JSON.stringify(expected) === JSON.stringify(actual));

      // And the top court really is the top four.
      const topFour = new Set(ranked.slice(0, 4));
      const onTop = new Set(actual[0]);
      check(`round ${round}: top four meet on the first court`, [...topFour].every((id) => onTop.has(id)));
    }

    for (const [i, m] of live.entries()) await playMatch(m.id, (round * 3 + i * 5) % 14);
  }

  s = await snap();
  const all = s.matches.filter((m) => m.bracket === "AM");
  check("stops at the configured number of rounds", Math.max(...all.map((m) => m.round)) === ROUNDS, `${Math.max(...all.map((m) => m.round))}`);
  check("no round was generated past the end", all.length === ROUNDS * 2, `${all.length}`);

  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length);
  check("everyone played every round", table.every((r) => r.played === ROUNDS), table.map((r) => r.played).join(","));

  // --- undo takes back a round the table no longer justifies ---------------
  const lastRound = all.filter((m) => m.round === ROUNDS);
  const target = lastRound[0];
  await undoLastPoint(prisma, target.id);
  s = await snap();
  check("undo reopens the match", s.matches.find((m) => m.id === target.id)!.status !== "completed");

  // Now undo into round 3, which must delete the derived round 4.
  const r3 = s.matches.filter((m) => m.bracket === "AM" && m.round === ROUNDS - 1);
  let threw = "";
  try {
    await undoLastPoint(prisma, r3[0].id);
  } catch (e) {
    threw = e instanceof Error ? e.message : "?";
  }
  check("undo refuses while a later round is under way", threw.includes("later round"), threw || "(did not throw)");

  // --- a field that does not divide by four --------------------------------
  // The byes must go round the group; resting the bottom of the table every
  // round would mean the people having the worst night also play the least.
  const TEN = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } });
  await seedTournament(prisma, TEN, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    serveEvery: 4,
    amRounds: 5,
    pin: "1234",
    format: "mexicano",
    courtIds: [2, 3],
  });
  for (let round = 1; round <= 5; round++) {
    const cur = (await snap()).matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`10 players, round ${round}: two matches, two sitting`, cur.length === 2, `${cur.length}`);
    for (const [i, m] of cur.entries()) await playMatch(m.id, (round * 2 + i * 7) % 14);
  }
  const tenTable = computeStandings((await snap()).matches);
  const playedCounts = tenTable.map((r) => r.played);
  check(
    "10 players: byes shared out (matches within one of each other)",
    Math.max(...playedCounts) - Math.min(...playedCounts) <= 1,
    playedCounts.join(",")
  );

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
