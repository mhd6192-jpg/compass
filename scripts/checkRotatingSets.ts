// A rotating format played with SETS AND GAMES rather than a points race.
//
// The setup screen tells organisers this works, so it needs to be true end to
// end and not merely un-rejected: the rounds still gate, the standings still
// rank individuals, the four players in a match all get credited, and the score
// line reads as a set score. Uses an americano (schedule drawn up front) and a
// mexicano (rounds derived from the table), since those exercise both paths.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { computeStandings } from "../src/lib/standings";
import { formatMatchScoreLine } from "../src/lib/scoring/format";
import { serveInfo } from "../src/lib/scoring/serve";
import { participantIds, type MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PLAYERS = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; tiebreakMode: string; bestOfSets: number };
  };
}

/** Wins a 6-`lost` set for the given side, one game at a time. */
async function playSet(id: string, winner: 1 | 2, lost: number) {
  const loser = winner === 1 ? 2 : 1;
  for (let g = 0; g < lost; g++) for (let p = 0; p < 4; p++) await scorePoint(prisma, id, loser);
  for (let g = 0; g < 6; g++) {
    for (let p = 0; p < 4; p++) {
      const r = await scorePoint(prisma, id, winner);
      if (r.completed) return;
    }
  }
}

async function run(format: "americano" | "mexicano", rounds: number) {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, PLAYERS, {
    // The whole point: a set-based mode on a rotating format.
    bestOfSets: 1,
    tiebreakMode: "standard",
    amRounds: rounds,
    pin: "1234",
    format,
    courtIds: [2, 3],
  });

  let s = await snap();
  check(`${format}: stored as a set-based match`, s.tournament.tiebreakMode === "standard" && s.tournament.bestOfSets === 1, `${s.tournament.tiebreakMode}/${s.tournament.bestOfSets}`);

  const first = s.matches.find((m) => m.bracket === "AM")!;
  check(`${format}: sides are still pairs of individuals`, (first.player1Members ?? []).length === 2);
  check(`${format}: no serve indicator in set play`, serveInfo(first.state) === null);

  for (let round = 1; round <= rounds; round++) {
    s = await snap();
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    check(`${format} round ${round}: opened`, live.length === 2 && live.every((m) => m.status !== "pending"), `${live.length}`);
    const people = live.flatMap((m) => participantIds(m));
    check(`${format} round ${round}: four per match, nobody twice`, new Set(people).size === PLAYERS.length);
    for (const [i, m] of live.entries()) await playSet(m.id, i === 0 ? 1 : 2, i === 0 ? 4 : 2);
  }

  s = await snap();
  const done = s.matches.filter((m) => m.bracket === "AM" && m.status === "completed");
  check(`${format}: every match completed`, done.length === rounds * 2, `${done.length}/${rounds * 2}`);

  const sample = done[0];
  check(`${format}: recorded as a set, not a race`, sample.state.completedSets.length === 1 && !sample.state.completedSets[0].tiebreak, JSON.stringify(sample.state.completedSets[0]));
  const line = formatMatchScoreLine(sample);
  check(`${format}: score line reads as games`, /^\d+-\d+$/.test(line) && line !== "0-0", line);

  const table = computeStandings(s.matches);
  check(`${format}: standings list all individuals`, table.length === PLAYERS.length, `${table.length}`);
  check(`${format}: everyone played every round`, table.every((r) => r.played === rounds), table.map((r) => r.played).join(","));
  const credited = table.reduce((a, r) => a + r.pointsFor, 0);
  const expected = done.reduce((a, m) => a + (m.state.completedSets[0].games[0] + m.state.completedSets[0].games[1]) * 2, 0);
  check(`${format}: games credited to all four players in each match`, credited === expected, `${credited} vs ${expected}`);
  check(`${format}: someone actually won something`, table[0].won > 0, JSON.stringify(table[0]));
}

async function main() {
  await run("americano", 3);
  await run("mexicano", 3);
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
