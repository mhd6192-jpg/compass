// King of the court end to end against the real database: the opening ladder,
// winners climbing and losers dropping between rounds, the boundaries holding,
// round naming, and undo taking back a ladder it no longer justifies.
//
// RESTART `npm run dev:db` BEFORE EACH RUN — see the note on `finish()` below.
//   npm run dev:db   # in another terminal
//   npx tsx scripts/checkKingCourtFlow.ts
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

const PLAYERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]; // 12 = 3 courts
const ROUNDS = 4;
const TARGET = 16;

async function snap() {
  return (await getFullSnapshot(prisma)) as unknown as {
    matches: MatchDTO[];
    tournament: { format: string; amRounds: number };
  };
}

/** Plays a match out; `side1Wins` decides which side takes it. */
async function playMatch(id: string, side1Wins: boolean) {
  const winner = side1Wins ? 1 : 2;
  const loser = side1Wins ? 2 : 1;
  for (let i = 0; i < 5; i++) await scorePoint(prisma, id, loser);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, winner);
    if (r.completed) return;
  }
}

/** The four players on a rung, as ids, plus which pair won. */
function sidesOf(m: MatchDTO) {
  const s1 = (m.player1Members ?? []).map((p) => p.id);
  const s2 = (m.player2Members ?? []).map((p) => p.id);
  const side1Won = m.winnerId === m.player1?.id;
  return { s1, s2, winners: side1Won ? s1 : s2, losers: side1Won ? s2 : s1 };
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
    format: "king-court",
    courtIds: [2, 3],
  });

  let s = await snap();
  check("format is king-court", s.tournament.format === "king-court");

  let am = s.matches.filter((m) => m.bracket === "AM");
  check("one match per rung, round 1 only", am.length === 3 && am.every((m) => m.round === 1), `${am.length}`);
  check("the ladder is named on the round", am.some((m) => m.roundName.includes("King court")), am.map((m) => m.roundName).join(" | "));
  check(
    "lower rungs are named as plain courts",
    am.some((m) => m.roundName.includes("Court 2")) && am.some((m) => m.roundName.includes("Court 3")),
    am.map((m) => m.roundName).join(" | ")
  );

  const opening = [...am].sort((a, b) => a.posIndex - b.posIndex);
  const openingKing = [...(opening[0].player1Members ?? []), ...(opening[0].player2Members ?? [])].map((p) => p.name);
  check("the first four start on the king court", JSON.stringify(openingKing) === JSON.stringify(["A", "D", "B", "C"]), JSON.stringify(openingKing));

  // --- play, checking movement between every pair of rounds ----------------
  for (let round = 1; round <= ROUNDS; round++) {
    s = await snap();
    const live = [...s.matches.filter((m) => m.bracket === "AM" && m.round === round)].sort((a, b) => a.posIndex - b.posIndex);
    check(`round ${round}: a match on every rung`, live.length === 3, `${live.length}`);

    const people = live.flatMap((m) => participantIds(m));
    check(`round ${round}: the whole field is on court`, new Set(people).size === PLAYERS.length, `${new Set(people).size}`);

    // Vary who wins so the ladder actually churns.
    for (const [i, m] of live.entries()) await playMatch(m.id, (round + i) % 2 === 0);

    if (round === ROUNDS) break;

    const after = await snap();
    const played = [...after.matches.filter((m) => m.bracket === "AM" && m.round === round)].sort((a, b) => a.posIndex - b.posIndex);
    const nextRound = [...after.matches.filter((m) => m.bracket === "AM" && m.round === round + 1)].sort((a, b) => a.posIndex - b.posIndex);
    check(`round ${round + 1}: generated`, nextRound.length === 3, `${nextRound.length}`);

    const occupantsOf = (m: MatchDTO) => new Set(participantIds(m));
    const res = played.map(sidesOf);

    // King court keeps its winners and takes the promoted pair from below.
    const king = occupantsOf(nextRound[0]);
    check(
      `round ${round}→${round + 1}: king court holds its winners and gains the promoted`,
      res[0].winners.every((p) => king.has(p)) && res[1].winners.every((p) => king.has(p)),
      `${[...king].length} occupants`
    );
    // Middle rung: relegated from above meet promoted from below.
    const middle = occupantsOf(nextRound[1]);
    check(
      `round ${round}→${round + 1}: middle takes the relegated and the promoted`,
      res[0].losers.every((p) => middle.has(p)) && res[2].winners.every((p) => middle.has(p))
    );
    // Bottom rung: losers stay, relegated arrive.
    const bottom = occupantsOf(nextRound[2]);
    check(
      `round ${round}→${round + 1}: bottom keeps its losers and takes the relegated`,
      res[2].losers.every((p) => bottom.has(p)) && res[1].losers.every((p) => bottom.has(p))
    );
    // And nobody partners the person they just climbed or fell with.
    const kingTeams = [nextRound[0].player1Members ?? [], nextRound[0].player2Members ?? []].map((t) => t.map((p) => p.id).sort().join("+"));
    check(
      `round ${round + 1}: the winning king-court pair is split up`,
      !kingTeams.includes([...res[0].winners].sort().join("+")),
      kingTeams.join(" v ")
    );
  }

  s = await snap();
  const all = s.matches.filter((m) => m.bracket === "AM");
  check("stops at the configured number of rounds", Math.max(...all.map((m) => m.round)) === ROUNDS);
  check("no round generated past the end", all.length === ROUNDS * 3, `${all.length}`);

  const table = computeStandings(s.matches);
  check("standings are individuals", table.length === PLAYERS.length, `${table.length}`);
  check("everyone played every round", table.every((r) => r.played === ROUNDS), table.map((r) => r.played).join(","));

  // --- undo ---------------------------------------------------------------
  const lastRung = all.filter((m) => m.round === ROUNDS)[0];
  await undoLastPoint(prisma, lastRung.id);
  s = await snap();
  check("undo reopens the match", s.matches.find((m) => m.id === lastRung.id)!.status !== "completed");

  const earlier = s.matches.filter((m) => m.bracket === "AM" && m.round === ROUNDS - 1);
  let threw = "";
  try {
    await undoLastPoint(prisma, earlier[0].id);
  } catch (e) {
    threw = e instanceof Error ? e.message : "?";
  }
  check("undo refuses while a later round is under way", threw.includes("later round"), threw || "(did not throw)");

  await finish();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  await finish();
  process.exitCode = 1;
});
