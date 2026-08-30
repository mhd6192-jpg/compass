// Mixed americano end to end against the real database: the plain americano
// rotation over the whole field (partners are NOT constrained to cross the
// groups — that is the mixicano), with the two groups ranked separately.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkMixedAmericanoFlow.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
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

const PLAYERS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const ROUNDS = 5;
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
    format: "mixed-americano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is mixed-americano", s.tournament.format === "mixed-americano");

  const roster = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  check("the first half is group 1", roster.slice(0, 4).every((p) => p.team === 1));
  check("the second half is group 2", roster.slice(4).every((p) => p.team === 2));

  const am = s.matches.filter((m) => m.bracket === "AM");
  check("whole schedule seeded up front", am.length === ROUNDS * 2, `${am.length}`);
  check("only round 1 is playable", am.filter((m) => m.status !== "pending").every((m) => m.round === 1));

  // --- the defining difference from a mixicano ------------------------------
  // Partners are drawn from the whole field, so same-group pairs must occur.
  const sameGroupPairs = am.filter((m) =>
    [m.player1Members ?? [], m.player2Members ?? []].some((side) => side.length === 2 && side[0].team === side[1].team)
  );
  check(
    "partners are NOT constrained to cross the groups",
    sameGroupPairs.length > 0,
    `${sameGroupPairs.length} of ${am.length * 2} sides share a group`
  );

  // ...and it is still a proper americano rotation.
  const partnerships = new Set<string>();
  let repeats = 0;
  for (const m of am) {
    for (const side of [m.player1Members ?? [], m.player2Members ?? []]) {
      const key = side.map((p) => p.id).sort().join("+");
      if (partnerships.has(key)) repeats++;
      partnerships.add(key);
    }
  }
  check("nobody repeats a partner", repeats === 0, `${repeats} repeats`);

  // --- play it out ----------------------------------------------------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`round ${round}: both matches open`, live.length === 2 && live.every((m) => m.status !== "pending"), `${live.length}`);
    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: the whole field is on court`, new Set(people).size === PLAYERS.length);
    for (const [i, m] of live.entries()) await playMatch(m.id, (round + i) % 2 === 0, 3 + i * 4);
  }

  s = await snap();
  check("every match played", s.matches.filter((m) => m.status === "completed").length === ROUNDS * 2);

  // --- the two group tables -------------------------------------------------
  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length, `${table.length}`);
  check("everyone played every round", table.every((r) => r.played === ROUNDS), table.map((r) => r.played).join(","));

  const groupOf = new Map<string, number>();
  for (const m of s.matches) {
    for (const p of [...(m.player1Members ?? []), ...(m.player2Members ?? [])]) if (p.team) groupOf.set(p.id, p.team);
  }
  const groupA = table.filter((r) => groupOf.get(r.id) === 1);
  const groupB = table.filter((r) => groupOf.get(r.id) === 2);
  check("group A has its own table", groupA.length === 4, `${groupA.length}`);
  check("group B has its own table", groupB.length === 4, `${groupB.length}`);
  check("each group table is ranked on points", groupA.every((r, i) => i === 0 || groupA[i - 1].pointsFor >= r.pointsFor));
  check(
    "each group has its own winner",
    groupA[0] && groupB[0] && groupA[0].id !== groupB[0].id,
    `${groupA[0]?.name} / ${groupB[0]?.name}`
  );

  // --- the podium names the group ------------------------------------------
  const podium = computePodium(s.matches, "mixed-americano");
  check("podium is individuals", podium.length > 0 && PLAYERS.includes(podium[0].name), podium[0]?.name);
  check("podium names the winner's group", (podium[0].detail ?? "").includes("Group "), podium[0]?.detail);

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
