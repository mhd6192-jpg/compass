// Team americano end to end against the real database: teams stored on the
// players, partners drawn from your own side, points landing on the team total,
// and the podium awarding teams rather than people.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkTeamAmericanoFlow.ts
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

// Team A first, then team B — that is how the format reads the entry list.
const PLAYERS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const ROUNDS = 3;
const TARGET = 16;

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; amRounds: number };
  };
}

/** Side 1 (always team A) wins by TARGET-`loserPts` when `side1Wins`. */
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
    format: "team-americano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is team-americano", s.tournament.format === "team-americano");

  // --- teams are on the players --------------------------------------------
  const roster = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  check("the first half is team 1", roster.slice(0, 4).every((p) => p.team === 1), roster.slice(0, 4).map((p) => `${p.name}:${p.team}`).join(","));
  check("the second half is team 2", roster.slice(4).every((p) => p.team === 2), roster.slice(4).map((p) => `${p.name}:${p.team}`).join(","));

  const am = s.matches.filter((m) => m.bracket === "AM");
  check("whole schedule seeded up front", am.length === ROUNDS * 2, `${am.length}`);
  check("only round 1 is playable", am.filter((m) => m.status !== "pending").every((m) => m.round === 1));

  // --- every match is one side against the other ---------------------------
  const badSides = am.filter((m) => {
    const t1 = new Set((m.player1Members ?? []).map((p) => p.team));
    const t2 = new Set((m.player2Members ?? []).map((p) => p.team));
    return t1.size !== 1 || t2.size !== 1 || [...t1][0] === [...t2][0];
  });
  check("partners share a team, opponents never do", badSides.length === 0, `${badSides.length} bad`);
  check("team A is always side 1", am.every((m) => (m.player1Members ?? []).every((p) => p.team === 1)));
  check("the DTO carries the team", (am[0].player1Members ?? []).every((p) => p.team === 1));

  // --- play it out ---------------------------------------------------------
  // Team A takes both matches in round 1, they split round 2, team B takes
  // round 3 — so the totals are decided by points, not just by wins.
  const plan: Array<[boolean, boolean]> = [
    [true, true],
    [true, false],
    [false, false],
  ];
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = [...s.matches.filter((m) => m.bracket === "AM" && m.round === round)].sort((a, b) => a.posIndex - b.posIndex);
    check(`round ${round}: both matches open`, live.length === 2 && live.every((m) => m.status !== "pending"), `${live.length}`);
    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: the whole field is on court`, new Set(people).size === PLAYERS.length);
    for (const [i, m] of live.entries()) await playMatch(m.id, plan[round - 1][i], 5 + i * 3);
  }

  s = await snap();
  check("every match played", s.matches.filter((m) => m.status === "completed").length === ROUNDS * 2);

  // --- the table that decides it -------------------------------------------
  const teams = computeTeamStandings(s.matches);
  check("two team rows", teams.length === 2, teams.map((t) => `${t.name}:${t.pointsFor}`).join(" "));
  check("teams are named", teams.some((t) => t.name === "Team A") && teams.some((t) => t.name === "Team B"));

  const players = computeStandings(s.matches);
  const teamAPlayers = players.filter((r) => r.name.startsWith("A"));
  const teamATotal = teamAPlayers.reduce((a, r) => a + r.pointsFor, 0);
  const rowA = teams.find((t) => t.name === "Team A")!;
  // Two players per side, so a team's total is twice the points its sides won.
  check(
    "the team total is its players' points",
    teamATotal === rowA.pointsFor * 2,
    `players ${teamATotal} vs team ${rowA.pointsFor} x2`
  );

  const matchesPlayed = ROUNDS * 2;
  check(
    "team wins and losses account for every match",
    teams[0].won + teams[1].won === matchesPlayed && teams[0].played === matchesPlayed,
    `${teams[0].won}+${teams[1].won} of ${matchesPlayed}`
  );
  check("ranked on points, highest first", teams[0].pointsFor >= teams[1].pointsFor);

  // --- the podium awards teams ---------------------------------------------
  const podium = computePodium(s.matches, "team-americano");
  check("podium is the two teams", podium.length === 2, podium.map((a) => a.name).join(","));
  check("podium winner matches the table", podium[0].name === teams[0].name, `${podium[0].name} vs ${teams[0].name}`);
  check("podium detail quotes points", (podium[0].detail ?? "").includes("points"), podium[0]?.detail);
  check(
    "no individual is crowned",
    !podium.some((a) => PLAYERS.includes(a.name)),
    podium.map((a) => a.name).join(",")
  );

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
