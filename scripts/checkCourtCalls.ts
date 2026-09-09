// When a court was called, and what may be put on one.
//
// Two faults in the same file, both invisible until an evening is running.
//
// `stampCalled` records when four people were called to a court and forgets it
// again when a match is bumped off. The forgetting used `NOT: { courtSlot:
// "current" }`, which Prisma emits as `NOT (courtSlot = 'current')` — SQL NULL,
// not TRUE, for a row whose slot is NULL. Every path that bumps a match fully
// off a court nulls the slot, so exactly the matches it was meant to forget were
// the ones it skipped. They kept a stamp from an earlier call, and since the
// stamping statement only stamps a match whose `calledAt` is null, it was never
// refreshed either — so a court called a moment ago read as long overdue and the
// big board shouted for players who were already walking over.
//
// `manualAssignCourt` checked that a match was not completed and that both sides
// were known, and a rotating format draws EVERY round at seeding time with both
// sides known. So a later round could be put on a court; and because the status
// ternary only promotes `ready`, it sat there as `pending` while taking points,
// invisible to the gating that decides when the next round may open.
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
  const { manualAssignCourt, rebalanceCourts } = await import("../src/lib/bracket/courts");

  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await prisma.court.deleteMany({});

  // A compass draw: sixteen entrants and eight playable matches against two
  // courts, so a match bumped off one genuinely stays off rather than being put
  // straight back, which is the case that was broken.
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
      courtIds: [2, 3],
    }
  );

  // --- a stamp must not outlive the call it recorded -------------------------
  await rebalanceCourts(prisma);
  const called = await prisma.match.findMany({ where: { calledAt: { not: null } }, select: { id: true, courtSlot: true } });
  check("matches at the front of a court are stamped", called.length > 0, `${called.length} stamped`);
  check("...and only those at the front", called.every((m) => m.courtSlot === "current"));

  // The state every bump path actually leaves: no court, no slot, and a stamp
  // from when it WAS called. Both courts are held by matches already under way,
  // so the rebalance cannot simply put it back and hide the case.
  const holders = await prisma.match.findMany({ where: { courtSlot: "current" }, select: { id: true } });
  for (const h of holders) await prisma.match.update({ where: { id: h.id }, data: { status: "in_progress" } });

  const victim = await prisma.match.findFirstOrThrow({ where: { courtSlot: null, status: "ready" } });
  const stale = new Date(Date.now() - 20 * 60 * 1000);
  await prisma.match.update({
    where: { id: victim.id },
    data: { courtId: null, courtSlot: null, status: "ready", calledAt: stale },
  });

  await rebalanceCourts(prisma);

  const after = await prisma.match.findUniqueOrThrow({ where: { id: victim.id }, select: { calledAt: true, courtSlot: true } });
  check("a match with no court slot is off a court", after.courtSlot !== "current", String(after.courtSlot));
  check(
    "...and forgets when it was called, rather than keeping a stamp from before",
    after.calledAt === null,
    after.calledAt ? `kept ${after.calledAt.toISOString()}` : "cleared"
  );

  // --- what may be put on a court -------------------------------------------
  // A rotating draw, because it is the one that holds later rounds already
  // paired up and waiting to be let out.
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await prisma.court.deleteMany({});
  await seedTournament(prisma, ["A", "B", "C", "D", "E", "F", "G", "H"], {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: 16,
    serveEvery: 4,
    raceWinBy: 0,
    amRounds: 4,
    pin: "1234",
    format: "americano",
    discipline: "doubles",
    courtIds: [2, 3],
  });
  await rebalanceCourts(prisma);

  const later = await prisma.match.findFirst({
    where: { status: "pending", player1Id: { not: null }, player2Id: { not: null } },
    orderBy: [{ round: "desc" }, { posIndex: "asc" }],
  });
  check("a rotating draw really does hold later rounds with both sides known", !!later, later ? `round ${later.round}` : "(none)");

  if (later) {
    let refused = "";
    await manualAssignCourt(prisma, later.id, 2, "current").catch((e) => (refused = String(e.message)));
    check("a round that has not been let out cannot be put on a court", refused !== "", refused || "(accepted)");
    check("...and says why, in words an organiser can act on", /let out|finish the round/i.test(refused), refused);
    const untouched = await prisma.match.findUniqueOrThrow({ where: { id: later.id } });
    check("...and the match is left where it was", untouched.courtId === null && untouched.status === "pending");
  }

  // A round that IS out can still be placed, which is the whole point of the
  // control room's "Change".
  const playable = await prisma.match.findFirst({ where: { status: { in: ["ready", "scheduled"] }, player1Id: { not: null } } });
  if (playable) {
    let broke = "";
    await manualAssignCourt(prisma, playable.id, 3, "current").catch((e) => (broke = String(e.message)));
    check("a playable match can still be moved onto a court", broke === "", broke);
  }

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
