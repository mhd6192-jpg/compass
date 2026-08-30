// Mixed mexicano end to end against the real database: groups stored on the
// players, every pair crossing the divide, and each round redrawn from the two
// group tables rather than one merged list.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkMixedMexicanoFlow.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
import { pairAcrossRanked } from "../src/lib/bracket/mixedMexicano";
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

const PLAYERS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const ROUNDS = 4;
const TARGET = 16;

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; amRounds: number };
  };
}

async function playMatch(id: string, side1Wins: boolean, loserPts: number) {
  const winner = side1Wins ? 1 : 2;
  const loser = side1Wins ? 2 : 1;
  for (let i = 0; i < Math.min(loserPts, TARGET - 1); i++) await scorePoint(prisma, id, loser);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, winner);
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
    format: "mixed-mexicano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is mixed-mexicano", s.tournament.format === "mixed-mexicano");

  const roster = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  check("the first half is group 1", roster.slice(0, 4).every((p) => p.team === 1));
  check("the second half is group 2", roster.slice(4).every((p) => p.team === 2));

  let am = s.matches.filter((m) => m.bracket === "AM");
  check("only round 1 is created up front", am.length === 2 && am.every((m) => m.round === 1), `${am.length}`);

  const r1 = [...am].sort((a, b) => a.posIndex - b.posIndex);
  const names = (side: { name: string }[] | null) => (side ?? []).map((p) => p.name);
  check(
    "top court: A's best with B's second, against A's second with B's best",
    JSON.stringify(names(r1[0].player1Members)) === JSON.stringify(["A1", "B2"]) &&
      JSON.stringify(names(r1[0].player2Members)) === JSON.stringify(["A2", "B1"]),
    `${names(r1[0].player1Members)} v ${names(r1[0].player2Members)}`
  );

  // --- play, checking the redraw follows the two group tables --------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = [...s.matches.filter((m) => m.bracket === "AM" && m.round === round)].sort((a, b) => a.posIndex - b.posIndex);
    check(`round ${round}: a match on every court`, live.length === 2, `${live.length}`);

    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: the whole field is on court`, new Set(people).size === PLAYERS.length);

    const badSides = live.filter((m) =>
      [m.player1Members ?? [], m.player2Members ?? []].some((side) => side.length !== 2 || side[0].team === side[1].team)
    );
    check(`round ${round}: every pair crosses the groups`, badSides.length === 0, `${badSides.length} bad`);

    if (round > 1) {
      // Rebuild the expectation from the tables as they stood before this round.
      const before = computeStandings(s.matches.filter((m) => m.bracket === "AM" && m.round < round));
      const rank = (g: number) =>
        before
          .filter((r) =>
            s.matches.some((m) =>
              [...(m.player1Members ?? []), ...(m.player2Members ?? [])].some((p) => p.id === r.id && p.team === g)
            )
          )
          .map((r) => r.id);
      const expected = pairAcrossRanked(rank(1), rank(2)).map((p) => [...p.team1, ...p.team2]);
      const actual = live.map((m) => [
        ...(m.player1Members ?? []).map((p) => p.id),
        ...(m.player2Members ?? []).map((p) => p.id),
      ]);
      check(`round ${round}: drawn from the two group tables`, JSON.stringify(expected) === JSON.stringify(actual));
    }

    for (const [i, m] of live.entries()) await playMatch(m.id, (round + i) % 2 === 0, 4 + i * 3);
  }

  s = await snap();
  am = s.matches.filter((m) => m.bracket === "AM");
  check("stops at the configured number of rounds", am.length === ROUNDS * 2, `${am.length}`);

  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length, `${table.length}`);
  check("everyone played every round", table.every((r) => r.played === ROUNDS), table.map((r) => r.played).join(","));

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
