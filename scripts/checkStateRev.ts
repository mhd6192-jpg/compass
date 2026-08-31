// The polling revision, against the real database.
//
// This exists because of one asymmetry. If the revision changes when nothing
// did, the cost is a wasted rebuild — invisible. If it fails to change when
// something did, a TV stops updating for the rest of the night and nobody can
// see why. So every check below is of the second kind: do something a screen
// would show, and insist the revision moves.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint, undoLastPoint } from "../src/lib/bracket/routing";
import { computeStateRev } from "../src/lib/stateRev";
import { writeCourtStage, runCeremonyAction } from "../src/lib/v2/server";
import type { MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const rev = () => computeStateRev(prisma);

/** Runs `act`, and insists the revision is different afterwards. */
async function moves(name: string, act: () => Promise<unknown>) {
  const before = await rev();
  await act();
  const after = await rev();
  check(name, before !== after, before === after ? `unchanged: ${after}` : "");
  return after;
}

async function matches(): Promise<MatchDTO[]> {
  const s = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
  return s.matches;
}

async function main() {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});

  // --- seeding ---------------------------------------------------------------
  await moves("seeding a tournament moves the revision", () =>
    seedTournament(prisma, ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"], {
      bestOfSets: 1,
      tiebreakMode: "race-to-16",
      raceTarget: 16,
      amRounds: 3,
      pin: "1234",
      format: "americano",
      courtIds: [2, 3],
    })
  );

  // --- stability: the same state gives the same answer ------------------------
  const a = await rev();
  const b = await rev();
  const c = await rev();
  check("an unchanged database gives a stable revision", a === b && b === c, `${a} / ${b} / ${c}`);
  check("the revision is short enough to put in a query string", a.length < 80, `${a.length} chars`);

  const live = (await matches()).filter((m) => m.courtId !== null);
  const target = live[0];

  // --- the things that actually happen during a night ------------------------
  await moves("scoring a point moves it", () => scorePoint(prisma, target.id, 1));
  await moves("scoring for the other side moves it", () => scorePoint(prisma, target.id, 2));
  await moves("undoing moves it", () => undoLastPoint(prisma, target.id));

  // The trap: undo then score to the OTHER side. Same number of points as
  // before the undo, different score — a revision built on counts would miss it.
  const beforeSwap = await rev();
  await undoLastPoint(prisma, target.id);
  await scorePoint(prisma, target.id, 2);
  const afterSwap = await rev();
  const dto = (await matches()).find((m) => m.id === target.id)!;
  check(
    "undo-then-score-the-other-way moves it (same count, different score)",
    beforeSwap !== afterSwap,
    `score now ${JSON.stringify(dto.state.currentGame?.points)}`
  );

  await moves("putting a court on air moves it", () =>
    writeCourtStage(prisma, target.courtId!, { stage: "live", activeMatchId: target.id })
  );
  await moves("taking it off air moves it", () => writeCourtStage(prisma, target.courtId!, { stage: "idle" }));

  await moves("renaming a player moves it", () =>
    prisma.player.update({ where: { id: (target.player1Members ?? [])[0].id }, data: { name: "Anastasia" } })
  );

  await moves("moving a match to another court moves it", () =>
    prisma.match.update({ where: { id: target.id }, data: { courtId: 3, courtSlot: "current" } })
  );

  await moves("changing the tournament settings moves it", () =>
    prisma.tournamentConfig.updateMany({ data: { raceTarget: 21 } })
  );

  // --- completing a match, which changes several things at once ---------------
  const finish = (await matches()).find((m) => m.status !== "completed" && m.courtId !== null)!;
  await moves("finishing a match moves it", async () => {
    for (let i = 0; i < 25; i++) {
      const r = await scorePoint(prisma, finish.id, 1);
      if (r.completed) return;
    }
  });

  // --- the ceremony -----------------------------------------------------------
  await moves("configuring the ceremony moves it", () =>
    runCeremonyAction(prisma, "configure", { places: [3, 2, 1] })
  );
  await moves("starting the ceremony moves it", () => runCeremonyAction(prisma, "start"));
  const beforeNext = await rev();
  await runCeremonyAction(prisma, "next", { expectedRev: undefined });
  check("revealing the next award moves it", beforeNext !== (await rev()));

  // --- and one last stability check, after all that ---------------------------
  const x = await rev();
  const y = await rev();
  check("still stable when nothing is happening", x === y, `${x} / ${y}`);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
