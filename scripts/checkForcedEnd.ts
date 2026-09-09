// Ending a match early, and getting it wrong.
//
// A retirement or a no-show is recorded by naming the winner. Naming the wrong
// one used to be permanent: re-running the force-end fell through to
// `completeMatch`, which refuses a match that is already completed;
// `applyManualScore` refuses one too; and undo opens with "No points to undo",
// which is exactly the walkover case, where there are none. So a no-show
// awarded to the wrong entrant could not be taken back by any write path the
// app exposes — and it had already sent that entrant into the next round.
//
// Correcting it is taking the first decision back and making the other one:
// retract the propagation, reopen the row, complete it the other way.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
const DEV_DB = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
process.env.POSTGRES_PRISMA_URL = DEV_DB;
process.env.POSTGRES_URL_NON_POOLING = DEV_DB;
process.env.DATABASE_URL = DEV_DB;

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { seedTournament } = await import("../src/lib/bracket/seed");
  const { forceEndMatch, scorePoint } = await import("../src/lib/bracket/routing");

  const wipe = async () => {
    await prisma.pointEvent.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.tournamentConfig.deleteMany({});
  };

  // A compass draw, because it propagates: the winner goes on to the next round
  // and the loser drops into the consolation side, so a wrong call moves two
  // people to the wrong places.
  await wipe();
  await seedTournament(
    prisma,
    Array.from({ length: 16 }, (_, i) => `P${i + 1}`),
    {
      bestOfSets: 1,
      tiebreakMode: "standard",
      raceTarget: 0,
      serveEvery: 0,
      raceWinBy: 0,
      amRounds: 0,
      pin: "1234",
      format: "compass",
      discipline: "doubles",
      courtIds: [1, 2],
    }
  );

  const m = await prisma.match.findFirstOrThrow({
    where: { player1Id: { not: null }, player2Id: { not: null }, feedWinnerMatchId: { not: null } },
    orderBy: { posIndex: "asc" },
  });
  const side1 = m.player1Id!;
  const side2 = m.player2Id!;

  // --- a no-show, called for the wrong side ----------------------------------
  await forceEndMatch(prisma, m.id, 1, "No show");
  let row = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
  check("the walkover is recorded", row.status === "completed" && row.winnerId === side1);
  check("...with no points at all, which is what used to trap it", (await prisma.pointEvent.count({ where: { matchId: m.id } })) === 0);

  const next = await prisma.match.findUniqueOrThrow({ where: { id: m.feedWinnerMatchId! } });
  const nextSlot = m.feedWinnerSlot === 1 ? next.player1Id : next.player2Id;
  check("...and the winner has already gone through", nextSlot === side1, String(nextSlot));

  // --- the organiser corrects it ---------------------------------------------
  let threw = "";
  await forceEndMatch(prisma, m.id, 2, "No show — wrong side called").catch((e) => (threw = String(e.message)));
  check("calling it the other way is accepted", threw === "", threw);

  row = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
  check("the result now names the other entrant", row.winnerId === side2, `${row.winnerId === side1 ? "still side 1" : row.winnerId}`);
  check("...and it is still a forced end", row.forcedEnd === true);
  check("...with the reason that was given", row.forcedEndReason === "No show — wrong side called", String(row.forcedEndReason));

  const nextAfter = await prisma.match.findUniqueOrThrow({ where: { id: m.feedWinnerMatchId! } });
  const nextSlotAfter = m.feedWinnerSlot === 1 ? nextAfter.player1Id : nextAfter.player2Id;
  check("the next round holds the corrected winner, not both", nextSlotAfter === side2, String(nextSlotAfter));

  // Repeating the SAME call must still be a no-op rather than a second
  // propagation — that is what made it safe to retry over bad wifi.
  const again = await forceEndMatch(prisma, m.id, 2, "No show — wrong side called");
  check("repeating the same call changes nothing", again.alreadyEnded === true);

  // --- a retirement with points on the board corrects too --------------------
  const other = await prisma.match.findFirstOrThrow({
    where: { player1Id: { not: null }, player2Id: { not: null }, id: { not: m.id }, status: { not: "completed" } },
    orderBy: { posIndex: "asc" },
  });
  await scorePoint(prisma, other.id, 1);
  await scorePoint(prisma, other.id, 2);
  await forceEndMatch(prisma, other.id, 1, "Rolled an ankle");
  await forceEndMatch(prisma, other.id, 2, "Rolled an ankle — other side");
  const otherRow = await prisma.match.findUniqueOrThrow({ where: { id: other.id } });
  check("a retirement can be corrected as well", otherRow.winnerId === other.player2Id, String(otherRow.winnerId));
  check("...and the points played are still there", (await prisma.pointEvent.count({ where: { matchId: other.id } })) === 2);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
