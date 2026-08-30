// End-to-end americano against the real database: seeding, round gating,
// four-player court booking, individual standings, the podium, and undo.
// Point it at the LOCAL dev database (npm run dev:db), never production:
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkAmericanoFlow.ts
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint, undoLastPoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
import { computePodium } from "../src/lib/v2/podium";
import { participantIds } from "../src/lib/types";
import type { MatchDTO } from "../src/lib/types";

// One connection: PGlite runs a single session behind the socket, so letting
// Prisma open a pool against it just produces dropped connections.
const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PLAYERS = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];
const ROUNDS = 5;
const TARGET = 16;

/** Side 1 wins TARGET-`loserPts`; the loser's points go in first so the race ends on side 1's tap. */
async function playMatch(id: string, loserPts: number) {
  for (let i = 0; i < Math.min(loserPts, TARGET - 1); i++) await scorePoint(prisma, id, 2);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, 1);
    if (r.completed) return;
  }
}

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[]; tournament: { format: string; amRounds: number } };
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
    format: "americano",
    courtIds: [2, 3],
  });

  let s = await snap();
  const am = s.matches.filter((m) => m.bracket === "AM");
  check("format is americano", s.tournament.format === "americano");
  check("rounds stored", s.tournament.amRounds === ROUNDS, String(s.tournament.amRounds));
  check("match count = rounds x 2", am.length === ROUNDS * 2, `${am.length}`);

  // --- sides are pairs of individuals -------------------------------------
  const first = am[0];
  check("side is shown as a pairing", (first.player1?.name ?? "").includes(" & "), first.player1?.name);
  check("members carry the individuals", first.player1Members?.length === 2 && first.player2Members?.length === 2);
  check("four distinct people in a match", new Set(participantIds(first)).size === 4);

  // --- only round 1 is open ------------------------------------------------
  const open = am.filter((m) => m.status !== "pending");
  check("only round 1 is playable at the start", open.every((m) => m.round === 1) && open.length === 2, `${open.length} open`);
  const onCourt = am.filter((m) => m.courtId !== null);
  check("both round-1 matches get a court", onCourt.length === 2, `${onCourt.length}`);
  const courtPeople = onCourt.flatMap((m) => participantIds(m));
  check("nobody is double-booked across courts", new Set(courtPeople).size === courtPeople.length);

  // --- play the whole thing ------------------------------------------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`round ${round}: opened when its turn came`, live.every((m) => m.status !== "pending"));
    // Vary the losing score so the points table has something to rank on.
    for (const [i, m] of live.entries()) await playMatch(m.id, (round * 3 + i * 5) % 15);
  }

  s = await snap();
  const done = s.matches.filter((m) => m.status === "completed");
  check("every match played", done.length === ROUNDS * 2, `${done.length}/${ROUNDS * 2}`);

  // --- individual standings ------------------------------------------------
  const table = computeStandings(s.matches);
  check("standings list individuals, not sides", table.length === PLAYERS.length, `${table.length} rows`);
  check("every row is a real player name", table.every((r) => PLAYERS.includes(r.name)), table.map((r) => r.name).join(","));
  const totalPointsFor = table.reduce((a, r) => a + r.pointsFor, 0);
  // Each match awards TARGET to two winners and the loser total to two losers.
  const expected = done.reduce((acc, m) => {
    const tb = m.state.completedSets[0]?.tiebreak ?? [0, 0];
    return acc + (tb[0] + tb[1]) * 2;
  }, 0);
  check("points credited to all four players", totalPointsFor === expected, `${totalPointsFor} vs ${expected}`);
  check("ranked by points, highest first", table.every((r, i) => i === 0 || table[i - 1].pointsFor >= r.pointsFor));
  const played = table.map((r) => r.played);
  check("everyone played the same number of matches", Math.max(...played) - Math.min(...played) <= 1, played.join(","));

  // --- podium --------------------------------------------------------------
  const podium = computePodium(s.matches, "americano");
  check("podium is individuals", podium.length > 0 && PLAYERS.includes(podium[0].name), podium[0]?.name);
  check("podium leader matches the table", podium[0].playerId === table[0].id);
  check("podium detail quotes points", (podium[0].detail ?? "").includes("points"), podium[0]?.detail);

  // --- undo rolls the round gate back -------------------------------------
  const last = [...done].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
  await undoLastPoint(prisma, last.id);
  s = await snap();
  const reopened = s.matches.find((m) => m.id === last.id)!;
  check("undo reopens the match", reopened.status !== "completed", reopened.status);
  check("undo puts the player back in the table", computeStandings(s.matches).length === PLAYERS.length);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
