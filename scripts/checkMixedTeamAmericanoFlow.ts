// Mixed team americano end to end against the real database: both divisions
// stored on the players, partners always from the other half of your OWN team,
// opponents always the other team, and points landing on the team total.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkMixedTeamAmericanoFlow.ts
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

// Quarters: team A half 1, team A half 2, team B half 1, team B half 2.
const PLAYERS = ["A1a", "A1b", "A2a", "A2b", "B1a", "B1b", "B2a", "B2b"];
const ROUNDS = 2; // halves of two → two rounds before a partner repeats
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
    format: "mixed-team-americano",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is mixed-team-americano", s.tournament.format === "mixed-team-americano");

  // --- both divisions are stored -------------------------------------------
  const roster = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  const label = (p: { team: number; pairGroup: number }) => `${p.team}/${p.pairGroup}`;
  check(
    "the entry list is read in quarters",
    roster.map(label).join(" ") === "1/1 1/1 1/2 1/2 2/1 2/1 2/2 2/2",
    roster.map((p) => `${p.name}:${label(p)}`).join(" ")
  );

  const am = s.matches.filter((m) => m.bracket === "AM");
  check("whole schedule seeded up front", am.length === ROUNDS * 2, `${am.length}`);

  // --- the defining rules ---------------------------------------------------
  const badPartners = am.filter((m) =>
    [m.player1Members ?? [], m.player2Members ?? []].some(
      (side) => side.length !== 2 || side[0].team !== side[1].team || side[0].pairGroup === side[1].pairGroup
    )
  );
  check("partners share a team but cross its halves", badPartners.length === 0, `${badPartners.length} bad`);

  const badOpponents = am.filter(
    (m) => (m.player1Members ?? [])[0]?.team === (m.player2Members ?? [])[0]?.team
  );
  check("opponents are always the other team", badOpponents.length === 0, `${badOpponents.length} bad`);
  check("team A is always side 1", am.every((m) => (m.player1Members ?? []).every((p) => p.team === 1)));

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
  const plan: Array<[boolean, boolean]> = [
    [true, false],
    [true, true],
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

  const players = computeStandings(s.matches);
  const teamATotal = players.filter((r) => r.name.startsWith("A")).reduce((a, r) => a + r.pointsFor, 0);
  const rowA = teams.find((t) => t.name === "Team A")!;
  check("the team total is its players' points", teamATotal === rowA.pointsFor * 2, `players ${teamATotal} vs team ${rowA.pointsFor} x2`);
  check(
    "team wins and losses account for every match",
    teams[0].won + teams[1].won === ROUNDS * 2,
    `${teams[0].won}+${teams[1].won}`
  );

  const podium = computePodium(s.matches, "mixed-team-americano");
  check("podium is the two teams", podium.length === 2, podium.map((a) => a.name).join(","));
  check("no individual is crowned", !podium.some((a) => PLAYERS.includes(a.name)), podium.map((a) => a.name).join(","));

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
