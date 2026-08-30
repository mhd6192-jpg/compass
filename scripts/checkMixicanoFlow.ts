// Mixicano end to end against the real database: groups stored on the players,
// every pair drawn across the divide, partners rotating without repeats, and
// scoring staying individual (no team table, no team podium).
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkMixicanoFlow.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { computeStandings, computeTeamStandings } from "../src/lib/standings";
import { computePodium } from "../src/lib/v2/podium";
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

// Group A first, then group B — that is how the format reads the entry list.
const PLAYERS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const ROUNDS = 4; // groups of four → four rounds before anyone repeats
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
    format: "mixicano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is mixicano", s.tournament.format === "mixicano");

  const roster = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  check("the first half is group 1", roster.slice(0, 4).every((p) => p.team === 1), roster.slice(0, 4).map((p) => `${p.name}:${p.team}`).join(","));
  check("the second half is group 2", roster.slice(4).every((p) => p.team === 2));

  const am = s.matches.filter((m) => m.bracket === "AM");
  check("whole schedule seeded up front", am.length === ROUNDS * 2, `${am.length}`);
  check("only round 1 is playable", am.filter((m) => m.status !== "pending").every((m) => m.round === 1));

  // --- the defining rule: every side is one from each group ----------------
  const badSides = am.filter((m) =>
    [m.player1Members ?? [], m.player2Members ?? []].some((side) => side.length !== 2 || side[0].team === side[1].team)
  );
  check("every pair is one player from each group", badSides.length === 0, `${badSides.length} bad`);
  check(
    "group A is listed first on each side",
    am.every((m) => [m.player1Members ?? [], m.player2Members ?? []].every((side) => side[0].team === 1))
  );

  // --- partners rotate across the divide, without repeats ------------------
  const partnerships = new Set<string>();
  let repeats = 0;
  for (const m of am) {
    for (const side of [m.player1Members ?? [], m.player2Members ?? []]) {
      const key = side.map((p) => p.id).sort().join("+");
      if (partnerships.has(key)) repeats++;
      partnerships.add(key);
    }
  }
  check("nobody repeats a partner over the run", repeats === 0, `${repeats} repeats`);
  check("every cross-group pairing is used once", partnerships.size === ROUNDS * 2 * 2, `${partnerships.size}`);

  // --- play it out ---------------------------------------------------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = [...s.matches.filter((m) => m.bracket === "AM" && m.round === round)].sort((a, b) => a.posIndex - b.posIndex);
    check(`round ${round}: both matches open`, live.length === 2 && live.every((m) => m.status !== "pending"), `${live.length}`);
    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: the whole field is on court`, new Set(people).size === PLAYERS.length);
    for (const [i, m] of live.entries()) await playMatch(m.id, (round + i) % 2 === 0, 4 + i * 3);
  }

  s = await snap();
  check("every match played", s.matches.filter((m) => m.status === "completed").length === ROUNDS * 2);

  // --- scoring stays individual --------------------------------------------
  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length, `${table.length}`);
  check("every row is a real player", table.every((r) => PLAYERS.includes(r.name)));
  check("everyone played every round", table.every((r) => r.played === ROUNDS), table.map((r) => r.played).join(","));
  check("ranked on points, highest first", table.every((r, i) => i === 0 || table[i - 1].pointsFor >= r.pointsFor));

  // A mixicano has groups but no teams: both sides of every net contain a
  // group-1 player, so there is no team fixture to tabulate.
  check("no team table is produced", computeTeamStandings(s.matches).length === 0);

  const podium = computePodium(s.matches, "mixicano");
  check("podium is individuals", podium.length > 0 && PLAYERS.includes(podium[0].name), podium[0]?.name);
  check("podium leader matches the table", podium[0].playerId === table[0].id);
  check("podium detail quotes points", (podium[0].detail ?? "").includes("points"), podium[0]?.detail);

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
